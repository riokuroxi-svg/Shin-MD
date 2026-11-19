/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  endurecimiento-ataque.test.js — regresiones de los tres fallos que
//  aparecieron al someter el bot a carga hostil:
//
//   1. Amplificación: un desconocido con un comando ownerOnly se saltaba
//      Brain y el techo de 10/min → 1 entrada = 1 salida. Cerrado en
//      cooldown.js (esDueno) + router.js (aviso con enfriamiento).
//   2. Antispam con TTL renovado en cada mensaje: la ventana de un minuto
//      no cerraba nunca.
//   3. Respaldo JSON: INSERT OR IGNORE no insertaba nada y UPDATE no
//      existía → el bot guardaba en el vacío.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createCooldown } from "../src/commands/middleware/cooldown.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPAT = pathToFileURL(path.join(RAIZ, "src/storage/sqlite-compat.js")).href;

/** Corre un script con el respaldo JSON forzado y devuelve el último JSON. */
function conRespaldo(codigo) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], {
    cwd: RAIZ,
    env: { ...process.env, SHIN_SQLITE_FALLBACK: "1", SHIN_BRAIN: "0", NODE_NO_WARNINGS: "1" },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(r.status, 0, "el proceso del respaldo falló:\n" + r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

test("amplificación: un desconocido con comando ownerOnly se frena", () => {
  const cd = createCooldown();
  const cmd = { name: "get", cooldown: 0, ownerOnly: true };
  let bloqueados = 0;
  for (let i = 0; i < 40; i++) {
    if (cd.check({ senderId: "atacante", cmd, text: ".get x" + i, esDueno: false })) bloqueados++;
  }
  assert.ok(bloqueados > 0, "sin ser dueño, un ownerOnly debe pasar por brain y antispam");
});

test("el dueño real conserva el atajo (no se frena)", () => {
  const cd = createCooldown();
  const cmd = { name: "menu", cooldown: 0, ownerOnly: true };
  for (let i = 0; i < 40; i++) {
    assert.equal(cd.check({ senderId: "dueño", cmd, text: ".menu", esDueno: true }), false);
  }
});

test("antispam: el techo de 10 por ventana se respeta sin el brain", () => {
  const anterior = process.env.SHIN_BRAIN;
  process.env.SHIN_BRAIN = "0";
  try {
    const cd = createCooldown();
    const cmd = { name: "x", cooldown: 0 };
    let bloqueados = 0;
    for (let i = 0; i < 12; i++) if (cd.check({ senderId: "u-ventana", cmd, text: "t" + i })) bloqueados++;
    assert.equal(bloqueados, 2, "pasan 10, se frenan 2: el TTL no puede renovarse con cada mensaje");
  } finally {
    if (anterior === undefined) delete process.env.SHIN_BRAIN;
    else process.env.SHIN_BRAIN = anterior;
  }
});

test("respaldo: INSERT OR IGNORE crea la fila y no pisa la existente", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-ignore-"));
  const db = path.join(dir, "shin.db");
  const r = conRespaldo(`
    const { DatabaseSync } = await import(${JSON.stringify(COMPAT)});
    const d = new DatabaseSync(${JSON.stringify(db)});
    d.exec("CREATE TABLE IF NOT EXISTS g_users (id TEXT PRIMARY KEY, coins INTEGER DEFAULT 0)");
    d.prepare("INSERT OR IGNORE INTO g_users (id) VALUES (?)").run("u1");
    const creada = d.prepare("SELECT * FROM g_users WHERE id = ?").get("u1");
    d.prepare("UPDATE g_users SET coins = ? WHERE id = ?").run(7, "u1");
    d.prepare("INSERT OR IGNORE INTO g_users (id) VALUES (?)").run("u1");
    const final = d.prepare("SELECT * FROM g_users WHERE id = ?").get("u1");
    console.log(JSON.stringify({ creada: !!creada, coins: final && final.coins }));
  `);
  assert.equal(r.creada, true, "getUser/getChat/getSettings dependen de esta fila");
  assert.equal(r.coins, 7, "el segundo INSERT OR IGNORE no debe borrar lo actualizado");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("respaldo: UPDATE escribe (antes era un no-op silencioso)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-update-"));
  const db = path.join(dir, "shin.db");
  const r = conRespaldo(`
    const { DatabaseSync } = await import(${JSON.stringify(COMPAT)});
    const d = new DatabaseSync(${JSON.stringify(db)});
    d.exec("CREATE TABLE IF NOT EXISTS g_chat_users (chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT 0, name TEXT DEFAULT '', PRIMARY KEY (chat_id, user_id))");
    d.prepare("INSERT OR REPLACE INTO g_chat_users (chat_id, user_id, coins) VALUES (?, ?, ?)").run("c1", "u1", 100);
    const res = d.prepare("UPDATE g_chat_users SET coins = ?, name = ? WHERE chat_id = ? AND user_id = ?").run(999, "Ana", "c1", "u1");
    const fila = d.prepare("SELECT * FROM g_chat_users WHERE chat_id = ? AND user_id = ?").get("c1", "u1");
    console.log(JSON.stringify({ changes: res && res.changes, coins: fila && fila.coins, name: fila && fila.name }));
  `);
  assert.equal(r.changes, 1);
  assert.equal(r.coins, 999);
  assert.equal(r.name, "Ana");
  fs.rmSync(dir, { recursive: true, force: true });
});
