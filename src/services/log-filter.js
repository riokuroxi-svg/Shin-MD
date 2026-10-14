/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  log-filter.js — Silencia el ruido de cifrado de WhatsApp en consola.
//
//  libsignal (la librería de cifrado que usa Baileys) imprime directo en
//  consola cosas como "Closing session: SessionEntry {...}" con objetos
//  enormes de llaves. No sirven para usar el bot y tapan los logs útiles.
//
//  Se filtran SOLO esos mensajes, por cómo empiezan exactamente (sacados
//  del código de libsignal), así nunca se esconde un log propio del bot.
//  Con LOG_LEVEL=debug o trace no se filtra nada.
// ═══════════════════════════════════════════════════════════════════

// console.info / console.log / console.warn de libsignal
const RUIDO = [
  "Closing session:",
  "Opening session:",
  "Removing old closed session:",
  "Migrating session to:",
  "Closing open session in favor of incoming prekey bundle",
  "Closing stale open session",
  "Session already closed",
  "Session already open",
  "Decrypted message with closed session.",
];

// console.error de libsignal cuando un mensaje no se pudo descifrar
// (Bad MAC y similares). Baileys ya reintenta solo; en consola solo asusta.
const RUIDO_ERROR = ["Failed to decrypt message with any known session", "Session error:"];

let instalado = false;
let ocultos = 0;

/**
 * ¿Este mensaje de consola es ruido de libsignal?
 * @param {unknown[]} args argumentos de console.*
 * @param {boolean} [esError] true si viene de console.error
 */
export function esRuido(args, esError = false) {
  const primero = typeof args?.[0] === "string" ? args[0] : "";
  if (!primero) return false;
  const lista = esError ? RUIDO_ERROR : RUIDO;
  return lista.some((p) => primero.startsWith(p));
}

/** Instala el filtro una sola vez. Devuelve false si no se instaló. */
export function installLogFilter() {
  if (instalado) return true;
  const nivel = String(process.env.LOG_LEVEL || "").toLowerCase();
  if (nivel === "debug" || nivel === "trace") return false;
  instalado = true;

  for (const metodo of ["log", "info", "warn", "error"]) {
    const original = console[metodo].bind(console);
    const esError = metodo === "error";
    console[metodo] = (...args) => {
      if (esRuido(args, esError)) {
        ocultos++;
        return;
      }
      original(...args);
    };
  }
  return true;
}

/** Cuántos mensajes de ruido se han ocultado desde el arranque. */
export function mensajesOcultos() {
  return ocultos;
}

export default installLogFilter;
