/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  random.js — Azar del bot, en un solo sitio.
//
//  ANTES: 46 usos de la fórmula mágica
//      Math.floor(Math.random() * (max - min + 1)) + min
//  repartida por 16 archivos, más 9 copias de `pickRandom` y 17 usos
//  escritos a mano del mismo `arr[Math.floor(Math.random() * arr.length)]`.
//
//  AHORA: dos funciones con nombre, y una sola implementación.
//  La fórmula es EXACTAMENTE la misma (hay un test que lo demuestra
//  comparando contra la expresión original con Math.random fijado):
//  ese test es la garantía de que unificar no cambió ningún premio,
//  ninguna probabilidad y ningún dado.
// ═══════════════════════════════════════════════════════════════════

/**
 * Entero aleatorio en [min, max], AMBOS INCLUIDOS.
 * Equivale a: Math.floor(Math.random() * (max - min + 1)) + min
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Un elemento al azar de una lista. `undefined` si la lista está vacía
 * o no es un array (mismo comportamiento que la expresión original:
 * `list[Math.floor(Math.random()*list.length)]` con lista vacía da
 * `undefined`, no un error).
 * @template T
 * @param {T[]} list
 * @returns {T|undefined}
 */
export function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * `true` con probabilidad `porcentaje` (0-100).
 * Reemplaza al patrón `Math.random() * 100 < X` repartido por el bot.
 * @param {number} porcentaje
 * @returns {boolean}
 */
export function chance(porcentaje) {
  return Math.random() * 100 < porcentaje;
}

export default { randomInt, pickRandom, chance };
