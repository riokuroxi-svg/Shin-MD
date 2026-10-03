/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tiempo.test.js — Las duraciones en palabras.
//
//  Estos valores son los que se ven en los mensajes de cooldown del bot,
//  así que van clavados uno a uno: si alguien cambia el formateo, la
//  prueba lo dice antes de que lo note un usuario.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { tiempoLargo, tiempoCorto } from "../src/lib/tiempo.js";

test("tiempoLargo: tramos cortos, singular y plural correctos", () => {
  assert.equal(tiempoLargo(1000), "1 segundo");
  assert.equal(tiempoLargo(2000), "2 segundos");
  assert.equal(tiempoLargo(59000), "59 segundos");
  assert.equal(tiempoLargo(60000), "1 minuto");
  assert.equal(tiempoLargo(90000), "1 minuto y 30 segundos");
  assert.equal(tiempoLargo(120000), "2 minutos");
});

test("tiempoLargo: una hora o más ya no muestra segundos sueltos", () => {
  assert.equal(tiempoLargo(3600000), "1 hora");
  assert.equal(tiempoLargo(5400000), "1 hora y 30 minutos");
  assert.equal(tiempoLargo(7200000), "2 horas");
  assert.equal(tiempoLargo(86399000), "23 horas y 59 minutos");
});

test("tiempoLargo: días, con la 'y' solo antes del último tramo", () => {
  assert.equal(tiempoLargo(86400000), "1 día");
  assert.equal(tiempoLargo(90000000), "1 día y 1 hora");
  assert.equal(tiempoLargo(90061000), "1 día, 1 hora y 1 minuto");
  assert.equal(tiempoLargo(172800000), "2 días");
});

test("tiempoLargo: cero, negativos y basura no rompen nada", () => {
  assert.equal(tiempoLargo(0), "0 segundos");
  assert.equal(tiempoLargo(999), "0 segundos");
  assert.equal(tiempoLargo(-5000), "0 segundos");
  assert.equal(tiempoLargo(NaN), "0 segundos");
  assert.equal(tiempoLargo(undefined), "0 segundos");
});

test("tiempoLargo: el caso que estaba roto — un cooldown de 1 hora justa", () => {
  // Antes de unificar, 10 de las 25 copias decían "00 segundo" o
  // "60 minutos" para una hora. Esto es lo que hay que ver ahora.
  for (const ms of [3600000, 3661000, 5400000]) {
    assert.doesNotMatch(tiempoLargo(ms), /00 segundo|60 minutos|00 minuto/);
  }
});

test("tiempoCorto: la forma compacta de las tablas", () => {
  assert.equal(tiempoCorto(0), "0s");
  assert.equal(tiempoCorto(59000), "59s");
  assert.equal(tiempoCorto(90000), "1m 30s");
  assert.equal(tiempoCorto(3600000), "1h");
  assert.equal(tiempoCorto(5400000), "1h 30m");
  assert.equal(tiempoCorto(90061000), "1d 1h 1m 1s");
  assert.equal(tiempoCorto(86400000), "1d");
});

test("las dos formas usan floor (nunca redondean hacia arriba)", () => {
  assert.equal(tiempoLargo(239000), "3 minutos y 59 segundos");
  assert.equal(tiempoCorto(239000), "3m 59s");
});
