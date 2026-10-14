/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  sqlite-respaldo.test.js — El respaldo en JSON (sin SQLite real) y el
//  paso de ese respaldo a SQLite real.
//
//  El respaldo se usa cuando Node no trae SQLite. Se prueba en un proceso
//  aparte con SHIN_SQLITE_FALLBACK=1, que lo fuerza en cualquier Node.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPAT = pathToFileURL(path.join(RAIZ, "src/storage/sqlite-compat.js")).href;
const BASE = pathToFileURL(path.join(RAIZ, "src/storage/database.js")).href;

/** Corre un script en un proceso con el respaldo JSON forzado. */
function conRespaldo(codigo) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], {
    cwd: RAIZ,
    env: { ...process.env, SHIN_SQLITE_FALLBACK: "1", NODE_NO_WARNINGS: "1" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(r.status, 0, "el proceso del respaldo falló:\n" + r.stderr);
  const ultima = r.stdout.trim().split("\n").pop();
  return JSON.parse(ultima);
}

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shin-respaldo-"));
}

test("respaldo: las credenciales se reemplazan y se vuelven a leer (VALUES con literal)", () => {
  const dir = carpetaTemporal();
  const db = path.join(dir, "auth.db");
  const r = conRespaldo(`
    const { DatabaseSync, SQLITE_IS_FALLBACK } = await import(${JSON.stringify(COMPAT)});
    const db = new DatabaseSync(${JSON.stringify(db)});
    db.exec("CREATE TABLE IF NOT EXISTS creds (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);");
    db.prepare("INSERT OR REPLACE INTO creds (id, data) VALUES (1, ?)").run("viejo");
    db.prepare("INSERT OR REPLACE INTO creds (id, data) VALUES (1, ?)").run("nuevo");
    const fila = db.prepare("SELECT data FROM creds WHERE id = 1").get();
    const todas = db.prepare("SELECT * FROM creds").all();
    console.log(JSON.stringify({ SQLITE_IS_FALLBACK, data: fila && fila.data, filas: todas.length }));
  `);
  assert.equal(r.SQLITE_IS_FALLBACK, true);
  assert.equal(r.data, "nuevo");
  assert.equal(r.filas, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("respaldo: clave compuesta, borrado por WHERE y claves que sobreviven al reinicio", () => {
  const dir = carpetaTemporal();
  const db = path.join(dir, "auth.db");
  conRespaldo(`
    const { DatabaseSync } = await import(${JSON.stringify(COMPAT)});
    const db = new DatabaseSync(${JSON.stringify(db)});
    db.exec("CREATE TABLE IF NOT EXISTS signal_keys (category TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (category, id));");
    const set = db.prepare("INSERT OR REPLACE INTO signal_keys (category, id, data) VALUES (?, ?, ?)");
    set.run("pre-key", "1", "a");
    set.run("pre-key", "2", "b");
    db.prepare("DELETE FROM signal_keys WHERE category = ? AND id = ?").run("pre-key", "1");
    console.log("{}");
  `);
  // Segundo proceso: sin volver a ejecutar CREATE TABLE (como pasa con las
  // tablas de las migraciones) la clave compuesta debe seguir funcionando.
  const r = conRespaldo(`
    const { DatabaseSync } = await import(${JSON.stringify(COMPAT)});
    const db = new DatabaseSync(${JSON.stringify(db)});
    db.prepare("INSERT OR REPLACE INTO signal_keys (category, id, data) VALUES (?, ?, ?)").run("pre-key", "3", "c");
    const get = db.prepare("SELECT data FROM signal_keys WHERE category = ? AND id = ?");
    console.log(JSON.stringify({
      uno: get.get("pre-key", "1") || null,
      dos: get.get("pre-key", "2")?.data,
      tres: get.get("pre-key", "3")?.data,
      total: db.prepare("SELECT * FROM signal_keys").all().length,
    }));
  `);
  assert.equal(r.uno, null, "la fila borrada no debe volver");
  assert.equal(r.dos, "b");
  assert.equal(r.tres, "c");
  assert.equal(r.total, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("respaldo: id autoincremental no pisa filas", () => {
  const dir = carpetaTemporal();
  const r = conRespaldo(`
    const { DatabaseSync } = await import(${JSON.stringify(COMPAT)});
    const db = new DatabaseSync(${JSON.stringify(path.join(dir, "x.db"))});
    db.exec("CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT);");
    db.prepare("INSERT INTO log (texto) VALUES (?)").run("uno");
    db.prepare("INSERT INTO log (texto) VALUES (?)").run("dos");
    console.log(JSON.stringify(db.prepare("SELECT * FROM log").all()));
  `);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((f) => f.texto).sort(), ["dos", "uno"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("puente: los datos del respaldo pasan a SQLite real una sola vez", async () => {
  const dir = carpetaTemporal();
  const ruta = path.join(dir, "shin.db");
  // 1) El bot corre con el respaldo JSON y guarda un ajuste.
  conRespaldo(`
    const { createDatabase } = await import(${JSON.stringify(BASE)});
    const d = createDatabase(${JSON.stringify(ruta)});
    d.settings.set("prefijo", "!");
    console.log("{}");
  `);
  assert.ok(fs.existsSync(ruta + ".json"), "el respaldo debió escribir su JSON");

  // 2) Ahora arranca con SQLite real: el ajuste debe seguir ahí.
  const { createDatabase } = await import("../src/storage/database.js");
  const real = createDatabase(ruta);
  assert.equal(real.settings.get("prefijo"), "!");
  assert.ok(fs.existsSync(ruta + ".json.importado"), "el JSON se renombra tras copiarlo");
  assert.ok(!fs.existsSync(ruta + ".json"));

  // 3) Un dato nuevo no se pisa en el siguiente arranque.
  real.settings.set("prefijo", "#");
  real.close();
  const otra = createDatabase(ruta);
  assert.equal(otra.settings.get("prefijo"), "#");
  otra.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("puente: un JSON que solo trae migraciones NO deja la base sin tablas", async () => {
  // Este era el origen del error "no such table: settings": copiar la
  // tabla migrations hacía creer que las tablas ya estaban creadas.
  const dir = carpetaTemporal();
  const ruta = path.join(dir, "shin.db");
  fs.writeFileSync(
    ruta + ".json",
    JSON.stringify({
      migrations: {
        1: { version: 1, name: "core-tables", applied_at: 1 },
        2: { version: 2, name: "economy-gacha-profiles", applied_at: 1 },
      },
      settings: {},
    })
  );
  const { createDatabase } = await import("../src/storage/database.js");
  const d = createDatabase(ruta);
  assert.doesNotThrow(() => d.settings.set("ok", 1));
  assert.equal(d.settings.get("ok"), 1);
  assert.ok(fs.existsSync(ruta + ".json"), "sin nada que copiar, el JSON se deja como está");
  d.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
