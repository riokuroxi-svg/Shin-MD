/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 *
 * Nodo <biz> de acompañamiento para mensajes interactivos.
 *
 * ¿Por qué existe este archivo?
 * ─────────────────────────────
 * Baileys 7.0.0-rc14 (el que usa este bot) **perdió** la inyección
 * automática del nodo <biz> que sí traen los clientes modificados y la
 * mayoría de los bots de botones que funcionan hoy en día.
 *
 * Sin ese nodo el servidor de WhatsApp **acepta** el stanza, responde
 * como si todo hubiera ido bien, y el teléfono del destinatario **nunca
 * pinta la tarjeta**. Es exactamente el síntoma del menú que no llega:
 * cero errores en el log y cero mensajes en el chat.
 *
 * Referencias verificadas:
 *   · OktzO/Onigi v10.0.2 — «the rebase onto Baileys 7.0.0-rc14 dropped
 *     the automatic <biz> stanza-node injection… without it, the server
 *     relays the bytes but the receiving client never renders the card.»
 *   · tulir/whatsmeow #1235 — «no <biz> node (current behaviour) →
 *     accepted, nothing renders».
 *   · whatsmeow (Go), `prepareMessageNode` — misma estructura de nodo
 *     verificada contra el tráfico del cliente oficial.
 *
 * La forma replicada, para `interactive`/`buttons`/flujos nativos:
 *
 *   <biz actual_actors='2' host_storage='2' privacy_mode_ts='<ts>'>
 *     <engagement customer_service_state='open' conversation_state='open'/>
 *     <interactive type='native_flow' v='1'>
 *       <native_flow v='9' name='mixed'/>
 *     </interactive>
 *   </biz>
 *
 * `privacy_mode_ts` NO es la hora actual: lleva un desplazamiento fijo
 * de 77980457 s (≈ 2 años y medio). Ese detalle no es evidente y se
 * respeta literal; con la hora actual WhatsApp acepta el stanza y no
 * lo pinta igual.
 */

/** Nombre del flujo nativo para cada tipo de botón. */
const FLUJO_POR_TIPO = {
  cta_catalog: "cta_catalog",
  mpm: "mpm",
  call_request: "call_permission_request",
  view_catalog: "automated_greeting_message_view_catalog",
  wa_pay_detail: "wa_payment_transaction_details",
  send_location: "send_location",
};

/** Flujos de respuesta a orden: el nodo lleva sólo `native_flow_name`. */
const FLUJO_DE_ORDEN = {
  review_and_pay: "order_details",
  review_order: "order_status",
  payment_info: "payment_info",
  payment_status: "payment_status",
  payment_method: "payment_method",
};

/** Desplazamiento fijo de `privacy_mode_ts` (no usar la hora actual). */
const DESFASE_TS = 77980457;

/**
 * Devuelve el arreglo de nodos que hay que empujar al stanza.
 * @param {string} tipo `'interactive'`, `'buttons'`, `'list'`, `'cta_catalog'`…
 * @returns {object[]}
 */
export function nodoBiz(tipo) {
  const nombre = String(tipo || "").toLowerCase();
  const ts = Math.floor(Date.now() / 1000) - DESFASE_TS;

  if (FLUJO_DE_ORDEN[nombre]) {
    return [
      {
        tag: "biz",
        attrs: { native_flow_name: FLUJO_DE_ORDEN[nombre] },
        content: [],
      },
    ];
  }

  if (FLUJO_POR_TIPO[nombre] || nombre === "interactive" || nombre === "buttons") {
    return [
      {
        tag: "biz",
        attrs: {
          actual_actors: "2",
          host_storage: "2",
          privacy_mode_ts: String(ts),
        },
        content: [
          {
            tag: "engagement",
            attrs: {
              customer_service_state: "open",
              conversation_state: "open",
            },
          },
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [
              {
                tag: "native_flow",
                attrs: { v: "9", name: FLUJO_POR_TIPO[nombre] || "mixed" },
                content: [],
              },
            ],
          },
        ],
      },
    ];
  }

  // Cualquier otro tipo: nodo mínimo, como el `else` del fork.
  return [
    {
      tag: "biz",
      attrs: {
        actual_actors: "2",
        host_storage: "2",
        privacy_mode_ts: String(ts),
      },
      content: [
        {
          tag: "engagement",
          attrs: {
            customer_service_state: "open",
            conversation_state: "open",
          },
        },
      ],
    },
  ];
}

/**
 * Dado un mensaje ya armado (puede venir envuelto en viewOnce /
 * ephemeral / documentWithCaption), decide qué tipo de botón es.
 * Equivalente a la detección de tipo de botón del cliente.
 * @param {object} message
 * @returns {string|null}
 */
export function tipoDeBoton(message) {
  if (!message) return null;

  // desenvolver las capas (máximo 5, como normalizeMessageContent)
  let m = message;
  for (let i = 0; i < 5; i++) {
    const dentro =
      m?.viewOnceMessage ||
      m?.viewOnceMessageV2 ||
      m?.viewOnceMessageV2Extension ||
      m?.ephemeralMessage ||
      m?.documentWithCaptionMessage;
    if (!dentro?.message) break;
    m = dentro.message;
  }

  if (m?.listMessage) return "list";
  if (m?.buttonsMessage) return "buttons";

  const boton0 = m?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name;
  if (boton0 === "review_and_pay") return "review_and_pay";
  if (boton0 === "review_order") return "review_order";
  if (boton0 === "payment_info") return "payment_info";
  if (boton0 === "payment_status") return "payment_status";
  if (boton0 === "payment_method") return "payment_method";
  if (m?.interactiveMessage && m?.interactiveMessage?.nativeFlowMessage) return "interactive";
  return null;
}

/**
 * En chats privados (1:1) los mensajes interactivos necesitan además
 * `<bot biz_bot='1'/>` para que el cliente los pinte. En grupos no se
 * pone: ahí es donde el servidor lo rechaza.
 * @param {string} jid destino
 * @returns {object[]}
 */
export function nodoBot(jid) {
  const j = String(jid || "");
  const esPrivado = j.endsWith("@s.whatsapp.net") || j.endsWith("@lid");
  if (!esPrivado) return [];
  return [{ tag: "bot", attrs: { biz_bot: "1" } }];
}

export default nodoBiz;
