/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  xp.test.js — Los números del nivel no cambian.
//
//  Los valores de abajo se sacaron de las 4 copias que había repartidas
//  por los comandos, ANTES de unificarlas. Sirven de red: si algún día
//  un cambio mueve un solo punto de XP, esta prueba lo dice.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { xpRange, CRECIMIENTO, CRECIMIENTO_LEVEL } from "../src/lib/xp.js";

test("la curva del perfil sigue dando los mismos números", () => {
  const esperado = {
    0: { min: 0, max: 2, xp: 2 },
    1: { min: 3, max: 12, xp: 9 },
    2: { min: 13, max: 34, xp: 21 },
    5: { min: 127, max: 202, xp: 75 },
    10: { min: 756, max: 965, xp: 209 },
    25: { min: 8000, max: 8850, xp: 850 },
  };
  for (const [nivel, rango] of Object.entries(esperado)) {
    assert.deepEqual(xpRange(Number(nivel), 2), rango, "nivel " + nivel);
  }
});

test("la curva del comando .level sigue dando los mismos números", () => {
  const esperado = {
    0: { min: 0, max: 2, xp: 2 },
    1: { min: 3, max: 71, xp: 68 },
    2: { min: 72, max: 575, xp: 503 },
    5: { min: 8000, max: 20468, xp: 12468 },
    10: { min: 284666, max: 465204, xp: 180538 },
    25: { min: 31991887, max: 39157758, xp: 7165871 },
  };
  for (const [nivel, rango] of Object.entries(esperado)) {
    assert.deepEqual(xpRange(Number(nivel), 2, CRECIMIENTO_LEVEL), rango, "nivel " + nivel);
  }
});

test("las dos curvas son distintas (esto es lo que hay que decidir algún día)", () => {
  const perfil = xpRange(10, 2, CRECIMIENTO);
  const comando = xpRange(10, 2, CRECIMIENTO_LEVEL);
  assert.notDeepEqual(perfil, comando);
  assert.ok(comando.xp > perfil.xp, "el comando .level pide más XP que el perfil");
});

test("un nivel negativo sigue siendo un error, no un número raro", () => {
  assert.throws(() => xpRange(-1), TypeError);
});

test("sin multiplicador usa el global del bot (2 por defecto)", () => {
  const conGlobal = xpRange(5, global.multiplier || 2);
  assert.deepEqual(xpRange(5), conGlobal);
});
