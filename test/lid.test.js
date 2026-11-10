/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lid.test.js — La misma persona con dos identificadores.
//
//  WhatsApp puede mandar al usuario como teléfono (`521…@s.whatsapp.net`)
//  o como LID (`123…@lid`). Lo que aquí se vigila:
//
//   1. La llave de la base es el teléfono cuando se conoce.
//   2. La pareja se aprende del propio mensaje y del grupo, y sobrevive
//      a un reinicio (tabla `identities`).
//   3. Los permisos (admin / dueño) funcionan aunque el mensaje llegue
//      por la cara que no está comparando el otro lado.
//   4. Al aprender la pareja, las cuentas guardadas con el LID se mueven
//      a la del teléfono y, si existían las dos, se SUMAN (sin que nadie
//      pueda reclamar dos veces la diaria).
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseSync } from "../src/storage/sqlite-compat.js";
import * as lid from "../src/lib/lid.js";
import { crearBackendIdentidades, fusionarCuentas } from "../src/storage/identities.js";
import { serializeMessage, isAdmin, normalizeJid } from "../src/serialize.js";
import { buildCommandContext } from "../src/commands/context.js";

const PN = "5215574370309@s.whatsapp.net";
const LID = "123456789012345@lid";

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shin-lid-"));
}

/** Base temporal con las tablas que toca la fusión. */
function baseTemporal() {
  const dir = carpetaTemporal();
  const db = new DatabaseSync(path.join(dir, "shin.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      jid TEXT PRIMARY KEY, name TEXT, banned INTEGER DEFAULT 0, warned INTEGER DEFAULT 0,
      first_seen INTEGER DEFAULT 0, last_seen INTEGER DEFAULT 0,
      coins INTEGER DEFAULT 0, bank INTEGER DEFAULT 0, exp INTEGER DEFAULT 0,
      health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100, streak INTEGER DEFAULT 0,
      last_daily_global INTEGER DEFAULT 0, marry TEXT DEFAULT '', favorite TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS g_users (
      id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0, level INTEGER DEFAULT 0,
      usedcommands INTEGER DEFAULT 0, favorite TEXT DEFAULT '', streak INTEGER DEFAULT 0,
      lastDailyGlobal INTEGER DEFAULT 0, metadatos TEXT
    );
    CREATE TABLE IF NOT EXISTS g_chat_users (
      chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT 0, bank INTEGER DEFAULT 0,
      lastdaily INTEGER DEFAULT 0, health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100,
      inventory TEXT DEFAULT '{}', tools TEXT DEFAULT '{}', weapons TEXT DEFAULT '{}',
      warnings TEXT DEFAULT '[]', characters TEXT DEFAULT '[]', favorite TEXT DEFAULT '',
      PRIMARY KEY (chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS economy_timers (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender TEXT NOT NULL,
      last_daily INTEGER NOT NULL DEFAULT 0, last_work INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_characters (
      user_jid TEXT NOT NULL, char_id TEXT NOT NULL, chat_id TEXT,
      claimed_at INTEGER NOT NULL, favorite INTEGER DEFAULT 0, sale_price INTEGER DEFAULT 0,
      PRIMARY KEY (user_jid, char_id)
    );
  `);
  return {
    db,
    cerrar() {
      try { db.close(); } catch { /* ya cerrada */ }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function sockFalso(extra = {}) {
  return {
    user: { id: "5215500000000:4@s.whatsapp.net" },
    async sendMessage() { return { key: { id: "X" } }; },
    async groupMetadata() { return null; },
    ...extra,
  };
}

function mensaje(texto, key = {}) {
  return {
    key: {
      remoteJid: PN,
      fromMe: false,
      id: "M" + Math.random().toString(36).slice(2),
      ...key,
    },
    message: { conversation: texto },
    pushName: "Prueba",
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

// ─── JID ────────────────────────────────────────────────────────────

test("normalizeJid: el LID conserva su dominio y pierde el dispositivo", () => {
  assert.equal(normalizeJid("123456789012345:4@lid"), "123456789012345@lid");
  assert.equal(normalizeJid("123456789012345@hosted.lid"), "123456789012345@hosted.lid");
  assert.equal(normalizeJid("5215574370309:12@s.whatsapp.net"), "5215574370309@s.whatsapp.net");
  assert.equal(normalizeJid("120363000000000000@g.us"), "120363000000000000@g.us");
});

// ─── Resolver ───────────────────────────────────────────────────────

test("sin pareja conocida, la llave es el LID (no se pierde el mensaje)", () => {
  lid.reiniciar();
  const id = lid.resolver(LID);
  assert.equal(id.key, LID);
  assert.equal(id.pn, "");
});

test("al aprender la pareja, la llave pasa a ser el teléfono", () => {
  lid.reiniciar();
  assert.equal(lid.aprender(LID, PN), true);
  assert.equal(lid.aprender(LID, PN), false, "aprender dos veces no es una pareja nueva");
  assert.equal(lid.resolver(LID).key, PN);
  assert.equal(lid.resolver(PN).lid, LID);
  assert.equal(lid.resolver(PN).key, PN);
});

test("el mensaje de grupo y el privado enseñan la pareja por su cuenta", () => {
  lid.reiniciar();
  lid.aprenderDeMensaje({ participant: LID, participantPn: PN });
  assert.equal(lid.pnDeLid(LID), PN);

  lid.reiniciar();
  lid.aprenderDeMensaje({ remoteJid: LID, senderPn: PN });
  assert.equal(lid.pnDeLid(LID), PN);

  lid.reiniciar();
  lid.aprenderDeMensaje({ participant: PN, participantLid: LID });
  assert.equal(lid.lidDePn(PN), LID);
});

test("mismaPersona: teléfono y LID de la misma persona, y la regla 521 = 52", () => {
  lid.reiniciar();
  lid.aprender(LID, PN);
  assert.equal(lid.mismaPersona(LID, PN), true);
  assert.equal(lid.mismaPersona("5215574370309@s.whatsapp.net", "525574370309@s.whatsapp.net"), true);
  assert.equal(lid.mismaPersona(LID, "5215500000000@s.whatsapp.net"), false);
});

test("serializeMessage usa el teléfono cuando viaja pegado al LID", () => {
  lid.reiniciar();
  const sock = sockFalso();

  const privado = serializeMessage(mensaje("hola", { remoteJid: LID, senderPn: PN }), sock);
  assert.equal(privado.senderId, PN);
  assert.equal(privado.senderLid, LID);

  const grupo = serializeMessage(
    mensaje(".ping", { remoteJid: "120363000000000000@g.us", participant: LID, participantPn: PN }),
    sock
  );
  assert.equal(grupo.senderId, PN);
  assert.equal(grupo.isGroup, true);
});

test("si el mensaje llega solo como LID, se usa lo aprendido antes", () => {
  lid.reiniciar();
  lid.aprender(LID, PN);
  const ctx = serializeMessage(mensaje("hola", { remoteJid: LID }), sockFalso());
  assert.equal(ctx.senderId, PN);
});

// ─── Permisos ───────────────────────────────────────────────────────

test("isAdmin reconoce al admin en un grupo direccionado por LID", async () => {
  lid.reiniciar();
  const meta = {
    participants: [
      { id: LID, jid: PN, lid: LID, admin: "admin" },
      { id: "999999999999999@lid", jid: "5215500000001@s.whatsapp.net", lid: "999999999999999@lid", admin: null },
    ],
  };
  const sock = sockFalso({ groupMetadata: async () => meta });

  // El remitente llega con su teléfono (como hace Baileys con participant_pn).
  assert.equal(await isAdmin(sock, "120363000000000000@g.us", PN), true);
  // Y si llega con el LID, también.
  assert.equal(await isAdmin(sock, "120363000000000000@g.us", LID), true);
  // Alguien que no es admin sigue sin serlo.
  assert.equal(await isAdmin(sock, "120363000000000000@g.us", "5215500000001@s.whatsapp.net"), false);
});

test("el dueño sigue siendo dueño aunque escriba desde un chat LID", async () => {
  lid.reiniciar();
  const engine = { getOwnerJid: () => PN };
  const sock = sockFalso();

  // Solo se conoce el LID: en el mensaje no viene el teléfono.
  const ctx = serializeMessage(mensaje(".daily", { remoteJid: LID }), sock);
  const { msg } = await buildCommandContext(sock, ctx, engine);
  assert.equal(msg.isOwner, false, "sin pareja aprendida no se puede adivinar");

  // En cuanto WhatsApp manda la pareja (o el grupo la trae), se reconoce.
  lid.aprender(LID, PN);
  const ctx2 = serializeMessage(mensaje(".daily", { remoteJid: LID }), sock);
  const { msg: msg2 } = await buildCommandContext(sock, ctx2, engine);
  assert.equal(msg2.isOwner, true);
});

// ─── Persistencia ───────────────────────────────────────────────────

test("la pareja sobrevive a un reinicio (tabla identities)", () => {
  const base = baseTemporal();
  try {
    lid.reiniciar();
    lid.conectarBackend(crearBackendIdentidades(base.db));
    lid.aprender(LID, PN);

    // Simula un reinicio del bot: memoria vacía, misma base.
    lid.reiniciar();
    lid.conectarBackend(crearBackendIdentidades(base.db));
    assert.equal(lid.pnDeLid(LID), PN);
    assert.equal(lid.estadisticas().guardadas, 1);
  } finally {
    lid.reiniciar();
    base.cerrar();
  }
});

// ─── Fusión de cuentas ──────────────────────────────────────────────

test("fusión: si solo existe la cuenta del LID, se mueve al teléfono", () => {
  const base = baseTemporal();
  try {
    const { db } = base;
    db.prepare("INSERT INTO g_chat_users (chat_id, user_id, coins, bank) VALUES (?, ?, ?, ?)")
      .run("grupo@g.us", LID, 40, 10);
    db.prepare("INSERT INTO g_users (id, exp) VALUES (?, ?)").run(LID, 30);

    assert.equal(fusionarCuentas(db, LID, PN), true);

    const fila = db.prepare("SELECT * FROM g_chat_users WHERE user_id = ?").get(PN);
    assert.equal(fila.coins, 40);
    assert.equal(fila.bank, 10);
    assert.equal(db.prepare("SELECT * FROM g_chat_users WHERE user_id = ?").get(LID), undefined);
    assert.equal(db.prepare("SELECT * FROM g_users WHERE id = ?").get(PN).exp, 30);
  } finally {
    base.cerrar();
  }
});

test("fusión: si existen las dos, se suman monedas y se conserva el premio más reciente", () => {
  const base = baseTemporal();
  try {
    const { db } = base;
    const ins = db.prepare("INSERT INTO g_chat_users (chat_id, user_id, coins, bank, lastdaily, inventory, warnings) VALUES (?, ?, ?, ?, ?, ?, ?)");
    ins.run("grupo@g.us", LID, 10, 5, 1000, '{"pico":1}', '["a"]');
    ins.run("grupo@g.us", PN, 2, 1, 5000, '{"pico":2,"caña":1}', '["b"]');

    assert.equal(fusionarCuentas(db, LID, PN), true);

    const fila = db.prepare("SELECT * FROM g_chat_users WHERE chat_id = ? AND user_id = ?").get("grupo@g.us", PN);
    assert.equal(fila.coins, 12, "las monedas se suman");
    assert.equal(fila.bank, 6, "el banco se suma");
    assert.equal(fila.lastdaily, 5000, "la marca del daily queda en la más reciente");
    assert.deepEqual(JSON.parse(fila.inventory), { pico: 3, caña: 1 });
    assert.deepEqual(JSON.parse(fila.warnings).sort(), ["a", "b"]);
    assert.equal(db.prepare("SELECT * FROM g_chat_users WHERE user_id = ?").get(LID), undefined);
  } finally {
    base.cerrar();
  }
});

test("fusión: temporizadores y personajes no se duplican", () => {
  const base = baseTemporal();
  try {
    const { db } = base;
    db.prepare("INSERT INTO economy_timers (id, chat_id, sender, last_daily) VALUES (?, ?, ?, ?)")
      .run("grupo@g.us:" + LID, "grupo@g.us", LID, 100);
    db.prepare("INSERT INTO economy_timers (id, chat_id, sender, last_daily) VALUES (?, ?, ?, ?)")
      .run("grupo@g.us:" + PN, "grupo@g.us", PN, 900);
    db.prepare("INSERT INTO user_characters (user_jid, char_id, claimed_at) VALUES (?, ?, ?)")
      .run(LID, "rem", 10);
    db.prepare("INSERT INTO user_characters (user_jid, char_id, claimed_at) VALUES (?, ?, ?)")
      .run(PN, "rem", 20);

    fusionarCuentas(db, LID, PN);

    const timers = db.prepare("SELECT * FROM economy_timers").all();
    assert.equal(timers.length, 1);
    assert.equal(timers[0].sender, PN);
    assert.equal(timers[0].last_daily, 900);

    const personajes = db.prepare("SELECT * FROM user_characters").all();
    assert.equal(personajes.length, 1);
    assert.equal(personajes[0].user_jid, PN);
  } finally {
    base.cerrar();
  }
});

test("fusión: una base sin las tablas de economía no rompe nada", () => {
  const dir = carpetaTemporal();
  const db = new DatabaseSync(path.join(dir, "vacia.db"));
  try {
    assert.equal(fusionarCuentas(db, LID, PN), false);
  } finally {
    try { db.close(); } catch { /* ya cerrada */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("aprender con backend fusiona las cuentas en el acto", () => {
  const base = baseTemporal();
  try {
    base.db.prepare("INSERT INTO g_chat_users (chat_id, user_id, coins) VALUES (?, ?, ?)")
      .run("grupo@g.us", LID, 7);
    lid.reiniciar();
    lid.conectarBackend(crearBackendIdentidades(base.db));
    lid.aprender(LID, PN);
    const fila = base.db.prepare("SELECT * FROM g_chat_users WHERE user_id = ?").get(PN);
    assert.equal(fila.coins, 7);
  } finally {
    lid.reiniciar();
    base.cerrar();
  }
});

// ─── La base de usuarios ────────────────────────────────────────────

test("la economía guarda al usuario con una sola llave (LID = teléfono)", async () => {
  const dir = carpetaTemporal();
  process.env.SHIN_DB_PATH = path.join(dir, "shin.db");
  try {
    lid.reiniciar();
    lid.aprender(LID, PN); // la pareja ya se conoce

    // Se importa aquí para que la base se cree en la carpeta temporal.
    const { default: db } = await import("../src/services/ginko-db.js");
    const chat = "120363000000000000@g.us";

    // Se escribe con el LID...
    db.setChatUser(chat, LID, "coins", 25);
    db.setUser(LID, "name", "Shin");

    // ...y se lee con el teléfono: es la misma fila.
    assert.equal(db.getChatUser(chat, PN).coins, 25);
    assert.equal(db.getUser(PN).name, "Shin");
  } finally {
    try {
      const { getDatabase } = await import("../src/storage/database.js");
      getDatabase().close();
    } catch { /* la base pudo no haberse abierto */ }
    delete process.env.SHIN_DB_PATH;
    lid.reiniciar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Conector (Baileys 7) ───────────────────────────────────────────
//
// La 7.x cambió los nombres de los campos de la clave y, sobre todo, guarda
// las parejas en su propio auth state. Estas pruebas fijan las dos cosas:
// que el bot entiende la clave nueva y que sabe preguntarle al conector.

test("parejaDeClave entiende la clave de la 7.x y la de la 6.x", () => {
  // 7.x: el chat de grupo va direccionado por LID; el teléfono viene en Alt.
  assert.deepEqual(
    lid.parejaDeClave({ remoteJid: "120363000000000000@g.us", participant: LID, participantAlt: PN }),
    { lid: LID, pn: PN }
  );
  // 7.x privado: el propio chat es el LID y el Alt trae el teléfono.
  assert.deepEqual(lid.parejaDeClave({ remoteJid: LID, remoteJidAlt: PN }), { lid: LID, pn: PN });
  // 6.x: los nombres viejos siguen entendiéndose.
  assert.deepEqual(lid.parejaDeClave({ remoteJid: LID, senderPn: PN }), { lid: LID, pn: PN });
  // Nada que aprender: un grupo normal, sin caras alternativas.
  assert.deepEqual(lid.parejaDeClave({ remoteJid: "120363000000000000@g.us" }), { lid: "", pn: "" });
});

test("un estado con dos personas en la clave no mezcla sus identidades", () => {
  // Caso real del protocolo (issue #2652): en <status> convive el autor
  // (participant + participantAlt) con el destinatario del estado
  // (remoteJidAlt). Emparejar por "primer LID / primer teléfono" uniría a
  // dos desconocidos y fusionaría sus economías.
  const autorLid = "111111111111111@lid";
  const autorPn = "5215500000001@s.whatsapp.net";
  const otroPn = "5215500000002@s.whatsapp.net";

  const pareja = lid.parejaDeClave({
    remoteJid: "status@broadcast",
    participant: autorLid,
    participantAlt: autorPn,
    remoteJidAlt: otroPn,
  });
  assert.deepEqual(pareja, { lid: autorLid, pn: autorPn });

  // Y al revés: el autor llega con teléfono y su LID en el alternativo.
  assert.deepEqual(
    lid.parejaDeClave({ participant: autorPn, participantAlt: autorLid }),
    { lid: autorLid, pn: autorPn }
  );
});

test("serializeMessage aprende la pareja desde participantAlt", () => {
  lid.reiniciar();
  const grupo = serializeMessage(
    mensaje(".ping", { remoteJid: "120363000000000000@g.us", participant: LID, participantAlt: PN }),
    sockFalso()
  );
  assert.equal(grupo.senderId, PN);
  assert.equal(lid.pnDeLid(LID), PN);

  const privado = serializeMessage(mensaje("hola", { remoteJid: LID, remoteJidAlt: PN }), sockFalso());
  assert.equal(privado.senderId, PN);
});

/** Conector falso con el mismo contrato que signalRepository.lidMapping. */
function conectorFalso(almacen = {}) {
  const consultas = { pn: 0, lid: 0 };
  return {
    consultas,
    signalRepository: {
      lidMapping: {
        async getPNForLID(jid) {
          consultas.pn++;
          return almacen[jid] || null;
        },
        async getLIDForPN(jid) {
          consultas.lid++;
          return almacen[jid] || null;
        },
      },
    },
  };
}

test("el conector contesta el teléfono de un LID (consulta local, sin red)", async () => {
  lid.reiniciar();
  const conector = conectorFalso({ [LID]: "5215574370309:12@s.whatsapp.net" });
  lid.conectarSesion(conector);

  const pn = await lid.resolverConector(LID);
  assert.equal(pn, PN, "normaliza el sufijo de dispositivo que devuelve Baileys");
  assert.equal(lid.clave(LID), PN, "y la llave del usuario ya es el teléfono");

  // La dirección que sale a internet no se toca en el camino normal.
  assert.equal(await lid.resolverConector(PN), "");
  assert.equal(conector.consultas.lid, 0);
  assert.equal(lid.estadisticas().conector, true);
});

test("teléfono → LID solo se pregunta cuando se pide a propósito", async () => {
  lid.reiniciar();
  const conector = conectorFalso({ [PN]: "123456789012345:3@lid" });
  lid.conectarSesion(conector);

  const lidJid = await lid.resolverConector(PN, { red: true });
  assert.equal(lidJid, LID);
  assert.equal(conector.consultas.lid, 1);
});

test("sin conector no se rompe nada y el bot sigue con lo aprendido", async () => {
  lid.reiniciar();
  assert.equal(await lid.resolverConector(LID), "");
  assert.doesNotThrow(() => lid.refrescarDesdeConector({ remoteJid: LID }));
  assert.equal(lid.estadisticas().conector, false);

  lid.aprender(LID, PN);
  assert.equal(lid.clave(LID), PN);
});

test("refrescarDesdeConector completa lo que el mensaje no trajo", async () => {
  lid.reiniciar();
  const conector = conectorFalso({ [LID]: PN });
  lid.conectarSesion(conector);

  // El mensaje solo trae el LID: se pregunta en segundo plano...
  lid.refrescarDesdeConector({ remoteJid: LID });
  assert.equal(lid.clave(LID), LID, "todavía no: la consulta es asíncrona");

  // ...y en cuanto contesta, la llave cambia sola.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(lid.clave(LID), PN);
  assert.equal(conector.consultas.pn, 1);
});

test("reiniciar() también suelta el conector", async () => {
  lid.reiniciar();
  lid.conectarSesion(conectorFalso({ [LID]: PN }));
  assert.equal(lid.estadisticas().conector, true);
  lid.reiniciar();
  assert.equal(lid.estadisticas().conector, false);
});

test("fusión: el cooldown Subs (epoch ms) conserva el más reciente y nunca se suma", () => {
  const base = baseTemporal();
  try {
    const { db } = base;
    db.exec("ALTER TABLE g_users ADD COLUMN Subs INTEGER DEFAULT 0");
    const ts1 = 1_780_000_000_000;
    const ts2 = 1_780_000_050_000;
    db.prepare("INSERT INTO g_users (id, Subs) VALUES (?, ?)").run(LID, ts1);
    db.prepare("INSERT INTO g_users (id, Subs) VALUES (?, ?)").run(PN, ts2);

    assert.equal(fusionarCuentas(db, LID, PN), true);
    const fila = db.prepare("SELECT Subs FROM g_users WHERE id = ?").get(PN);
    assert.equal(fila.Subs, ts2, "Subs debe quedar en el timestamp más reciente, no sumado");
  } finally {
    base.cerrar();
  }
});

test("esDuenoSocket reconoce dueño del socket incluso vía LID", async () => {
  const { esDuenoSocket } = await import("../src/commands/middleware/permissions.js");
  lid.reiniciar();
  try {
    lid.aprender(LID, PN);
    const sock = sockFalso({ user: { id: "5215500000000:4@s.whatsapp.net" } });
    assert.equal(esDuenoSocket(sock, LID, { owner: PN }), true);
    assert.equal(esDuenoSocket(sock, "5215599999999@s.whatsapp.net", { owner: PN }), false);
  } finally {
    lid.reiniciar();
  }
});

test("ginko-db: setSettings(false), getChatUsers, personajes, sticker packs y deletedb", async () => {
  const dir = carpetaTemporal();
  process.env.SHIN_DB_PATH = path.join(dir, "shin.db");
  try {
    const { default: db } = await import("../src/services/ginko-db.js");

    const botId = "5215500000000@s.whatsapp.net";
    db.setSettings(botId, "self", true);
    assert.equal(db.getSettings(botId).self, 1);
    db.setSettings(botId, "self", false);
    assert.equal(db.getSettings(botId).self, 0, "setSettings(false) debe guardar 0, no ignorarse");

    const chat = "120363000000000001@g.us";
    db.setChatUser(chat, PN, "coins", 77);
    const lista = db.getChatUsers(chat);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].coins, 77);

    db.setCreate("g_characters", "c1", "name", "Shin");
    assert.equal(db.getCharacter("c1").name, "Shin");
    db.setCharacter("c1", "value", 200);
    assert.equal(db.getCharacter("c1").value, 200);

    db.setStickersPack("p1", "packs", [{ name: "Pack1", stickers: ["s1"] }]);
    assert.deepEqual(db.getStickersPack("p1").packs[0].stickers, ["s1"]);
    db.setStickersPack("p1", [{ name: "Pack2", stickers: ["s2"] }]);
    assert.equal(db.getStickersPack("p1").packs[0].name, "Pack2");

    assert.equal(db.deletedb("g_characters", "c1").changes, 1);
    assert.equal(db.getCharacter("c1"), null);
  } finally {
    try {
      const { getDatabase } = await import("../src/storage/database.js");
      getDatabase().close();
    } catch { /* ya cerrada */ }
    delete process.env.SHIN_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("auth: keys.set borra claves con null/undefined dentro de transacción", async () => {
  const { useSQLiteAuthState } = await import("../src/core/auth.js");
  const dir = carpetaTemporal();
  const res = await useSQLiteAuthState(dir);
  try {
    await res.state.keys.set({ session: { k1: { ok: 1 }, k2: { ok: 2 } } });
    assert.deepEqual(await res.state.keys.get("session", ["k1", "k2"]), { k1: { ok: 1 }, k2: { ok: 2 } });
    await res.state.keys.set({ session: { k1: null, k2: undefined } });
    assert.deepEqual(await res.state.keys.get("session", ["k1", "k2"]), {});
  } finally {
    res.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
