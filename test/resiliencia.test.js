/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Resiliencia: fusión LID transaccional con reintento, y auth que propaga errores.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DatabaseSync } from "../src/storage/sqlite-compat.js";
import * as lid from "../src/lib/lid.js";
import { crearBackendIdentidades, fusionarCuentas } from "../src/storage/identities.js";

const LID = "111111111111@lid";
const PN = "5215512345678@s.whatsapp.net";

/** Base en memoria; `controlador.romper` hace fallar el UPDATE de group_warns. */
function baseConFallo() {
  const real = new DatabaseSync(":memory:");
  real.exec("CREATE TABLE g_users (id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0, level INTEGER DEFAULT 0)");
  real.exec("CREATE TABLE group_warns (id INTEGER PRIMARY KEY AUTOINCREMENT, group_jid TEXT, warned_jid TEXT, warned_at INTEGER DEFAULT 0)");
  real.prepare("INSERT INTO g_users (id, name, exp) VALUES (?, ?, ?)").run(LID, "a", 100);
  real.prepare("INSERT INTO g_users (id, name, exp) VALUES (?, ?, ?)").run(PN, "b", 50);
  real.prepare("INSERT INTO group_warns (group_jid, warned_jid) VALUES (?, ?)").run("g@g.us", LID);
  const controlador = { romper: false };
  const db = new Proxy(real, {
    get(t, k) {
      if (k === "prepare") {
        return (sql) => {
          if (controlador.romper && /UPDATE group_warns/i.test(sql)) throw new Error("fallo simulado");
          return t.prepare(sql);
        };
      }
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { real, db, controlador };
}

test("fusión: si un paso falla se deshace todo (no queda cuenta partida)", () => {
  const { real, db, controlador } = baseConFallo();
  controlador.romper = true;
  assert.throws(() => fusionarCuentas(db, LID, PN), /fallo simulado/);
  const filas = real.prepare("SELECT id, exp FROM g_users").all();
  assert.equal(filas.length, 2);
  assert.equal(filas.find((f) => f.id === PN).exp, 50);
  assert.equal(filas.find((f) => f.id === LID).exp, 100);
});

test("aprender reintenta la fusión pendiente y no suma dos veces", () => {
  const { real, db, controlador } = baseConFallo();
  lid.reiniciar();
  lid.conectarBackend(crearBackendIdentidades(db));
  const ahoraReal = Date.now;
  let t = ahoraReal();
  Date.now = () => t;
  try {
    controlador.romper = true;
    assert.equal(lid.aprender(LID, PN), true);
    assert.equal(lid.aprender(LID, PN), false); // aún dentro del margen: no reintenta
    assert.equal(real.prepare("SELECT id FROM g_users").all().length, 2);

    controlador.romper = false;
    t += 61_000;
    assert.equal(lid.aprender(LID, PN), false); // reintento: la pareja ya no es nueva
    const filas = real.prepare("SELECT id, exp FROM g_users").all();
    assert.equal(filas.length, 1);
    assert.equal(filas[0].exp, 150);

    t += 61_000;
    lid.aprender(LID, PN); // sin pendiente: no vuelve a fusionar
    assert.equal(real.prepare("SELECT exp FROM g_users").get().exp, 150);
  } finally {
    Date.now = ahoraReal;
    lid.reiniciar();
  }
});

test("auth: keys.set propaga el error y deja la base intacta", async () => {
  const { useSQLiteAuthState } = await import("../src/core/auth.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-auth-"));
  const res = await useSQLiteAuthState(dir);
  try {
    await res.state.keys.set({ session: { ok: { v: 1 } } });
    // BigInt no es serializable a JSON: JSON.stringify lanza dentro de la transacción.
    await assert.rejects(() => res.state.keys.set({ session: { malo: { v: 10n } } }));
    const leido = await res.state.keys.get("session", ["ok", "malo"]);
    assert.deepEqual(leido.ok, { v: 1 });
    assert.equal(leido.malo, undefined);
  } finally {
    res.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("teléfono → LID: la consulta a la red no se repite en 10 minutos", async () => {
  lid.reiniciar();
  let consultas = 0;
  lid.conectarSesion({
    signalRepository: { lidMapping: { async getLIDForPN() { consultas++; return null; } } },
  });
  const ahoraReal = Date.now;
  let t = ahoraReal();
  Date.now = () => t;
  try {
    assert.equal(await lid.resolverConector(PN, { red: true }), "");
    assert.equal(await lid.resolverConector(PN, { red: true }), "");
    assert.equal(consultas, 1);
    t += 11 * 60_000;
    await lid.resolverConector(PN, { red: true });
    assert.equal(consultas, 2);
  } finally {
    Date.now = ahoraReal;
    lid.reiniciar();
  }
});
