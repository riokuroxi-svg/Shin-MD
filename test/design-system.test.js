/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Sistema de diseño — Tanda 1
 *  · theme.js: cajas, estados, iconos y banner por hora
 *  · menú nativo: ya NO se envuelve en viewOnce (los botones se perdían
 *    en WhatsApp Web) y se puede recuperar el comportamiento viejo
 *  · .pin / .unpin: payload exacto que espera baileys
 *  · .owner: vCard válido y botones correctos
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  COLORS, BRAND, categoryIcon, title, label, kv, note, footer,
  boxMain, boxData, boxNotice, state, stateKinds,
  bannerMode, listBanners, pickBanner,
} from "../src/lib/theme.js";
import { buildNativeMenuContent } from "../src/lib/native-menu.js";
import pinCmd, { parseDuracion, buildPinPayload } from "../cmds/group/pin.js";
import ownerCmd, { buildOwnerVCard, buildOwnerButtons, ownerDigits } from "../cmds/main/owner.js";

// ── theme: fundamentos ──────────────────────────────────────────────

test("theme: paleta y marca congeladas (nadie las pisa en caliente)", () => {
  assert.equal(COLORS.pink, "#FF4FA3");
  assert.equal(Object.isFrozen(COLORS), true);
  assert.equal(Object.isFrozen(BRAND), true);
  assert.equal(BRAND.kanji, "反魂");
  for (const c of [COLORS.pink, COLORS.cyan, COLORS.danger]) {
    assert.match(c, /^#[0-9A-F]{6}$/, `${c} debe ser hex de 6 dígitos`);
  }
});

test("theme: cada categoría tiene su icono y las desconocidas no revientan", () => {
  assert.equal(categoryIcon("downloads"), "📥");
  assert.equal(categoryIcon("GACHA"), "🎴");      // insensible a mayúsculas
  assert.equal(categoryIcon("economy"), categoryIcon("economia")); // alias coherentes
  assert.equal(categoryIcon("no-existe"), "✦");
  assert.equal(categoryIcon(undefined), "✦");
  assert.equal(categoryIcon(null), "✦");
});

test("theme: tipografía y filas de dato", () => {
  assert.notEqual(title("shin"), "SHIN", "el título debe transformarse a Unicode");
  assert.ok(title("shin").length > 0);
  assert.equal(kv("Título", "Funk Mambo"), "> ❖ Título › *Funk Mambo*");
  assert.equal(note("hola"), "> hola");
  assert.equal(footer(), BRAND.footer);
  assert.equal(footer("v3"), BRAND.footer + " · v3");
  assert.ok(label("descargas").length > 0);
});

test("theme: las 3 cajas cierran bien y descartan líneas vacías", () => {
  const main = boxMain("Shin-MD", ["👋 Hola", "", null, undefined, "📦 205"]);
  assert.ok(main.startsWith("╭━━━〔"));
  assert.ok(main.endsWith("╰━━━━━━━━━━━━━━━╯"));
  assert.equal(main.split("\n").length, 4, "2 líneas útiles + apertura + cierre");

  const data = boxData("Resultado", [["Título", "Funk"], ["Canal", ""], ["Vistas", 0]]);
  assert.ok(data.includes("❖ Título › *Funk*"));
  assert.ok(!data.includes("Canal"), "las filas sin valor no se dibujan");
  assert.ok(data.endsWith("└───────────────"));

  const aviso = boxNotice("⚠️", ["Cuidado"]);
  assert.ok(aviso.startsWith("⚠️ ─────────────"));
  assert.ok(aviso.includes("   Cuidado"));
});

test("theme: todos los estados responden en español y sin reventar", () => {
  const kinds = stateKinds();
  assert.ok(kinds.length >= 12, "debe haber al menos 12 estados definidos");
  for (const k of kinds) {
    const s = state(k, {});
    assert.equal(typeof s, "string");
    assert.ok(s.length > 0, `el estado ${k} devolvió vacío`);
    assert.ok(!/\b(error:|invalid|usage:|loading)\b/i.test(s), `el estado ${k} tiene inglés a medias: ${s}`);
  }
  assert.match(state("cooldown", { seconds: 8, command: ".play" }), /8s.*\.play/s);
  assert.match(state("onlyAdmin"), /admins/);
  assert.match(state("notfound", { what: "esa canción" }), /esa canción/);
  // Un estado inexistente cae al de error en vez de devolver undefined
  assert.match(state("no-existe"), /❌/);
});

// ── theme: banner por hora ──────────────────────────────────────────

test("theme: el modo del banner depende de la hora", () => {
  const a = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return bannerMode(d); };
  assert.equal(a(5), "night");
  assert.equal(a(6), "day");
  assert.equal(a(13), "day");
  assert.equal(a(18), "day");
  assert.equal(a(19), "night");
  assert.equal(a(23), "night");
  assert.equal(a(0), "night");
});

test("theme: hay banner de día y de noche, y son imágenes válidas", () => {
  for (const modo of ["day", "night"]) {
    const lista = listBanners(modo);
    assert.ok(lista.length > 0, `falta el banner de ${modo}`);
    for (const p of lista) {
      const st = fs.statSync(p);
      assert.ok(st.size > 0 && st.size <= 600 * 1024, `${p} pesa demasiado para un banner`);
      const cab = fs.readFileSync(p).subarray(0, 4);
      const jpeg = cab[0] === 0xFF && cab[1] === 0xD8 && cab[2] === 0xFF;
      const png = cab[0] === 0x89 && cab[1] === 0x50;
      assert.ok(jpeg || png, `${p} no es JPEG/PNG`);
    }
    assert.ok(lista.includes(pickBanner(modo)));
  }
});

// ── menú nativo: el bug del viewOnce ────────────────────────────────

const FILAS_DEMO = [{ id: "gkmenu:main", title: "Principal", description: "🏠 Comandos generales · 9 comandos" }];

test("menú nativo: por defecto YA NO se envuelve en viewOnce", () => {
  delete process.env.GINKO_NATIVE_MENU_VIEW_ONCE;
  const c = buildNativeMenuContent({ body: "hola", footer: "pie", rows: FILAS_DEMO });
  assert.equal(c.viewOnceMessage, undefined, "envolver mata los botones en WhatsApp Web");
  assert.ok(c.interactiveMessage, "el interactivo debe quedar al desnudo");
  assert.equal(c.interactiveMessage.nativeFlowMessage.buttons[0].name, "single_select");
});

test("menú nativo: se puede recuperar el comportamiento viejo con =1", () => {
  process.env.GINKO_NATIVE_MENU_VIEW_ONCE = "1";
  try {
    const c = buildNativeMenuContent({ body: "hola", rows: FILAS_DEMO });
    assert.ok(c.viewOnceMessage?.message?.interactiveMessage, "con =1 debe volver a envolver");
  } finally {
    delete process.env.GINKO_NATIVE_MENU_VIEW_ONCE;
  }
});

// ── .pin ────────────────────────────────────────────────────────────

test(".pin: duraciones válidas y aproximación de las inválidas", () => {
  assert.deepEqual(parseDuracion(""), { clave: "24h", segundos: 86400, etiqueta: "24 horas", exacta: true });
  assert.equal(parseDuracion("7d").segundos, 604800);
  assert.equal(parseDuracion("30d").segundos, 2592000);
  assert.equal(parseDuracion("1 semana").segundos, 604800);
  assert.equal(parseDuracion("un mes").segundos, 2592000);
  assert.equal(parseDuracion("1 día").segundos, 86400);

  // WhatsApp solo admite 24h/7d/30d: cualquier otra cosa se aproxima y se avisa
  const raro = parseDuracion("5d");
  assert.equal(raro.exacta, false);
  assert.equal(raro.segundos, 604800, "5 días → lo más cercano es 7d");
  assert.equal(parseDuracion("basura").exacta, false);
});

test(".pin: payload exacto que espera baileys", () => {
  const key = { remoteJid: "1@g.us", id: "ABC", participant: "5@s.whatsapp.net" };
  assert.deepEqual(buildPinPayload(key, { segundos: 86400 }), { pin: key, type: 1, time: 86400 });
  assert.deepEqual(buildPinPayload(key, { desfijar: true }), { pin: key, type: 2 });
});

test(".pin: exige responder a un mensaje y pide admin al bot", async () => {
  assert.equal(pinCmd.groupOnly, true);
  assert.equal(pinCmd.adminOnly, true);
  assert.equal(pinCmd.botAdmin, true, "sin admin, WhatsApp descarta el fijado en silencio");

  const sinCita = await pinCmd.handler(null, { command: "pin", chatId: "1@g.us" });
  assert.match(sinCita, /Responde al mensaje/);

  const enviados = [];
  const sock = { sendMessage: async (jid, c) => { enviados.push({ jid, c }); return {}; } };
  const ctx = { command: "pin", chatId: "1@g.us", arg: "7d", usedPrefix: ".", replyMsg: { key: { id: "XYZ" } } };
  const r = await pinCmd.handler(sock, ctx);

  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].c, { pin: { id: "XYZ" }, type: 1, time: 604800 });
  assert.match(r, /7 días/);
  assert.match(r, /unpin/);
});

test(".pin: el alias .unpin desfija", async () => {
  const enviados = [];
  const sock = { sendMessage: async (jid, c) => { enviados.push(c); return {}; } };
  const ctx = { command: "unpin", chatId: "1@g.us", replyMsg: { key: { id: "XYZ" } } };
  const r = await pinCmd.handler(sock, ctx);
  assert.deepEqual(enviados[0], { pin: { id: "XYZ" }, type: 2 });
  assert.match(r, /desfijado/i);
});

// ── .owner ──────────────────────────────────────────────────────────

test(".owner: el número se limpia bien venga como venga", () => {
  assert.equal(ownerDigits("521234567890:12@s.whatsapp.net"), "521234567890");
  assert.equal(ownerDigits("521234567890@s.whatsapp.net"), "521234567890");
  assert.equal(ownerDigits(""), "");
  assert.equal(ownerDigits(undefined), "");
});

test(".owner: el vCard es válido y no se rompe con nombres raros", () => {
  const v = buildOwnerVCard({ name: "Rio Kuroxi", digits: "521234567890" });
  assert.ok(v.startsWith("BEGIN:VCARD"));
  assert.ok(v.includes("VERSION:3.0"));
  assert.ok(v.endsWith("END:VCARD"));
  assert.ok(v.includes("FN:Rio Kuroxi"));
  assert.ok(v.includes("waid=521234567890:+521234567890"));

  // Un salto de línea en el nombre rompería el formato del vCard
  const sucio = buildOwnerVCard({ name: "Rio\nKuroxi;X", digits: "" });
  assert.equal(sucio.split("\n").filter(l => l.startsWith("FN:")).length, 1);
  assert.ok(!sucio.includes("TEL"), "sin número no se inventa un TEL");
});

test(".owner: botones correctos y respaldo en texto si falla la tarjeta", async () => {
  const btns = buildOwnerButtons("521234567890");
  assert.equal(btns.length, 3);
  assert.ok(btns.some(b => b.url?.includes("wa.me/521234567890")));
  assert.ok(btns.some(b => b.copy_code === "+521234567890"));
  assert.ok(btns.some(b => b.url?.includes("github.com/riokuroxi-svg/Shin-MD")));
  assert.equal(buildOwnerButtons("").length, 1, "sin número solo queda el del código fuente");

  // Sin socket, sendNativeQuickReply falla → debe caer al texto plano
  const engine = { getOwnerJid: () => "521234567890@s.whatsapp.net" };
  const salida = await ownerCmd.handler({}, { chatId: "1@s.whatsapp.net" }, engine);
  assert.equal(typeof salida, "string", "el respaldo en texto es obligatorio");
  assert.match(salida, /Basado en Shin-MD por riokuroxi-svg/, "el crédito AGPL §7 no puede faltar");
  assert.match(salida, /\+521234567890/);
});

test(".owner: el crédito AGPL sobrevive también en la tarjeta con botones", async () => {
  let enviado = null;
  const sock = {
    relayMessage: async () => ({}),
    user: { id: "1@s.whatsapp.net" },
    sendMessage: async (jid, c) => { enviado = c; return {}; },
  };
  const engine = { getOwnerJid: () => "521234567890@s.whatsapp.net" };
  const r = await ownerCmd.handler(sock, { chatId: "1@s.whatsapp.net" }, engine);

  assert.equal(r, null, "si la tarjeta salió, el router no debe mandar texto encima");
  assert.ok(enviado?.contacts?.contacts?.[0]?.vcard, "debe acompañarse del vCard");
  assert.match(enviado.contacts.contacts[0].vcard, /BEGIN:VCARD/);
});
