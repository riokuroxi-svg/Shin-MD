/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tiempo.js — Duraciones en palabras, en un solo sitio.
//
//  ANTES: 25 copias locales de `msToTime` / `formatTime` repartidas por
//  el bot, con 25 comportamientos distintos (se comprobó ejecutándolas
//  todas con los mismos valores). Algunas estaban rotas: un cooldown de
//  más de una hora se mostraba como "00 segundo" o "60 minutos".
//
//  AHORA: dos funciones con nombre y con test.
//
//    tiempoLargo(ms) → lo que se lee en un mensaje.
//        "45 segundos" · "1 minuto y 30 segundos" · "1 hora"
//        "1 hora y 30 minutos" · "1 día, 1 hora y 1 minuto"
//      Los segundos solo aparecen en tramos de menos de una hora
//      (en "2 días y 3 horas" nadie quiere leer los segundos).
//
//    tiempoCorto(ms) → lo que se lee en una tabla o estado.
//        "45s" · "1m 30s" · "1h" · "1h 30m" · "1d 1h 1m 1s"
//
//  Ambas cuentan con Math.floor: 90000 ms son "1 minuto y 30 segundos",
//  nunca "2 minutos".
// ═══════════════════════════════════════════════════════════════════

/** Trocea una cantidad de milisegundos en días, horas, minutos y segundos. */
function descomponer(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** "1 día" / "2 días": el plural solo cuando toca. */
function unidad(n, singular, plural) {
  return `${n} ${n === 1 ? singular : (plural || singular + "s")}`;
}

/**
 * Duración en palabras, para leer. Ver la cabecera para los ejemplos.
 * @param {number} ms
 * @returns {string}
 */
export function tiempoLargo(ms) {
  const { d, h, m, s } = descomponer(ms);
  const partes = [];
  if (d) partes.push(unidad(d, "día"));
  if (h) partes.push(unidad(h, "hora"));
  if (m) partes.push(unidad(m, "minuto"));
  // Los segundos solo en tramos cortos: "1 hora y 1 minuto", sin el segundo suelto.
  if (s && !d && !h) partes.push(unidad(s, "segundo"));
  if (!partes.length) return "0 segundos";
  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/**
 * Duración compacta, para tablas y estados. Ver la cabecera.
 * @param {number} ms
 * @returns {string}
 */
export function tiempoCorto(ms) {
  const { d, h, m, s } = descomponer(ms);
  const partes = [];
  if (d) partes.push(d + "d");
  if (h) partes.push(h + "h");
  if (m) partes.push(m + "m");
  // Los segundos se muestran si existen o si no hay ninguna otra unidad
  // (así "0s" no se queda en blanco).
  if (s || !partes.length) partes.push(s + "s");
  return partes.join(" ");
}

export default { tiempoLargo, tiempoCorto };
