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

/**
 * Cuánto falta para que se cumpla una espera guardada en la base.
 *
 * Existe por un caso real: `.code` contestó «Debes esperar *20685 días, 13 horas
 * y 37 minutos*». La cuenta estaba bien; el dato guardado era imposible (una
 * fecha en el futuro, 57 años por delante, de un reloj mal puesto o de un campo
 * reusado). Con la comprobación de antes, ese número se convertía en un castigo
 * de por vida: el usuario no podía volver a usar el comando nunca.
 *
 * La regla es simple: **una espera nunca puede ser más larga que ella misma**.
 * Si el resultado se pasa del propio cooldown, el dato está roto, se da por
 * cumplido y se deja constancia para poder limpiarlo.
 *
 * @param {unknown} ultimo    lo guardado (un instante en ms)
 * @param {number} cooldownMs cuánto dura la espera
 * @param {number} [ahora]    reloj, para poder probarlo
 * @returns {{esperaMs:number, corrupto:boolean}} esperaMs = 0 → puede pasar
 */
export function esperaRestante(ultimo, cooldownMs, ahora = Date.now()) {
  const t = Number(ultimo);
  const tope = Math.max(0, Number(cooldownMs) || 0);
  // Sin registro (0, null, undefined) o basura: no hay espera que respetar.
  if (!Number.isFinite(t) || t <= 0 || !tope) return { esperaMs: 0, corrupto: false };

  const falta = t + tope - Number(ahora);
  if (!Number.isFinite(falta) || falta <= 0) return { esperaMs: 0, corrupto: false };
  // Más espera que el propio cooldown solo puede venir de un dato imposible.
  if (falta > tope) return { esperaMs: 0, corrupto: true };
  return { esperaMs: falta, corrupto: false };
}

export default { tiempoLargo, tiempoCorto, esperaRestante };
