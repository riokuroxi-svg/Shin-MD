/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  entrada.test.js — la puerta de los mensajes que llegan.
//
//  Reglas que fija:
//    · nunca hay más handlers a la vez que `concurrentes`
//    · lo que entra, se atiende, y en orden
//    · si la espera se llena, se descarta y se cuenta (no se cuelga)
//    · un handler que revienta no tumba la puerta
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { crearEntrada } from "../src/lib/entrada.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test("nunca hay más handlers a la vez que el tope", async () => {
  const entrada = crearEntrada({ concurrentes: 3 });
  let vivos = 0;
  let pico = 0;

  const tareas = [];
  for (let i = 0; i < 30; i += 1) {
    tareas.push(
      entrada.ejecutar(async () => {
        vivos += 1;
        if (vivos > pico) pico = vivos;
        await dormir(2);
        vivos -= 1;
        return i;
      }),
    );
  }

  const res = await Promise.all(tareas);
  assert.equal(pico, 3, "el pico de concurrencia tiene que ser el tope");
  assert.deepEqual(res, [...Array(30).keys()], "todos se atienden, en orden");
});

test("la espera llena descarta y lo cuenta, sin colgarse", async () => {
  const entrada = crearEntrada({ concurrentes: 1, enEspera: 5 });
  let avisos = 0;

  const primera = entrada.ejecutar(() => dormir(20));
  const enEspera = [];
  for (let i = 0; i < 6; i += 1) enEspera.push(entrada.ejecutar(() => dormir(1)));

  const avisosEntrada = crearEntrada({
    concurrentes: 1,
    enEspera: 0,
    alDescartar: () => {
      avisos += 1;
    },
  });
  const bloqueada = avisosEntrada.ejecutar(() => dormir(20));
  const descartada = await avisosEntrada.ejecutar(() => dormir(1));

  assert.deepEqual(descartada, { descartado: true }, "con la espera llena se descarta");
  assert.equal(avisos, 1, "y se avisa una vez");
  assert.equal(avisosEntrada.stats().descartados, 1);

  await Promise.all([primera, ...enEspera, bloqueada]);
  assert.equal(entrada.stats().descartados, 1, "con 1 en marcha y 5 en espera, la sexta se descarta");
});

test("un handler que revienta no tumba la puerta", async () => {
  const entrada = crearEntrada({ concurrentes: 1 });
  const mala = entrada.ejecutar(async () => {
    throw new Error("boom");
  });
  await assert.rejects(mala, /boom/);
  const buena = await entrada.ejecutar(async () => "sigo vivo");
  assert.equal(buena, "sigo vivo");
  assert.equal(entrada.stats().activos, 0);
});

test("vaciar() suelta a los que esperan", async () => {
  const entrada = crearEntrada({ concurrentes: 1, enEspera: 10 });
  const corriendo = entrada.ejecutar(() => dormir(20));
  const esperando = [entrada.ejecutar(() => "nunca"), entrada.ejecutar(() => "nunca")];

  const soltados = entrada.vaciar();
  assert.equal(soltados, 2);
  const res = await Promise.all(esperando);
  assert.deepEqual(res, [{ descartado: true }, { descartado: true }]);
  await corriendo;
});

test("las stats dicen la verdad", async () => {
  const entrada = crearEntrada({ concurrentes: 2, enEspera: 10 });
  await Promise.all([1, 2, 3, 4].map(() => entrada.ejecutar(() => dormir(1))));
  const s = entrada.stats();
  assert.equal(s.atendidos, 4);
  assert.equal(s.activos, 0);
  assert.equal(s.enEspera, 0);
  assert.equal(s.maxVisto, 2);
});
