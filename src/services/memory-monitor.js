/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  memory-monitor.js — Vigila la memoria RAM del bot.
//
//  Cada 5 minutos mira cuánta RAM usa el proceso. Si pasa del límite
//  (MEM_LIMIT_MB, 512 por defecto) lo avisa en el log.
//
//  Reiniciar es OPCIONAL (MEM_RESTART=1): solo sirve si algo vuelve a
//  levantar el bot al cerrarse (PM2, systemd, el panel del hosting).
//  Sin eso, cerrar el proceso dejaría el bot apagado, por eso no se hace
//  por defecto.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

const MB = 1024 * 1024;

/**
 * Decide qué hacer con una lectura de memoria.
 * @param {number} rssBytes memoria usada
 * @param {number} limiteMB límite
 * @param {boolean} reiniciar si está permitido reiniciar
 * @returns {"ok"|"avisar"|"reiniciar"}
 */
export function decidir(rssBytes, limiteMB, reiniciar) {
  if (!(limiteMB > 0) || rssBytes < limiteMB * MB) return "ok";
  return reiniciar ? "reiniciar" : "avisar";
}

/**
 * @param {{ limitMB?: number, intervalMs?: number, restart?: boolean }} [opts]
 */
export function createMemoryMonitor(opts = {}) {
  const limiteMB = opts.limitMB ?? (Number(process.env.MEM_LIMIT_MB) || 512);
  const intervalMs = opts.intervalMs || 5 * 60 * 1000;
  const reiniciar = opts.restart ?? process.env.MEM_RESTART === "1";
  let timer = null;
  let avisado = false;

  function revisar() {
    try {
      const mem = process.memoryUsage();
      const accion = decidir(mem.rss, limiteMB, reiniciar);
      const rss = (mem.rss / MB).toFixed(0) + " MB";
      if (accion === "reiniciar") {
        log.warn("Memoria: " + rss + " (límite " + limiteMB + " MB). Reiniciando por MEM_RESTART=1.");
        process.exit(1);
      } else if (accion === "avisar") {
        if (!avisado) {
          log.warn("Memoria alta: " + rss + " (límite " + limiteMB + " MB). Si sigue subiendo, reinicia el bot.");
          avisado = true;
        }
      } else {
        avisado = false;
      }
      return accion;
    } catch {
      return "ok"; // vigilar la memoria nunca debe tumbar el bot
    }
  }

  return {
    start() {
      if (timer || !(limiteMB > 0)) return;
      timer = setInterval(revisar, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    revisar,
  };
}

export default createMemoryMonitor;
