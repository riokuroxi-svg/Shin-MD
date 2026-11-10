/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  esperas.test.js — una espera no puede durar más que ella misma.
//
//  El caso que lo motivó: `.code` contestó «Debes esperar *20685 días, 13
//  horas y 37 minutos*». La cuenta era correcta; el dato guardado no (una
//  fecha 57 años por delante). Sin comprobación, ese número es un castigo de
//  por vida: el comando queda inutilizable para siempre.
//
//  Aquí se fija que:
//   · un dato imposible se da por cumplido (y se marca, para poder limpiarlo);
//   · un dato bueno sigue frenando lo que tiene que frenar;
//   · sin dato, no hay espera.
// ═══════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import { esperaRestante, tiempoLargo } from "../src/lib/tiempo.js";

const COOLDOWN = 80_000;
const AHORA = 1_762_000_000_000;

test("sin registro guardado no hay espera", () => {
  for (const vacio of [0, null, undefined, "", "hola", NaN, -5]) {
    const r = esperaRestante(vacio, COOLDOWN, AHORA);
    assert.equal(r.esperaMs, 0, `con ${String(vacio)} no frena`);
    assert.equal(r.corrupto, false, `con ${String(vacio)} no es corrupción`);
  }
});

test("un registro reciente frena lo que queda, ni más ni menos", () => {
  const hace10s = AHORA - 10_000;
  const r = esperaRestante(hace10s, COOLDOWN, AHORA);
  assert.equal(r.esperaMs, 70_000, "quedan 70 s de los 80");
  assert.equal(r.corrupto, false);
  assert.equal(tiempoLargo(r.esperaMs), "1 minuto y 10 segundos");
});

test("pasado el cooldown se puede volver a intentar", () => {
  const hace2min = AHORA - 120_000;
  assert.equal(esperaRestante(hace2min, COOLDOWN, AHORA).esperaMs, 0);
});

test("justo en el borde: el último milisegundo todavía espera", () => {
  assert.equal(esperaRestante(AHORA - COOLDOWN + 1, COOLDOWN, AHORA).esperaMs, 1);
  assert.equal(esperaRestante(AHORA - COOLDOWN, COOLDOWN, AHORA).esperaMs, 0);
});

test("el caso del reporte: una fecha 57 años por delante no bloquea", () => {
  // Lo que salió en WhatsApp: 20685 días, 13 h, 37 min.
  const imposible = AHORA + 20_685 * 86_400_000 + 13 * 3_600_000 + 37 * 60_000 - COOLDOWN;
  const r = esperaRestante(imposible, COOLDOWN, AHORA);
  assert.equal(r.esperaMs, 0, "no se castiga al usuario");
  assert.equal(r.corrupto, true, "pero queda marcado para limpiarlo");
});

test("cualquier dato del futuro se trata como roto, no como castigo", () => {
  for (const adelanto of [1, 60_000, 86_400_000, 365 * 86_400_000]) {
    const r = esperaRestante(AHORA + adelanto, COOLDOWN, AHORA);
    assert.equal(r.esperaMs, 0, `+${adelanto} ms no frena`);
    assert.equal(r.corrupto, true, `+${adelanto} ms se marca`);
  }
});

test("la espera nunca supera el cooldown que la define", () => {
  for (let i = 0; i < 200; i++) {
    const guardado = AHORA - Math.floor(Math.random() * 200_000);
    const { esperaMs } = esperaRestante(guardado, COOLDOWN, AHORA);
    assert.ok(esperaMs >= 0 && esperaMs <= COOLDOWN, `dentro del rango (${esperaMs})`);
  }
});

test("un cooldown de cero no frena nunca", () => {
  assert.equal(esperaRestante(AHORA - 1, 0, AHORA).esperaMs, 0);
});

test("aguanta que el reloj del servidor se atrase", () => {
  // El guardado es del futuro solo porque el reloj se movió: no es culpa del
  // usuario y no debe dejarlo fuera para siempre.
  const r = esperaRestante(AHORA + 30_000, COOLDOWN, AHORA);
  assert.equal(r.esperaMs, 0);
});
