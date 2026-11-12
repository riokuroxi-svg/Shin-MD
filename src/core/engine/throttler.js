/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { curvaCircadiana } from "../../lib/ritmo.js";
import { diaLocal, diasEntre, esDia } from "../../lib/dia.js";

function shinJitter(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Perfiles de calentamiento.
 *
 *   auto      la rampa normal: arranca en el tope del primer día y sube.
 *   nuevo     fuerza la rampa (número recién nacido).
 *   veterano  sin rampa: el tope máximo desde hoy. Se activa a mano y avisa.
 */
export const PERFILES = ["auto", "nuevo", "veterano"];

/** El texto del aviso, para poder repetirlo en el log y en `.warmup`. */
export const AVISO_VETERANO = [
  "Perfil veterano: se acaba la rampa de días y el tope entra completo desde hoy.",
  "Lo que se gana: ningún envío espera por «día 1».",
  "Lo que se arriesga: un número nuevo que pasa de 10 a 200 mensajes en un día",
  "es el patrón que más se parece a un disparo masivo. Úsalo con un número que",
  "ya tenga meses de uso normal, o mientras pruebas.",
].join("\n");

const DEFAULTS = {
  baseDelayMs: 1200,
  jitterStddev: 0.25,
  minDelayMs: 400,
  maxDelayMs: 5000,
  msPerChar: 25,
  newContactPenalty: 1.5,
  warmUpDays: 7,
  // El tope diario ya no es la protección de verdad: lo que se cuenta son las
  // conversaciones nuevas (src/lib/ritmo.js). Esto alto deja que un bot de
  // respuestas no se quede a medias a media tarde; el freno que queda es el de
  // conversaciones, que es el que WhatsApp puntúa.
  warmUpStartMsgsPerDay: 20,
  warmUpMaxMsgsPerDay: 2000,
  perfil: "auto",
  // El perfil veterano existe porque nadie quiere esperar días (es su motivo de
  // ser). Saltar de 20 a 2000 el primer día es el patrón de un disparo masivo,
  // así que hay una rampa comprimida disponible... pero APAGADA por defecto:
  // encenderla devuelve la espera que este perfil vino a quitar. Quien quiera
  // el escalón suave pone RAMPA_VETERANO_DIAS=4 y lo sabe.
  rampaVeteranoDias: 0,
  // De noche una persona contesta más despacio: la espera se estira.
  circadiano: true,
};

export function createThrottler(opts) {
  opts = opts || {};
  const config = {};
  for (const k of Object.keys(DEFAULTS)) {
    config[k] = opts[k] !== undefined ? opts[k] : DEFAULTS[k];
  }

  // El «día» es el del reloj del sistema (TZ del proceso), no UTC.
  const hoy = diaLocal();
  const state = {
    perfil: opts.perfil || config.perfil,
    warmUpStartDate: opts.warmUpStartDate || hoy,
    warmUpMsgsToday: Number(opts.warmUpMsgsToday) || 0,
    warmUpLastReset: opts.warmUpLastReset || hoy,
    totalSent: Number(opts.totalSent) || 0,
  };

  function checkReset() {
    const today = diaLocal();
    if (state.warmUpLastReset !== today) {
      state.warmUpMsgsToday = 0;
      state.warmUpLastReset = today;
    }
  }

  /** El perfil que manda: el guardado en el estado y, si no, el de la config. */
  function perfil() {
    return PERFILES.includes(state.perfil) ? state.perfil : "auto";
  }

  /** Días de rampa que toca hoy. Veterano es rampa cero. */
  function diasDeRampa() {
    if (perfil() !== "veterano") return config.warmUpDays;
    return Math.max(0, Number(config.rampaVeteranoDias) || 0);
  }

  /** Día de rampa en que estamos (0 = el primero). Tolera fechas corruptas. */
  function diaDeRampa() {
    if (!esDia(state.warmUpStartDate)) return 0;
    return Math.max(0, diasEntre(state.warmUpStartDate, diaLocal()));
  }

  function getDailyLimit() {
    const rampa = diasDeRampa();
    const day = Math.min(rampa, diaDeRampa());
    const progress = rampa > 0 ? (day / rampa) : 1;
    // Veterano: crecimiento geométrico (×4 por día) en vez de lineal. Parte del
    // mismo tope del día 1 del warm-up y llega al máximo en `rampaVeteranoDias`.
    if (perfil() === "veterano") {
      const tope = config.warmUpMaxMsgsPerDay;
      if (!diasDeRampa()) return tope; // sin rampa: el tope completo, como siempre
      const inicio = Math.max(1, config.warmUpStartMsgsPerDay);
      return Math.round(Math.min(tope, inicio * 4 ** day));
    }
    const range = config.warmUpMaxMsgsPerDay - config.warmUpStartMsgsPerDay;
    return Math.round(config.warmUpStartMsgsPerDay + range * progress);
  }

  function calcDelay(extra) {
    extra = extra || {};
    checkReset();

    if (extra.isPriority) return config.minDelayMs;

    let delay = config.baseDelayMs + shinJitter(0, config.baseDelayMs * config.jitterStddev);

    if (extra.messageLength > 10) {
      delay += Math.min(extra.messageLength * config.msPerChar, 2000);
    }

    if (extra.isNewContact) {
      delay *= config.newContactPenalty;
    }

    // Curva de la hora: 0,8 de día, hasta 2,5 de madrugada. Suave a propósito.
    if (config.circadiano !== false) {
      delay *= curvaCircadiana(new Date()).factor;
    }

    return Math.round(Math.max(config.minDelayMs, Math.min(config.maxDelayMs, delay)));
  }

  function canSend() {
    checkReset();
    return state.warmUpMsgsToday < getDailyLimit();
  }

  function recordSent() {
    checkReset();
    state.warmUpMsgsToday++;
    state.totalSent++;
  }

  /**
   * Cambia el perfil en caliente. Devuelve `{antes, ahora}` o `null` si el
   * nombre no existe (mejor no cambiar nada que cambiarlo a cualquier cosa).
   */
  function cambiarPerfil(nombre) {
    const pedido = String(nombre || "").toLowerCase().trim();
    if (!PERFILES.includes(pedido)) return null;
    const antes = perfil();
    state.perfil = pedido;
    return { antes, ahora: pedido };
  }

  function getStats() {
    checkReset();
    const day = diaDeRampa() + 1;
    return {
      perfil: perfil(),
      day: day,
      dailyLimit: getDailyLimit(),
      msgsToday: state.warmUpMsgsToday,
      totalSent: state.totalSent,
      warmUpComplete: day > diasDeRampa(),
      dailyLimitReached: state.warmUpMsgsToday >= getDailyLimit(),
    };
  }

  return { calcDelay, canSend, recordSent, getStats, cambiarPerfil, perfil, state };
}

let defaultThrottler = null;
export function getThrottler() {
  if (!defaultThrottler) defaultThrottler = createThrottler();
  return defaultThrottler;
}

export default { createThrottler, getThrottler, PERFILES, AVISO_VETERANO };
