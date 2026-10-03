/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  economy-guard.js — Puerta de la economía.
//
//  ANTES: los mismos 5 renglones (leer el chat, comprobar si la
//  economía está apagada, responder el aviso) estaban copiados en 16
//  comandos de economy/. Cambiar el texto del aviso eran 16 ediciones.
//
//  Ahora hay una puerta y un solo texto. `chat` sigue saliendo de aquí
//  para que los comandos que después leen algo del chat no tengan que
//  volver a consultar la base.
// ═══════════════════════════════════════════════════════════════════

import db from "../services/ginko-db.js";

/**
 * ¿Puede el comando seguir, o la economía está apagada en este chat?
 *
 * @param {string} chatId
 * @param {string} [usedPrefix="."] prefijo que tecleó el usuario, para el ejemplo
 * @returns {{blocked: boolean, message: string, chat: object}}
 */
export function economyGate(chatId, usedPrefix = ".") {
  const chat = db.getChat(chatId) || {};
  if (!chat.adminonly && chat.economy) {
    return { blocked: false, message: "", chat };
  }
  return {
    blocked: true,
    chat,
    message:
      `ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\n` +
      `Un *administrador* puede activarlos con el comando:\n` +
      `» *${usedPrefix}economy on*`,
  };
}

export default { economyGate };
