/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  temp-cleaner.js — Borra temporales viejos que quedaron tirados.
//
//  Si una descarga o una conversión se corta a la mitad, sus archivos
//  temporales se quedan para siempre y en un bot 24/7 llenan el disco.
//
//  Reglas para no romper nada:
//   · Solo se borra lo que tiene más de 1 hora (TEMP_MAX_AGE_MIN). Lo que
//     está usando una descarga en curso es reciente y no se toca.
//   · En las carpetas del bot (tmp/, temp/, bin/.tmp) se revisa todo.
//   · En la carpeta temporal del sistema SOLO lo que crea el bot
//     (ginko-*, ginko_tts_*, vectorink, in_/out_ de los efectos de audio).
//   · Nunca se siguen enlaces simbólicos ni se tocan archivos ocultos.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import log from "#logger";

const HORA = 60 * 60 * 1000;

/** Nombres que el bot crea en la carpeta temporal del sistema. */
const PATRONES_SISTEMA = [
  /^ginko-/,
  /^ginko_/,
  /^vectorink$/,
  /^(in|out)_\d+_[a-z0-9]+\.mp3$/,
];

/**
 * Carpetas a revisar. `todo` = se revisa todo lo que haya dentro.
 * @param {string} raiz carpeta del bot
 */
export function carpetasTemporales(raiz = process.cwd()) {
  return [
    { dir: path.join(raiz, "tmp"), todo: true },
    { dir: path.join(raiz, "temp"), todo: true },
    { dir: path.join(raiz, "bin", ".tmp"), todo: true },
    { dir: os.tmpdir(), todo: false },
  ];
}

/**
 * Borra lo viejo de las carpetas indicadas.
 * @param {{ carpetas?: {dir: string, todo: boolean}[], maxAgeMs?: number, ahora?: number }} [opts]
 * @returns {number} cuántas entradas se borraron
 */
export function limpiarTemporales(opts = {}) {
  const carpetas = opts.carpetas || carpetasTemporales();
  const maxAgeMs = opts.maxAgeMs ?? HORA;
  const ahora = opts.ahora ?? Date.now();
  let borrados = 0;

  for (const { dir, todo } of carpetas) {
    let nombres = [];
    try {
      nombres = fs.readdirSync(dir);
    } catch {
      continue; // la carpeta no existe: nada que hacer
    }
    for (const nombre of nombres) {
      if (nombre.startsWith(".")) continue;
      if (!todo && !PATRONES_SISTEMA.some((p) => p.test(nombre))) continue;
      const ruta = path.join(dir, nombre);
      try {
        const st = fs.lstatSync(ruta);
        if (st.isSymbolicLink()) continue;
        if (ahora - st.mtimeMs < maxAgeMs) continue;
        fs.rmSync(ruta, { recursive: true, force: true });
        borrados++;
      } catch {
        /* en uso o sin permiso: se intenta en la siguiente vuelta */
      }
    }
  }
  return borrados;
}

/**
 * Limpieza periódica: una al arrancar y luego cada `intervalMs`.
 * @param {{ intervalMs?: number, maxAgeMs?: number }} [opts]
 */
export function createTempCleaner(opts = {}) {
  const intervalMs = opts.intervalMs || 30 * 60 * 1000;
  const minutos = Number(process.env.TEMP_MAX_AGE_MIN);
  const maxAgeMs = opts.maxAgeMs ?? (minutos > 0 ? minutos * 60 * 1000 : HORA);
  let timer = null;

  function limpiar() {
    try {
      const n = limpiarTemporales({ maxAgeMs });
      if (n > 0) log.info("Limpieza: " + n + " temporal(es) viejo(s) borrado(s)");
      return n;
    } catch (err) {
      log.warn("Limpieza de temporales: " + (err.message || err));
      return 0;
    }
  }

  return {
    start() {
      if (timer) return;
      limpiar();
      timer = setInterval(limpiar, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    limpiar,
  };
}

export default createTempCleaner;
