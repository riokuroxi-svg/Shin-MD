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
//    + quality_control(decision_id, source_type, <decision_source value="df"/>)
//    + bot(biz_bot=1)  SOLO en chats privados (enciende la ✨ de IA)
//
//  ── EL NODO `quality_control` VACÍO ERA EL PROBLEMA ──────────────
//  Hasta v3.7.9 este nodo salía así:
//
//    <quality_control source_type="third_party"/>
//
//  y el cliente oficial (y la propia librería, en getBizBinaryNode)
//  lo emite con dos campos más:
//
//    <quality_control decision_id="<40 hex>" source_type="third_party">
//      <decision_source value="df"/>
//    </quality_control>
//
//  Ese nodo es la pista que le dice al teléfono con qué camino dibujar
//  el mensaje. Un `biz` incompleto se acepta igual y luego el cliente
//  puede contestar «actualiza WhatsApp» o no pintar los botones. Y como
//  la librería no añade el suyo si ve uno nuestro, nuestro nodo
//  incompleto SUSTITUÍA al completo. Por eso el fallo era intermitente:
//  dependía del estado interno del teléfono, no del mensaje.
// ═══════════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";

/** ¿Es un chat de una sola persona? WhatsApp ya usa @lid además del viejo. */
export function esPrivado(jid = "") {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

/** 20 bytes en hex (40 caracteres), como el decision_id del cliente oficial. */
function semillaDecision() {
  try {
    return randomBytes(20).toString("hex");
  } catch {
    return Math.random().toString(16).slice(2).padEnd(40, "0").slice(0, 40);
  }
}

/**
 * El nodo `quality_control` completo.
 * `decision_id` y `decision_source` NO son decoración: son los que
 * emite el cliente oficial y los que faltaban aquí desde el diseño.
 */
function nodoQualityControl() {
  return {
    tag: "quality_control",
    attrs: {
      decision_id: semillaDecision(),
      source_type: "third_party",
    },
    content: [{ tag: "decision_source", attrs: { value: "df" } }],
  };
}

/**
 * Nodos que acompañan a un mensaje interactivo.
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true] Poner el nodo `bot` en privados.
 * @returns {object[]} para pasar como additionalNodes a relayMessage
 */
export function nodosInteractivos(jid, { ai = true } = {}) {
  /** @type {any[]} los dos nodos tienen attrs distintos a propósito */
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
      nodoQualityControl(),
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
