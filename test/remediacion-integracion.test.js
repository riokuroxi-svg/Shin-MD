/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { DisconnectReason } from "baileys";
import { useSQLiteAuthState } from "../src/core/auth.js";
import { connectSocket } from "../src/core/socket.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function temp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "shin-validacion-"));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

async function authConDatos(dir) {
  const a = await useSQLiteAuthState(dir);
  a.state.creds.registered = true;
  a.state.creds.testRevision = "original";
  await a.saveCreds();
  await a.state.keys.set({ "test-key": { id: { synthetic: "valor" } } });
  a.close();
}

function readCreds(dir) {
  const db = new DatabaseSync(path.join(dir, "auth.db"));
  try {
    return JSON.parse(db.prepare("SELECT data FROM creds WHERE id = 1").get().data);
  } finally {
    db.close();
  }
}

function motor() {
  const errores = [];
  return {
    errores,
    LIFECYCLE: { CONNECT: 1, READY: 2, RUNNING: 3 },
    transit() {},
    emit() {},
    onShutdown() {},
    getHealth: () => ({
      recordError(e) { errores.push(e); },
      recordDisconnect() {},
    }),
    getState: () => 1,
    getSendQueue: () => ({
      pause() {},
      resume() {},
      inPriority: () => false,
      enqueue: async (f) => f(),
    }),
  };
}

function harness(dir, extraOpts = {}) {
  const all = [];
  let stopped = 0;
  let pairingRequests = 0;
  const eng = motor();
  const watchdog = { stop() { stopped++; }, tick() {} };
  const conexion = connectSocket(eng, {
    sessionDir: dir,
    watchdog,
    ...extraOpts,
    deps: {
      fetchVersion: async () => ({ version: [2, 3000, 0] }),
      makeSocket: (cfg) => {
        const s = {
          ev: new EventEmitter(),
          ws: { close() {} },
          sendMessage: async () => ({}),
          relayMessage: async () => ({}),
          requestPairingCode: async () => { pairingRequests++; return "12345678"; },
          end() {},
          groupMetadata: async () => ({}),
          groupFetchAllParticipating: async () => ({}),
        };
        all.push({ s, cfg });
        return s;
      },
    },
  });
  return {
    all,
    eng,
    conexion,
    watchdog,
    get stopped() { return stopped; },
    get pairingRequests() { return pairingRequests; },
  };
}

async function disconnect(h, code) {
  const s = h.all.at(-1).s;
  const fn = s.ev.listeners("connection.update")[0];
  await fn({ connection: "close", lastDisconnect: { error: { output: { statusCode: code } } } });
}

test("auth real Node SQLite guarda creds/keys y migración de formato previo con JSON conservado", async (t) => {
  const d = temp(t);
  await authConDatos(d);
  let a = await useSQLiteAuthState(d);
  assert.equal(a.state.creds.testRevision, "original");
  assert.deepEqual(await a.state.keys.get("test-key", ["id"]), { id: { synthetic: "valor" } });
  a.close();

  const old = temp(t);
  const jsonPath = path.join(old, "auth.db.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      creds: { 1: { id: 1, data: JSON.stringify({ registered: true, testRevision: "migrada" }) } },
      signal_keys: { "test-key\u0000id": { category: "test-key", id: "id", data: JSON.stringify({ synthetic: "migrado" }) } },
    }),
  );
  const before = fs.readFileSync(jsonPath, "utf8");
  a = await useSQLiteAuthState(old);
  assert.equal(a.state.creds.testRevision, "migrada");
  assert.deepEqual(await a.state.keys.get("test-key", ["id"]), { id: { synthetic: "migrado" } });
  a.close();

  a = await useSQLiteAuthState(old);
  assert.equal(a.state.creds.testRevision, "migrada");
  a.close();
  assert.equal(fs.readFileSync(jsonPath, "utf8"), before);
});

for (const [name, reason] of [
  ["loggedOut", DisconnectReason.loggedOut],
  ["forbidden", DisconnectReason.forbidden],
  ["badSession", DisconnectReason.badSession],
  ["multideviceMismatch", DisconnectReason.multideviceMismatch],
]) {
  test(`connectSocket ${name}: no borra ni reconecta`, async (t) => {
    const d = temp(t);
    await authConDatos(d);
    fs.writeFileSync(path.join(d, "sentinel.synthetic"), "conservar");
    const h = harness(d);
    await h.conexion.start();
    await disconnect(h, reason);
    await h.conexion.start();
    await wait(50);
    assert.equal(h.all.length, 1);
    assert.equal(h.stopped, 1);
    assert.equal(fs.readFileSync(path.join(d, "sentinel.synthetic"), "utf8"), "conservar");
    assert.equal(readCreds(d).testRevision, "original");
    await wait(3100);
    assert.equal(h.all.length, 1);
    await h.conexion.start();
    assert.equal(h.all.length, 1);
  });
}

test("creds.update legítimo inmediatamente antes de loggedOut no debe perderse", async (t) => {
  const d = temp(t);
  await authConDatos(d);
  const h = harness(d);
  await h.conexion.start();
  h.all[0].cfg.auth.creds.testRevision = "actualizacion-legitima";
  h.all[0].s.ev.emit("creds.update", {});
  await disconnect(h, DisconnectReason.loggedOut);
  assert.equal(readCreds(d).testRevision, "actualizacion-legitima");
  await wait(3100);
});

test("cierre durante vinculación cancela el temporizador de pairing code", async (t) => {
  const d = temp(t);
  const h = harness(d, { pairingMethod: "code", pairingNumber: "5215512345678" });
  await h.conexion.start();
  await disconnect(h, DisconnectReason.loggedOut);
  await wait(3300);
  assert.equal(h.pairingRequests, 0, "no debe pedir pairing code tras un cierre de sesión");
});

test("restartRequired reconecta, desconexión normal conserva sesión y reconecta", async (t) => {
  // backoffDelay() en retries=1 llega hasta 4800 + 1000 = 5800ms; esperar con margen.
  for (const [code, maxWaitMs] of [
    [DisconnectReason.restartRequired, 2500],
    [DisconnectReason.connectionClosed, 6800],
  ]) {
    const d = temp(t);
    await authConDatos(d);
    const h = harness(d);
    await h.conexion.start();
    await disconnect(h, code);
    const deadline = Date.now() + maxWaitMs;
    while (h.all.length < 2 && Date.now() < deadline) {
      await wait(100);
    }
    assert.ok(h.all.length >= 2, `no reconectó con código ${code}`);
    assert.equal(readCreds(d).testRevision, "original");
    for (const x of h.all) {
      x.s.ev.removeAllListeners();
      x.s.ws.close();
    }
    await wait(3100);
  }
});

test("migración inválida falla y conserva JSON y no deja filas parciales en SQLite Node", async (t) => {
  const d = temp(t);
  const f = path.join(d, "auth.db.json");
  const raw = JSON.stringify({
    creds: { 1: { id: 1, data: '{"registered":true}' } },
    signal_keys: { x: { category: "cat", id: "id", data: null } },
  });
  fs.writeFileSync(f, raw);
  await assert.rejects(() => useSQLiteAuthState(d), /Migración JSON cancelada/);
  assert.equal(fs.readFileSync(f, "utf8"), raw);

  const db = new DatabaseSync(path.join(d, "auth.db"));
  assert.equal(db.prepare("SELECT count(*) AS n FROM creds").get().n, 0);
  db.close();

  fs.writeFileSync(
    f,
    JSON.stringify({
      creds: { 1: { id: 1, data: '{"registered":true}' } },
      signal_keys: { x: { category: "cat", id: "id", data: "{}" } },
    }),
  );
  const a = await useSQLiteAuthState(d);
  assert.equal(a.state.creds.registered, true);
  a.close();
});

test("seis restartRequired seguidos detienen reconexión, registran error y conservan credenciales", async (t) => {
  const d = temp(t);
  await authConDatos(d);
  const h = harness(d);
  await h.conexion.start();
  for (let i = 0; i < 6; i++) {
    await disconnect(h, DisconnectReason.restartRequired);
    if (i < 5) await h.conexion.start();
  }
  assert.equal(h.all.length, 6);
  assert.equal(h.stopped, 1);
  assert.ok(h.eng.errores.some((e) => e?.message === "session_requires_review"));
  await wait(1300);
  await h.conexion.start();
  assert.equal(h.all.length, 6);
  assert.equal(readCreds(d).testRevision, "original");
  await wait(2000);
});
