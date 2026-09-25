/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import createWebServer from "#server";

function mockEngine() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getStatus: () => ({ score: 3, level: "safe", events: 2 }) }),
    getSendQueue: () => ({ length: () => 1, isPaused: () => false }),
    bootTime: Date.now() - 60000,
  };
}

test("B5.2: LOOPBACK=0 sin PANEL_PASSWORD vuelve a loopback (failsafe)", () => {
  const prevLoop = process.env.LOOPBACK, prevPass = process.env.PANEL_PASSWORD;
  process.env.LOOPBACK = "0";
  delete process.env.PANEL_PASSWORD;
  try {
    const web = createWebServer(mockEngine(), { port: 0 });
    assert.equal(web.host, "127.0.0.1", "sin contraseña no debe exponerse en red");
    web.close();
  } finally {
    if (prevLoop === undefined) delete process.env.LOOPBACK; else process.env.LOOPBACK = prevLoop;
    if (prevPass !== undefined) process.env.PANEL_PASSWORD = prevPass;
  }
});

test("B5.2: panel expuesto exige PANEL_PASSWORD (Basic auth)", async () => {
  const prevLoop = process.env.LOOPBACK, prevPass = process.env.PANEL_PASSWORD;
  process.env.LOOPBACK = "0";
  process.env.PANEL_PASSWORD = "clave-secreta-123";
  let web;
  try {
    web = createWebServer(mockEngine(), { port: 0 });
    assert.equal(web.host, "0.0.0.0");
    await new Promise(r => web.server.once("listening", r));
    const base = "http://127.0.0.1:" + web.server.address().port;

    const sin = await fetch(base + "/health");
    assert.equal(sin.status, 401, "sin contraseña debe rechazar");

    const con = await fetch(base + "/health", {
      headers: { Authorization: "Basic " + Buffer.from("admin:clave-secreta-123").toString("base64") },
    });
    assert.equal(con.status, 200, "con contraseña debe responder");
    const body = await con.json();
    assert.equal(body.ok, true);

    const mala = await fetch(base + "/health", {
      headers: { Authorization: "Basic " + Buffer.from("admin:incorrecta").toString("base64") },
    });
    assert.equal(mala.status, 401, "contraseña incorrecta debe rechazar");
  } finally {
    if (web) web.close();
    if (prevLoop === undefined) delete process.env.LOOPBACK; else process.env.LOOPBACK = prevLoop;
    if (prevPass === undefined) delete process.env.PANEL_PASSWORD; else process.env.PANEL_PASSWORD = prevPass;
  }
});

test("web server serves root, health and metrics", async () => {
  const web = createWebServer(mockEngine(), { port: 0, host: "127.0.0.1" });
  await new Promise(r => web.server.once("listening", r));
  const port = web.server.address().port;
  const base = "http://127.0.0.1:" + port;

  const root = await (await fetch(base + "/")).json();
  assert.equal(root.ok, true);
  assert.equal(root.name, "Shin-MD");
  assert.equal(root.engine, "RUNNING");

  const health = await (await fetch(base + "/health")).json();
  assert.equal(health.ok, true);
  assert.equal(health.state, "RUNNING");
  assert.ok(health.risk.score >= 0);
  assert.equal(health.queue, 1);

  const metrics = await (await fetch(base + "/metrics")).json();
  assert.equal(metrics.ok, true);
  assert.equal(metrics.engine.state, "RUNNING");
  assert.ok(metrics.memory.rssMB > 0);
  assert.ok(metrics.process.node.startsWith("v"));

  web.close();
});
