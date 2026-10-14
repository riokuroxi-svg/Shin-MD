/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ytdlp-cliente.js — Qué "player_client" de YouTube usa yt-dlp.
//
//  Por defecto NO se fuerza ninguno: desde IP de datacenter (VPS) los
//  clientes fijos (android, web, web_embedded) caen en el bloqueo
//  PO-token de YouTube y el cliente por defecto de yt-dlp es el que pasa
//  (probado en vivo el 2026-10-02). Si YouTube vuelve a cambiar, se puede
//  forzar una lista con YTDLP_PLAYER_CLIENTS=android,web en el .env.
// ═══════════════════════════════════════════════════════════════════

/**
 * Argumentos de yt-dlp para elegir cliente de YouTube.
 * @param {string} [cliente] lista de clientes ("android,web"), "default"
 *   o vacío. Sin valor se usa YTDLP_PLAYER_CLIENTS del entorno.
 * @returns {string[]} [] para el cliente por defecto, o el --extractor-args
 */
export function argsClienteYtdlp(cliente) {
  const elegido = String(cliente ?? process.env.YTDLP_PLAYER_CLIENTS ?? "").trim();
  if (!elegido || elegido === "default") return [];
  return ["--extractor-args", `youtube:player_client=${elegido}`];
}

export default { argsClienteYtdlp };
