/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  limite-minuto.test.js — el techo de salida por minuto.
//
//  El ritmo por mensaje decide cuánto espera CADA envío; esto decide
//  cuántos salen en total, que es como lo cuenta el servidor.
//
//  Reglas:
//    · sin techo (0) no hay límite, como siempre
//    · con techo, en régimen no se pasa (se mide la media, no el pico)
//    · la ráfaga inicial es pequeña: al reiniciar no sale un minuto de golpe
//    · las respuestas de prioridad no gastan ficha
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { createSendQueue } from "../src/network/queue.js";

const throttlerNulo = {
  canSend: () => true,
  recordSent: () => {},
  calcDelay: () => 0,
  getStats: () => ({}),
};

test("sin techo no limita nada", async () => {
  const q = createSendQueue(throttlerNulo, null, { maxPorMinuto: 0, reintentos: 0 });
  const t0 = Date.now();
  const envios = [];
  for (let i = 0; i < 30; i += 1) envios.push(q.enqueue(async () => "ok", { destino: "c@g.us" }));
  await Promise.all(envios);
  assert.ok(Date.now() - t0 < 1000, "30 envíos sin techo no deberían esperar");
});

test("en régimen no se pasa del techo por minuto", async () => {
  // 3000/min = 50/s. Con 10 de ráfaga, 60 envíos tardan ~1 s.
  const q = createSendQueue(throttlerNulo, null, { maxPorMinuto: 3000, reintentos: 0 });
  const tiempos = [];
  const envios = [];
  for (let i = 0; i < 60; i += 1) {
    envios.push(q.enqueue(async () => {
      tiempos.push(Date.now());
    }, { destino: "c@g.us" }));
  }
  await Promise.all(envios);

  // Se mide el RÉGIMEN, no la media total: los primeros envíos salen de la
  // ráfaga inicial y contar eso como si fuera el ritmo infla la cifra.
  const desde = 15;
  const segundos = (tiempos[tiempos.length - 1] - tiempos[desde]) / 1000;
  const porMinuto = ((tiempos.length - 1 - desde) / segundos) * 60;
  assert.ok(porMinuto <= 3000 * 1.05, `en régimen no debería pasar de 3000/min (fue ${Math.round(porMinuto)}/min)`);
});

test("la ráfaga inicial es pequeña: al arrancar no sale un minuto entero", async () => {
  const q = createSendQueue(throttlerNulo, null, { maxPorMinuto: 6000, rafagaInicial: 5, reintentos: 0 });
  const tiempos = [];
  const envios = [];
  for (let i = 0; i < 40; i += 1) {
    envios.push(q.enqueue(async () => {
      tiempos.push(Date.now());
    }, { destino: "c@g.us" }));
  }
  await Promise.all(envios);
  // Los primeros `rafagaInicial` salen casi de golpe; el resto va al ritmo.
  const deGolpe = tiempos.filter((t) => t - tiempos[0] < 20).length;
  assert.ok(deGolpe <= 8, `la ráfaga no debería pasar de la configurada (salieron ${deGolpe} de golpe)`);
});

test("las respuestas de prioridad no gastan ficha", async () => {
  const q = createSendQueue(throttlerNulo, null, { maxPorMinuto: 60, rafagaInicial: 1, reintentos: 0 });
  const normal = q.enqueue(async () => "normal", { destino: "c@g.us" });
  const prioridad = q.enqueue(async () => "prioridad", { destino: "d@g.us", isPriority: true });
  const [a, b] = await Promise.all([normal, prioridad]);
  assert.equal(a, "normal");
  assert.equal(b, "prioridad", "la de prioridad tiene que pasar aunque no queden fichas");
});
