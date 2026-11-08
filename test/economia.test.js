/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  economia.test.js — Las monedas se leen, se suman y se transfieren.
//
//  Esto existía sin prueba y por eso nadie vio el fallo: `getUserCoins`
//  hacía `getDatabase().prepare(...)` cuando `getDatabase()` devuelve un
//  contenedor ({ db, migrate, settings, close }) sin `prepare`. Cualquier
//  comando de monedas se caía con "db.prepare is not a function".
//
//  La prueba corre en un proceso aparte con SHIN_DB_PATH en una carpeta
//  temporal: no toca data/shin.db y no necesita WhatsApp.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Corre un fragmento con una base de datos propia y devuelve el último JSON. */
function conBaseTemporal(codigo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-economia-"));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], {
    cwd: RAIZ,
    env: {
      ...process.env,
      SHIN_DB_PATH: path.join(dir, "shin.db"),
      NODE_NO_WARNINGS: "1",
      LOG_LEVEL: "silent",
    },
    encoding: "utf8",
    timeout: 30000,
  });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, "el proceso de economía falló:\n" + r.stderr);
  const lineas = r.stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lineas[lineas.length - 1]);
}

test("getUserCoins devuelve una cuenta a cero para quien no tiene fila", () => {
  const r = conBaseTemporal(`
    const { getUserCoins } = await import("#economy");
    const u = getUserCoins("5215500000000@s.whatsapp.net");
    console.log(JSON.stringify({ coins: u.coins, bank: u.bank, health: u.health, stamina: u.stamina }));
  `);
  assert.equal(r.coins, 0);
  assert.equal(r.bank, 0);
  assert.equal(r.health, 100);
  assert.equal(r.stamina, 100);
});

test("updateUserCoins suma, resta y nunca deja el saldo en negativo", () => {
  const r = conBaseTemporal(`
    const { getUserCoins, updateUserCoins } = await import("#economy");
    const jid = "5215500000001@s.whatsapp.net";
    const trasSumar = updateUserCoins(jid, 250);
    const trasRestar = updateUserCoins(jid, -50);
    const trasPasarse = updateUserCoins(jid, -10000);
    console.log(JSON.stringify({
      trasSumar,
      trasRestar,
      trasPasarse,
      leido: getUserCoins(jid).coins,
    }));
  `);
  assert.equal(r.trasSumar, 250);
  assert.equal(r.trasRestar, 200);
  assert.equal(r.trasPasarse, 0, "restar más de lo que hay debe dejar 0, no un saldo negativo");
  assert.equal(r.leido, 0, "lo que se lee después tiene que coincidir con lo que se escribió");
});

test(".transfer mueve las monedas y no deja al que paga en descubierto", () => {
  const r = conBaseTemporal(`
    const { getUserCoins, updateUserCoins } = await import("#economy");
    const transfer = (await import("./cmds/economy/transfer.js")).default;

    const ana = "5215500000002@s.whatsapp.net";
    const luis = "5215500000003@s.whatsapp.net";
    updateUserCoins(ana, 100);

    const ctx = (texto, destino) => ({
      senderId: ana,
      chatId: "5215500000002@s.whatsapp.net",
      arg: texto,
      mentions: destino ? [destino] : [],
      pushName: "Ana",
    });

    const sinMencion = await transfer.handler({}, ctx("100"), {});
    const caro = await transfer.handler({}, ctx("1000", luis), {});
    const aMiMismo = await transfer.handler({}, ctx("10", ana), {});
    const bien = await transfer.handler({}, ctx("40", luis), {});

    console.log(JSON.stringify({
      sinMencion, caro, aMiMismo, bien,
      ana: getUserCoins(ana).coins,
      luis: getUserCoins(luis).coins,
    }));
  `);
  assert.match(r.sinMencion, /\.transfer/, "sin mención tiene que explicar cómo se usa");
  assert.match(r.caro, /No tienes suficiente/);
  assert.match(r.aMiMismo, /a ti mismo/);
  assert.match(r.bien, /Transferido/);
  assert.equal(r.ana, 60, "a Ana le quedan 100 - 40");
  assert.equal(r.luis, 40, "Luis recibe las 40");
});

test("una base vieja (columnas de texto) se convierte a números sin perder filas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-economia-vieja-"));
  const archivo = path.join(dir, "shin.db");
  // Base tal y como la dejaba la migración 2: coins/bank/health como TEXT.
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(${JSON.stringify(archivo)});
    db.exec(\`
      CREATE TABLE users (
        jid TEXT PRIMARY KEY, name TEXT,
        banned INTEGER NOT NULL DEFAULT 0, warned INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0,
        coins TEXT DEFAULT '', bank TEXT DEFAULT '', exp TEXT DEFAULT '',
        health TEXT DEFAULT '', stamina TEXT DEFAULT '', magic TEXT DEFAULT '',
        birth TEXT DEFAULT '', genre TEXT DEFAULT '', description TEXT DEFAULT '',
        pasatiempo TEXT DEFAULT '', marry TEXT DEFAULT '', inventory TEXT DEFAULT '',
        tools TEXT DEFAULT '', weapons TEXT DEFAULT '', streak TEXT DEFAULT '',
        last_daily_global TEXT DEFAULT ''
      );
      CREATE TABLE migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);
      INSERT INTO migrations VALUES (1,'core-tables',1),(2,'economy-gacha-profiles',2);
      INSERT INTO users (jid, name, coins, bank, health, stamina, inventory, streak)
        VALUES ('ana@s.whatsapp.net','Ana','250.0','10.0','100.0','100.0','{"pocion":1}','3.0');
      INSERT INTO users (jid, name, coins) VALUES ('luis@s.whatsapp.net','Luis','');
      INSERT INTO users (jid, name, coins) VALUES ('eva@s.whatsapp.net','Eva',NULL);
    \`);
    db.close();
  `], { cwd: RAIZ, env: { ...process.env, NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 0, "no se pudo preparar la base vieja:\n" + r.stderr);

  const r2 = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { getDatabase } = await import("#db");
    const db = getDatabase().db;
    const tipos = Object.fromEntries(db.prepare("PRAGMA table_info(users)").all().map(c => [c.name, c.type]));
    const { getUserCoins } = await import("#economy");
    console.log(JSON.stringify({
      tipos,
      filas: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
      ana: getUserCoins("ana@s.whatsapp.net"),
      luis: getUserCoins("luis@s.whatsapp.net").coins,
      eva: getUserCoins("eva@s.whatsapp.net").coins,
      aplicadas: db.prepare("SELECT version FROM migrations ORDER BY version").all().map(m => m.version),
    }));
  `], {
    cwd: RAIZ,
    env: { ...process.env, SHIN_DB_PATH: archivo, NODE_NO_WARNINGS: "1", LOG_LEVEL: "silent" },
    encoding: "utf8",
    timeout: 30000,
  });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r2.status, 0, "la conversión falló:\n" + r2.stderr);
  const lineas = r2.stdout.trim().split("\n").filter(Boolean);
  const datos = JSON.parse(lineas[lineas.length - 1]);

  assert.equal(datos.tipos.coins, "INTEGER", "coins tiene que quedar como entero");
  assert.equal(datos.tipos.health, "INTEGER");
  assert.equal(datos.tipos.bank, "INTEGER");
  assert.equal(datos.tipos.inventory, "TEXT", "el inventario es JSON: se queda en texto");
  assert.equal(datos.filas, 3, "no se puede perder ninguna fila");
  assert.equal(datos.ana.coins, 250);
  assert.equal(datos.ana.bank, 10);
  assert.equal(datos.ana.streak, 3);
  assert.equal(datos.ana.inventory, '{"pocion":1}', "el inventario se copia tal cual");
  assert.equal(datos.luis, 0, "el '' de una fila vieja cuenta como 0");
  assert.equal(datos.eva, 0, "un NULL viejo cuenta como 0");
  assert.deepEqual(datos.aplicadas, [1, 2, 3]);
});
