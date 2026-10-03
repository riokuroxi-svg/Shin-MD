/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  random.test.js — Prueba de que unificar el azar NO cambió nada.
//
//  Antes de este refactor, la fórmula mágica
//      Math.floor(Math.random() * (max - min + 1)) + min
//  estaba escrita 46 veces a mano. Ahora es `randomInt(min, max)`.
//
//  Este test NO comprueba "que randomInt sea razonable": comprueba que
//  da EXACTAMENTE el mismo número que la expresión original, con
//  Math.random fijado a los mismos valores. Si alguien cambia la
//  fórmula, los premios del bot cambiarían y este test lo dice.
// ═══════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

import { randomInt, pickRandom, chance } from "../src/lib/random.js";

/** Ejecuta `fn` con Math.random() devolviendo siempre `valor`. */
function conRandom(valor, fn) {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// Valores de Math.random que cubren los bordes: 0 exacto (mínimo),
// casi 1 (máximo), 1 exacto (nunca ocurre en JS pero hay que saber qué
// hace) y valores intermedios.
const MUESTRAS = [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 0.9999999999];

// Pares min/max extraídos de los usos reales del bot (niveles, premios,
// loot, dados) más casos límite.
const RANGOS = [
  [1, 5], [1, 12], [1, 20], [1, 15], [1, 100], [1, 101], [1, 6],
  [5000, 8000], [100, 500], [9000, 11000], [14000, 18000], [0, 1],
  [5, 5], [-10, 10], [1, 1000000],
];

test("randomInt devuelve exactamente la fórmula original", () => {
  for (const [min, max] of RANGOS) {
    for (const r of MUESTRAS) {
      const esperado = conRandom(r, () => Math.floor(Math.random() * (max - min + 1)) + min);
      const obtenido = conRandom(r, () => randomInt(min, max));
      assert.equal(
        obtenido,
        esperado,
        `randomInt(${min}, ${max}) con random=${r}: esperaba ${esperado}, dio ${obtenido}`
      );
    }
  }
});

test("randomInt respeta los límites del rango", () => {
  for (const [min, max] of RANGOS) {
    const valores = new Set();
    for (let i = 0; i < 500; i++) valores.add(randomInt(min, max));
    for (const v of valores) {
      assert.ok(v >= min && v <= max, `${v} fuera de [${min}, ${max}]`);
      assert.ok(Number.isInteger(v), `${v} no es entero`);
    }
  }
});

test("randomInt con min===max siempre devuelve ese valor", () => {
  for (const r of MUESTRAS) {
    assert.equal(conRandom(r, () => randomInt(7, 7)), 7);
  }
});

test("pickRandom devuelve exactamente la expresión original", () => {
  const listas = [[], ["a"], ["a", "b"], [1, 2, 3, 4, 5], ["x", "y", "z", "w", "v", "u", "t"]];
  for (const lista of listas) {
    for (const r of MUESTRAS) {
      const esperado = conRandom(r, () => lista[Math.floor(Math.random() * lista.length)]);
      const obtenido = conRandom(r, () => pickRandom(lista));
      assert.equal(obtenido, esperado, `pickRandom con random=${r} y lista de ${lista.length}`);
    }
  }
});

test("pickRandom con lista vacía o no-array no lanza (como antes)", () => {
  // El original con lista vacía daba undefined, no error: se conserva.
  assert.equal(pickRandom([]), undefined);
  assert.equal(pickRandom(null), undefined);
  assert.equal(pickRandom(undefined), undefined);
  assert.equal(pickRandom("no es array"), undefined);
});

test("pickRandom siempre devuelve un elemento de la lista", () => {
  const lista = ["café", "té", "agua"];
  for (const r of MUESTRAS) {
    const v = conRandom(r, () => pickRandom(lista));
    assert.ok(lista.includes(v), `${v} no pertenece a la lista`);
  }
});

test("chance(0) nunca acierta y chance(100) siempre", () => {
  assert.equal(conRandom(0, () => chance(0)), false);
  assert.equal(conRandom(0.999999, () => chance(0)), false);
  assert.equal(conRandom(0, () => chance(100)), true);
  // chance(50): por debajo acierta, por encima no
  assert.equal(conRandom(0.49, () => chance(50)), true);
  assert.equal(conRandom(0.51, () => chance(50)), false);
});
