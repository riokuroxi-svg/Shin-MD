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
import createWebServer from "#server";
import { createWatchdog } from "#watchdog";
import { crearSalud } from "../src/services/salud.js";
import { crearSupervisor } from "../scripts/supervisor.mjs";

function engineBase(overrides = {}) {
  let score = 0;
  let closes = 0;
  const paused = new Set();
  const LIFECYCLE = { BOOT: 0, INIT: 1, CONNECT: 2, RUNNING: 3, SHUTDOWN: 4 };
  return {
    LIFECYCLE,
    bootTime: Date.now() - 60000,
    getState: () => LIFECYCLE.RUNNING,
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({
      getRiskScore: () => score,
      getStatus: () => ({ score, level: score >= 80 ? "critical" : "safe", events: 0 }),
    }),
    getSendQueue: () => ({
      length: () => 0,
      isPaused: () => paused.size > 0,
      motivosPausa: () => [...paused],
      pause: (m) => paused.add(m),
      resume: (m) => paused.delete(m),
      stats: () => ({ sent: 0, errors: 0, retries: 0, dropped: 0 }),
    }),
    getSock: () => ({
      ws: {
        ready: true,
        readyState: 1,
        close() { closes++; },
      },
    }),
    getSesion: () => null,
    _setScore(v) { score = v; },
    _closes: () => closes,
    ...overrides,
  };
}

test("panel web: cualquier host no-loopback sin PANEL_PASSWORD cae a 127.0.0.1", async () => {
  const prevPass = process.env.PANEL_PASSWORD;
  delete process.env.PANEL_PASSWORD;
  try {
    for (const host of ["::", "0.0.0.0", "192.0.2.10"]) {
      const web = createWebServer(engineBase(), { port: 0, host });
      try {
        assert.equal(web.host, "127.0.0.1", `host ${host} debe replegarse a 127.0.0.1`);
      } finally {
        await web.close();
      }
    }
  } finally {
    if (prevPass !== undefined) process.env.PANEL_PASSWORD = prevPass;
  }
});

test("panel web: host IPv6 :: con PANEL_PASSWORD exige autenticación Basic", async () => {
  const prevPass = process.env.PANEL_PASSWORD;
  process.env.PANEL_PASSWORD = "secreto-ipv6-test";
  let web;
  try {
    web = createWebServer(engineBase(), { port: 0, host: "::" });
    assert.equal(web.host, "::");
    await new Promise((r, rej) => {
      web.server.once("listening", r);
      web.server.once("error", rej);
    });
    const base = "http://127.0.0.1:" + web.server.address().port;
    const sinAuth = await fetch(base + "/health");
    assert.equal(sinAuth.status, 401);

    const conAuth = await fetch(base + "/health", {
      headers: { Authorization: "Basic " + Buffer.from("admin:secreto-ipv6-test").toString("base64") },
    });
    assert.equal(conAuth.status, 200);
  } finally {
    if (web) await web.close();
    if (prevPass === undefined) delete process.env.PANEL_PASSWORD;
    else process.env.PANEL_PASSWORD = prevPass;
  }
});

test("supervisor: SIGTERM externo cuenta como caída, mientras IPC restart no consume presupuesto", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-sup-sigterm-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(dir, "index.js"),
    "setTimeout(() => process.kill(process.pid, 'SIGTERM'), 15);\n",
  );

  const caidas = [];
  const reinicios = [];
  const sup = crearSupervisor({
    raiz: dir,
    capturar: true,
    ganchos: {
      cayo: (d) => caidas.push(d),
      reiniciando: (d) => reinicios.push(d),
    },
  });

  const res = await sup.ejecutar();
  assert.equal(res, "rendido");
  assert.equal(reinicios.length, 0, "un SIGTERM externo no debe tratarse como reinicio pedido");
  assert.equal(caidas.length, 4);
  assert.ok(caidas.every((c) => c.signal === "SIGTERM"));
});

test("watchdog: bloquea reconexiones forzadas tras MAX_STRIKES y solo rearma al recuperarse", async () => {
  const eng = engineBase();
  eng._setScore(98);
  const wd = createWatchdog(eng, {
    riskThreshold: 80,
    maxRisk: 95,
    stuckThresholdMs: 60000,
    strikeCooldownMs: 0,
  });

  for (let i = 0; i < 6; i++) wd.check();
  assert.equal(eng._closes(), 3, "no debe superar 3 reconexiones forzadas sin alivio");
  assert.equal(wd.isBreakerTripped(), true);

  // Al bajar el riesgo y haber actividad reciente, rearma el disyuntor
  eng._setScore(10);
  wd.tick();
  wd.check();
  assert.equal(wd.isBreakerTripped(), false);
  assert.equal(wd.getStrikes(), 0);
});

test("watchdog: tampoco supera MAX_STRIKES cuando la conexión está atascada con riesgo bajo", async () => {
  const eng = engineBase();
  const wd = createWatchdog(eng, {
    riskThreshold: 80,
    maxRisk: 95,
    stuckThresholdMs: 15,
    strikeCooldownMs: 0,
  });
  await new Promise((r) => setTimeout(r, 30));
  for (let i = 0; i < 6; i++) wd.check();
  assert.equal(eng._closes(), 3);
  assert.equal(wd.isBreakerTripped(), true);

  wd.tick();
  wd.check();
  assert.equal(wd.isBreakerTripped(), false);
  assert.equal(wd.getStrikes(), 0);
});

test("salud: recibe métricas de entrada diferida mediante función", () => {
  let entrada = null;
  const salud = crearSalud({
    engine: engineBase(),
    entrada: () => (entrada ? entrada.stats() : undefined),
  });
  assert.equal(salud.veredicto().estado, "sano");

  entrada = { stats: () => ({ descartados: 4, enEspera: 2, maxVisto: 8 }) };
  const v = salud.veredicto();
  assert.notEqual(v.estado, "sano");
  assert.ok(v.causas.some((c) => /descart/i.test(c.sintoma || "")));
});
