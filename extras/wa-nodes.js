/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/** ¿Es un chat de una sola persona? WhatsApp ya usa @lid además del viejo. */
export function esPrivado(jid = "") {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

/**
 * Nodos que acompañan a un mensaje interactivo.
 *
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true] poner el nodo `bot` en privados (la ✨ de IA)
 * @returns {object[]} para pasar como `additionalNodes` a relayMessage
 */
export function nodosInteractivos(jid, { ai = true } = {}) {
  const nodos = [
    {
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
    },
  ];

  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/** Marca que Baileys pone a las encuestas que manda él. */
export function nodosEncuesta() {
  return [{ tag: "meta", attrs: { polltype: "creation" } }];
}

export default { nodosInteractivos, nodosEncuesta, esPrivado };
