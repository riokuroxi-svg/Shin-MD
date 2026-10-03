/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  xp.js — Cuánto XP pide cada nivel.
//
//  Estaba copiado en 4 comandos (level, profile, profile/level, lboard)
//  con la fórmula repetida. Los números no cambiaron: son los mismos de
//  antes, solo que ahora viven en un sitio.
//
//  OJO — dos curvas distintas conviven en el bot, y esto NO es un cambio
//  de comportamiento, es un espejo de lo que ya había:
//    · El perfil (profile, profile/level, lboard) usa CRECIMIENTO.
//    · El comando .level usa CRECIMIENTO_LEVEL (el doble de curva: pide
//      muchísimo más XP para el mismo nivel).
//  Un mismo usuario ve números distintos según el comando. Hay que
//  decidir cuál de las dos curvas se queda; hasta entonces, se dejan las
//  dos tal cual para no cambiarle el nivel a nadie.
// ═══════════════════════════════════════════════════════════════════

/** Exponente que usa el perfil (el que usa la mayoría de los comandos). */
export const CRECIMIENTO = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75;

/** Exponente que usa el comando .level (curva mucho más alta). */
export const CRECIMIENTO_LEVEL = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 1.5;

/**
 * Rango de XP de un nivel.
 * @param {number} nivel
 * @param {number} [multiplicador] por defecto el global del bot (2)
 * @param {number} [crecimiento] curva a usar (ver arriba)
 * @returns {{min: number, max: number, xp: number}}
 */
export function xpRange(nivel, multiplicador = global.multiplier || 2, crecimiento = CRECIMIENTO) {
  if (nivel < 0) throw new TypeError("level cannot be negative value");
  nivel = Math.floor(nivel);
  const min = nivel === 0 ? 0 : Math.round(Math.pow(nivel, crecimiento) * multiplicador) + 1;
  const max = Math.round(Math.pow(nivel + 1, crecimiento) * multiplicador);
  return { min, max, xp: max - min };
}

export default { xpRange, CRECIMIENTO, CRECIMIENTO_LEVEL };
