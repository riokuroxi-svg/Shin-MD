/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  dia.js — el «día» del bot, en su hora, no en UTC
//
//  El tope diario se reiniciaba a medianoche UTC. Para un bot en México
//  eso son las 6 de la tarde: el cupo nuevo aparecía justo cuando el
//  día de trabajo termina, y la curva circadiana —que sí usa hora
//  local— decía lo contrario. Los dos módulos se creían coordinados y
//  estaban desfasados 6 horas.
//
//  Aquí hay una sola definición de «día»: la fecha del reloj del
//  sistema (la del `TZ` del proceso).
// ═══════════════════════════════════════════════════════════════════

/**
 * El día de `t` como «YYYY-MM-DD» en hora local.
 * @param {number|Date} [t]
 * @returns {string}
 */
export function diaLocal(t = Date.now()) {
  const d = t instanceof Date ? t : new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Días enteros entre dos «YYYY-MM-DD».
 *
 * Se calculan sobre fechas UTC a propósito: así un cambio de horario de
 * verano no convierte un día en 23 horas y descoloca la rampa.
 *
 * @param {string} desde
 * @param {string} hasta
 * @returns {number} negativo si `hasta` es anterior
 */
export function diasEntre(desde, hasta) {
  const a = String(desde).split("-").map(Number);
  const b = String(hasta).split("-").map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(Number.isNaN) || b.some(Number.isNaN)) return 0;
  const ms = Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2]);
  return Math.round(ms / 86400000);
}

/** ¿Es una fecha «YYYY-MM-DD» válida? */
export function esDia(valor) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

export default { diaLocal, diasEntre, esDia };
