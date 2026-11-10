/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  cortes.js — ¿Por qué se cae la conexión tantas veces?
//
//  El código 428 («connectionClosed») es el más común y el más mudo: dice
//  que la conexión se cerró, no quién la cerró. En un móvil hay dos causas
//  que se llevan casi todos los casos y las dos se pueden mirar:
//
//    · Android durmiendo la app: sin `termux-wake-lock` y con la batería
//      optimizando Termux, el proceso se congela al bloquear la pantalla y
//      el websocket muere. Se ve como cortes cada pocos minutos.
//    · Dos instancias con la misma sesión: WhatsApp solo admite una
//      conexión por dispositivo vinculado; la segunda empuja a la primera
//      y las dos se van turnando. Se ve como cortes cada pocos segundos,
//      para siempre.
//
//  Contar los cortes y decirlo es todo lo que hace este archivo. No
//  arregla nada por su cuenta: una pista falsa es peor que ninguna.
// ═══════════════════════════════════════════════════════════════════

/** Ventana en la que unos cortes cuentan como «seguidilla». */
export const VENTANA_MS = 10 * 60 * 1000;

/** A partir de cuántos cortes en la ventana merece la pena avisar. */
export const CORTES_PARA_AVISAR = 3;

/**
 * Cuenta los cortes recientes y, si son muchos, devuelve una pista.
 *
 * @param {number[]} marcas marcas de tiempo (ms) de cada corte
 * @param {number} [ahora]
 * @param {number} [ventanaMs]
 * @returns {{ recientes: number, pista: string|null }}
 */
export function analizarCortes(marcas, ahora = Date.now(), ventanaMs = VENTANA_MS) {
  const lista = Array.isArray(marcas) ? marcas.filter((t) => Number.isFinite(t)) : [];
  const recientes = lista.filter((t) => ahora - t <= ventanaMs && t <= ahora).length;
  if (recientes < CORTES_PARA_AVISAR) return { recientes, pista: null };

  const minutos = Math.round(ventanaMs / 60000);
  return {
    recientes,
    pista:
      `Se cortó ${recientes} veces en ${minutos} minutos. Las dos causas habituales:\n` +
      `     · Android durmiendo la app — ejecuta "termux-wake-lock" y quita la optimización\n` +
      `       de batería a Termux.\n` +
      `     · Otra instancia conectada con la misma sesión — WhatsApp admite una sola;\n` +
      `       mira que no haya el bot corriendo en otro sitio.`,
  };
}

/**
 * Se queda con los cortes de la ventana, para no crecer sin fin.
 * @param {number[]} marcas
 * @param {number} [ahora]
 * @param {number} [ventanaMs]
 */
export function podarCortes(marcas, ahora = Date.now(), ventanaMs = VENTANA_MS) {
  return (Array.isArray(marcas) ? marcas : []).filter((t) => ahora - t <= ventanaMs);
}

export default { analizarCortes, podarCortes, VENTANA_MS, CORTES_PARA_AVISAR };
