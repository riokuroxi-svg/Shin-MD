/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Tests del endurecimiento del panel (auditoría 2026-09-25):
// usuario verificado + candado anti fuerza bruta.
import { test } from "node:test";
import assert from "node:assert/strict";
import createWebServer from "#server";

function mockEngine() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getStatus: () => ({ score: 0, level: "safe", events: 0 }) }),
    getSendQueue: () => ({ length: () => 0, isPaused: () => false }),
    bootTime: Date.now() - 60000,
  };
}

async function withExposedPanel(pass, fn) {
  const prevLoop = process.env.LOOPBACK, prevPass = process.env.PANEL_PASSWORD;
  process.env.LOOPBACK = "0";
  process.env.PANEL_PASSWORD = pass;
  let web;
  try {
    web = createWebServer(mockEngine(), { port: 0 });
    await new Promise(r => web.server.once("listening", r));
    await fn("http://127.0.0.1:" + web.server.address().port);
  } finally {
    if (web) web.close();
    if (prevLoop === undefined) delete process.env.LOOPBACK; else process.env.LOOPBACK = prevLoop;
    if (prevPass === undefined) delete process.env.PANEL_PASSWORD; else process.env.PANEL_PASSWORD = prevPass;
  }
}

function basic(user, pass) {
  return { Authorization: "Basic " + Buffer.from(user + ":" + pass).toString("base64") };
}

test("auditoría: usuario incorrecto se rechaza aunque la contraseña sea correcta", async () => {
  await withExposedPanel("clave-x", async base => {
    const r = await fetch(base + "/health", { headers: basic("hacker", "clave-x") });
    assert.equal(r.status, 401, "otro usuario no debe pasar");
    const ok = await fetch(base + "/health", { headers: basic("admin", "clave-x") });
    assert.equal(ok.status, 200, "admin con buena contraseña sí");
  });
});

test("auditoría: 10 intentos fallidos bloquean la IP con 429", async () => {
  await withExposedPanel("clave-y", async base => {
    let last;
    for (let i = 0; i < 10; i++) {
      last = await fetch(base + "/health", { headers: basic("admin", "mala-" + i) });
    }
    assert.equal(last.status, 401, "los primeros 10 van en 401");
    const once = await fetch(base + "/health", { headers: basic("admin", "mala-11") });
    assert.equal(once.status, 429, "el intento 11 ya está bloqueado");
    // ni con la contraseña correcta pasa mientras esté bloqueado
    const real = await fetch(base + "/health", { headers: basic("admin", "clave-y") });
    assert.equal(real.status, 429, "el bloqueo aplica aunque aciertes");
  });
});
