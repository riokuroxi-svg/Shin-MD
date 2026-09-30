/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  wa-nodes.js — El envoltorio binario de los mensajes interactivos
//
//  Un mensaje con botones no se dibuja solo porque el protobuf esté
//  bien: WhatsApp espera unos nodos binarios alrededor, los mismos que
//  emite el cliente oficial. Si faltan, el servidor ACEPTA el mensaje
//  y el teléfono lo tira sin pintar nada. Ni error, ni aviso.
//
//    biz → interactive(type=native_flow, v=1) → native_flow(v=9, mixed)
//    + quality_control
//    + bot(biz_bot=1)  SOLO en chats privados (enciende la ✨ de IA)
//
//  Estaba copiado en tres sitios distintos y en otros tres faltaba
//  (la tarjeta de traducción, por ejemplo, salía sin botones). Ahora
//  vive aquí y lo usan todos.
// ═══════════════════════════════════════════════════════════════════

/** ¿Es un chat de una sola persona? WhatsApp ya usa @lid además del viejo. */
export function esPrivado(jid = "") {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

/**
 * Nodos que acompañan a un mensaje interactivo.
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true] Poner el nodo `bot` en privados.
 * @returns {object[]} para pasar como additionalNodes a relayMessage
 */
export function nodosInteractivos(jid, { ai = true } = {}) {
  const nodos = [{
    tag: "biz",
    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts: Math.floor(Date.now() / 1000).toString(),
    },
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
      },
      { tag: "quality_control", attrs: { source_type: "third_party" } },
    ],
  }];
  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/** Marca que baileys pone a las encuestas que manda él. */
export function nodosEncuesta() {
  return [{ tag: "meta", attrs: { polltype: "creation" } }];
}

export default { nodosInteractivos, nodosEncuesta, esPrivado };
