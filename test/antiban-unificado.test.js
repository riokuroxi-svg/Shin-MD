/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  antiban-unificado.test.js — Garantiza la integración limpia del
//  anti-ban tras la limpieza y unificación:
//   · watchdog usa motivo "riesgo" (no pisa la pausa "conexion")
//   · pause() despierta esperarTurno() de inmediato
//   · router registra entrantes en ritmo (responder no gasta cupo nuevo)
//   · fechas inválidas no bloquean throttler ni ritmo con NaN
//   · engine.onShutdown ejecuta hooks de cierre limpios
// ═══════════════════════════════════════════════════════════════════
const logOriginal = console.log;
console.log = () => {};

import { test, after } from "node:test";
import assert from "node:assert/strict";

const { createEngine } = await import("#engine");
const { createWatchdog } = await import("#watchdog");
const { createThrottler } = await import("#throttler");
const { createRouter } = await import("#router");
const { crearRitmo } = await import("../src/lib/ritmo.js");
const createSendQueue = (await import("#queue")).default;

after(() => {
  console.log = logOriginal;
});

test("watchdog usa el motivo 'riesgo' y no pisa la pausa 'conexion'", () => {
  const engine = createEngine();
  const q = engine.getSendQueue();
  const h = engine.getHealth();
  const w = createWatchdog(engine, { riskThreshold: 20 });

  q.pause("conexion");
  for (let i = 0; i < 6; i++) h.recordError(new Error("403"));
  w.check();
  assert.equal(w.isPaused(), true);
  assert.deepEqual(q.motivos().sort(), ["conexion", "riesgo"]);

  // Al bajar el riesgo o simular health limpio, solo quita "riesgo"
  q.resume("riesgo");
  assert.deepEqual(q.motivos(), ["conexion"], "conexion sigue intacto");
  w.stop();
});

test("throttler y ritmo toleran fechas inválidas sin bloquearse con NaN", () => {
  const t = createThrottler({ warmUpStartDate: "fecha-invalida" });
  const stats = t.getStats();
  assert.ok(Number.isFinite(stats.dailyLimit) && stats.dailyLimit > 0);
  assert.equal(t.canSend(), true);

  const r = crearRitmo({ estado: { inicio: "invalido" } });
  const res = r.resumen();
  assert.ok(Number.isFinite(res.cupoNuevos) && res.cupoNuevos > 0);
});

test("evaluar('') en ritmo no ensucia los contadores por chat", () => {
  const r = crearRitmo({ estado: {} });
  const ev = r.evaluar("");
  assert.equal(typeof ev.ok, "boolean");
  assert.equal(r.resumen().chatsVigilados, 0);
});

test("queue.pause() despierta esperarTurno() sin colgar 60s", async () => {
  let libre = false;
  const th = { canSend: () => libre, calcDelay: () => 1, recordSent: () => {} };
  const q = createSendQueue(th, null);
  const p = q.enqueue(async () => "ok", {});
  await new Promise((r) => setTimeout(r, 40));
  q.pause("conexion");
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(q.isPaused(), true);
  libre = true;
  q.resume("conexion");
  const res = await p;
  assert.equal(res, "ok");
});

test("router registra el chat entrante en ritmo para no gastar cupo nuevo", async () => {
  const engine = createEngine({ throttler: { baseDelayMs: 1 } });
  const router = createRouter(engine);
  const chat = "5215599998888@s.whatsapp.net";
  const sock = {
    user: { id: "521234567890:1@s.whatsapp.net" },
    async sendMessage() { return { key: { id: "R1" } }; },
  };
  await router.handle(sock, {
    key: { remoteJid: chat, participant: chat, fromMe: false, id: "M1" },
    message: { conversation: "hola" },
    messageTimestamp: Math.floor(Date.now() / 1000),
  });
  assert.equal(engine.getRitmo().caliente(chat), true, "el chat queda caliente tras escribir");
});

test("engine.onShutdown ejecuta todos los hooks al apagar", async () => {
  const engine = createEngine();
  const orden = [];
  engine.onShutdown(() => orden.push("primero"));
  engine.onShutdown(async () => orden.push("segundo"));
  await engine.shutdown();
  assert.deepEqual(orden, ["segundo", "primero"]);
});
