/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  anti-crash.js — Que un error suelto no tumbe al bot.
//
//  Los cortes de red (ECONNRESET, EPIPE, "socket hang up"...) pasan todo
//  el tiempo en un bot 24/7 y no son fallos del bot: se ignoran en
//  silencio. Cualquier otro error que nadie atrapó se escribe en el log
//  para poder arreglarlo, pero el bot sigue vivo.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

const CODIGOS_DE_RED = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const TEXTOS_DE_RED = ["read ECONNRESET", "write EPIPE", "write EOF", "socket hang up"];

/**
 * ¿Es un corte de red normal (no un fallo del bot)?
 * @param {any} err
 */
export function esErrorDeRed(err) {
  if (!err) return false;
  const codigo = String(err.code || err.cause?.code || "");
  if (CODIGOS_DE_RED.has(codigo)) return true;
  const texto = String(err.message || err);
  return TEXTOS_DE_RED.some((t) => texto.includes(t));
}

let instalado = false;

/** Registra los manejadores una sola vez. */
export function installAntiCrash() {
  if (instalado) return;
  instalado = true;

  process.on("uncaughtException", (err) => {
    if (esErrorDeRed(err)) return;
    log.error("Error no atrapado: " + (err?.message || err), err);
  });

  process.on("unhandledRejection", (motivo) => {
    if (!motivo || esErrorDeRed(motivo)) return;
    const m = /** @type {any} */ (motivo);
    log.error("Promesa rechazada sin atrapar: " + (m?.message || String(m)));
  });
}

export default installAntiCrash;
