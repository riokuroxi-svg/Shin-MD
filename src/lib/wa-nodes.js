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
//    + quality_control(decision_id, source_type=third_party)
//        + decision_source(value=df)
//    + bot(biz_bot=1)  SOLO en chats privados (enciende la ✨ de IA)
//
//  Estaba copiado en tres sitios distintos y en otros tres faltaba
//  (la tarjeta de traducción, por ejemplo, salía sin botones). Ahora
//  vive aquí y lo usan todos.
// ═══════════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";

/** ¿Es un chat de una sola persona? WhatsApp ya usa @lid además del viejo. */
export function esPrivado(jid = "") {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

/**
 * El nodo `biz` escrito a mano. Es el respaldo: solo se usa cuando la librería
 * no expone su propio constructor.
 *
 * Lleva `decision_id` (20 bytes al azar, en hexadecimal) y el hijo
 * `<decision_source value="df"/>` porque son los que emite el cliente oficial.
 * Antes no estaban, y no eran adorno: ese nodo es la pista que le dice al
 * teléfono con qué camino dibujar el mensaje. Sin ellos el servidor acepta el
 * mensaje igual y el cliente puede contestar «actualiza WhatsApp».
 */
export function nodoBizPropio() {
  return {
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
      {
        tag: "quality_control",
        attrs: {
          decision_id: randomBytes(20).toString("hex"),
          source_type: "third_party",
        },
        content: [{ tag: "decision_source", attrs: { value: "df" } }],
      },
    ],
  };
}

/**
 * Nodos que acompañan a un mensaje interactivo.
 *
 * Si se le pasa `contenido` (lo que se va a enviar), y la librería instalada
 * trae `getBizBinaryNode`, se prefiere **el suyo**: es el que está al día con
 * lo que WhatsApp espera hoy. Para eso está `nodosInteractivosAsync`; esta
 * versión síncrona siempre devuelve el respaldo, que ya va completo.
 *
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true] Poner el nodo `bot` en privados.
 * @param {object[]} [op.contenido] Mensaje armado (solo en la versión async).
 * @returns {object[]} para pasar como additionalNodes a relayMessage
 */
export function nodosInteractivos(jid, { ai = true } = {}) {
  /** @type {object[]} */
  const nodos = [nodoBizPropio()];
  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/**
 * Igual que `nodosInteractivos`, pero pregunta a la librería por su nodo `biz`.
 *
 * Vale la pena porque un nodo `biz` nuestro **sustituye** al de la librería
 * (ella no añade el suyo si ya hay uno), así que si el nuestro se queda corto,
 * el mensaje sale peor que si no lo hubiéramos puesto.
 *
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true]
 * @param {object} [op.contenido] El mensaje que se va a enviar.
 * @returns {Promise<object[]>}
 */
export async function nodosInteractivosAsync(jid, { ai = true, contenido = null } = {}) {
  let biz = null;
  if (contenido) {
    try {
      // La librería puede no traer este constructor (el paquete oficial no lo
      // publica en sus tipos): se lee sin tipos y se comprueba en el momento.
      const lib = /** @type {any} */ (await import("baileys"));
      const getBizBinaryNode = lib?.getBizBinaryNode;
      if (typeof getBizBinaryNode === "function") {
        const suyo = getBizBinaryNode(contenido);
        if (suyo && suyo.tag === "biz") biz = suyo;
      }
    } catch {
      biz = null;
    }
  }
  /** @type {object[]} */
  const nodos = [biz || nodoBizPropio()];
  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/** Marca que baileys pone a las encuestas que manda él. */
export function nodosEncuesta() {
  return [{ tag: "meta", attrs: { polltype: "creation" } }];
}

export default { nodosInteractivos, nodosInteractivosAsync, nodoBizPropio, nodosEncuesta, esPrivado };
