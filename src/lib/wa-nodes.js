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
//    biz → interactive(type=<el tipo real>, v=1)
//             → native_flow(v=9, name=<el flujo real>)
//    + quality_control(decision_id, source_type=third_party)
//        + decision_source(value=df)
//    + bot(biz_bot=1)  SOLO en chats privados (enciende la ✨ de IA)
//
//  El `name` del native_flow NO es decoración: es el camino que el
//  teléfono usa para dibujar. Antes se mandaba `mixed` para todo, que
//  es el valor por defecto de la librería; una lista de categorías
//  (`single_select`) viaja como `menu_options` y un botón suelto como
//  `mixed`. Si el sobre no coincide con el contenido, los clientes
//  pintan la tarjeta genérica o contestan «actualiza WhatsApp».
//  Por eso el nodo ahora se arma a partir del mensaje REAL.
// ═══════════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";

/** ¿Es un chat de una sola persona? WhatsApp ya usa @lid además del viejo. */
export function esPrivado(jid = "") {
  return typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
}

// ── El nombre del flujo según lo que de verdad lleva el mensaje ────
// Valores observados en el cliente oficial: mixed (botón suelto o
// tarjeta con varios tipos), menu_options (lista de selección única,
// la respuesta más común) y catalog (catálogo de negocio).
const FLUJOS_POR_BOTON = {
  single_select: "menu_options",
  review_and_pay: "review_and_pay",
  review_order: "review_order",
  catalog_message: "catalog",
  cta_catalog: "catalog",
};

/** Los nombres de botón de un nativeFlowMessage, estén donde estén. */
function nombresDeBoton(contenido) {
  const capas = [
    contenido,
    contenido?.viewOnceMessage?.message,
    contenido?.viewOnceMessageV2?.message,
    contenido?.viewOnceMessageV2Extension?.message,
    contenido?.documentWithCaptionMessage?.message,
    contenido?.editedMessage?.message,
  ];
  for (const capa of capas) {
    const botones = capa?.interactiveMessage?.nativeFlowMessage?.buttons;
    if (Array.isArray(botones) && botones.length) {
      return botones.map((b) => (typeof b?.name === "string" ? b.name : "")).filter(Boolean);
    }
  }
  return [];
}

/**
 * El flujo que corresponde al contenido: `menu_options` si hay una
 * lista de selección única, `mixed` en cualquier otro caso. Ese
 * `mixed` es el valor por defecto del cliente, no un cajón de sastre.
 *
 * @param {object} [contenido] El mensaje que se va a enviar.
 * @returns {"menu_options"|"mixed"}
 */
export function flujoInteractivo(contenido) {
  if (!contenido) return "mixed";
  const nombres = nombresDeBoton(contenido);
  for (const nombre of nombres) {
    if (FLUJOS_POR_BOTON[nombre]) return FLUJOS_POR_BOTON[nombre];
  }
  return "mixed";
}

/**
 * El nodo `biz` escrito a mano. Es el respaldo: solo se usa cuando la
 * librería no expone su propio constructor.
 *
 * Lleva `decision_id` (20 bytes al azar, en hexadecimal) y el hijo
 * `<decision_source value="df"/>` porque son los que emite el cliente
 * oficial. Ese nodo es la pista que le dice al teléfono con qué camino
 * dibujar el mensaje; el camino se elige con `flujo` para que coincida
 * con el contenido (ver `flujoInteractivo`).
 *
 * @param {object} [op]
 * @param {"menu_options"|"mixed"} [op.flujo="mixed"]
 * @returns {object}
 */
/**
 * El nombre del flujo que lleva un nodo `biz` ya construido (venga de la
 * librería o de aquí). Sirve para no quedarse con un nodo que etiqueta
 * `mixed` cuando el contenido pide `menu_options`.
 *
 * @param {object} nodo
 * @returns {string|null}
 */
export function flujoDelNodo(nodo) {
  const hijo = nodo?.content?.find?.((n) => n?.tag === "interactive");
  const neto = hijo?.content?.find?.((n) => n?.tag === "native_flow");
  return typeof neto?.attrs?.name === "string" ? neto.attrs.name : null;
}

export function nodoBizPropio({ flujo = "mixed" } = {}) {
  const nombreFlujo = flujo === "menu_options" ? "menu_options" : "mixed";
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
        content: [{ tag: "native_flow", attrs: { v: "9", name: nombreFlujo } }],
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
 * Si se le pasa `contenido` (lo que se va a enviar), y la librería
 * instalada trae `getBizBinaryNode`, se prefiere **el suyo**: es el que
 * está al día con lo que WhatsApp espera hoy. Para eso está
 * `nodosInteractivosAsync`; esta versión síncrona siempre devuelve el
 * respaldo, que ya va completo y con el flujo correcto.
 *
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true] Poner el nodo `bot` en privados.
 * @param {object} [op.contenido] Mensaje armado (solo en la versión async).
 * @param {string} [op.flujo] Fuerza el nombre del flujo (menu_options/mixed).
 * @returns {object[]} para pasar como additionalNodes a relayMessage
 */
export function nodosInteractivos(jid, { ai = true, contenido = null, flujo = null } = {}) {
  /** @type {object[]} */
  const nodos = [nodoBizPropio({ flujo: flujo || flujoInteractivo(contenido) })];
  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/**
 * Igual que `nodosInteractivos`, pero pregunta a la librería por su
 * nodo `biz`.
 *
 * Vale la pena porque un nodo `biz` nuestro **sustituye** al de la
 * librería (ella no añade el suyo si ya hay uno), así que si el nuestro
 * se queda corto, el mensaje sale peor que si no lo hubiéramos puesto.
 *
 * @param {string} jid
 * @param {object} [op]
 * @param {boolean} [op.ai=true]
 * @param {object} [op.contenido] El mensaje que se va a enviar.
 * @param {string} [op.flujo]
 * @returns {Promise<object[]>}
 */
export async function nodosInteractivosAsync(jid, { ai = true, contenido = null, flujo = null } = {}) {
  let biz = null;
  if (contenido) {
    try {
      // La librería puede no traer este constructor (el paquete oficial no
      // lo publica en sus tipos): se lee sin tipos y se comprueba en el
      // momento. Si no está, el respaldo de abajo ya lleva el flujo bueno.
      const lib = /** @type {any} */ (await import("baileys"));
      const getBizBinaryNode = lib?.getBizBinaryNode;
      if (typeof getBizBinaryNode === "function") {
        const suyo = getBizBinaryNode(contenido);
        if (suyo && suyo.tag === "biz") {
          // La librería sólo reconoce seis nombres de botón (catálogo, pagos,
          // ubicación…). Para una lista de selección única devuelve `mixed`,
          // que hace que los clientes pinten la tarjeta genérica en vez de la
          // lista. Nuestro nodo propio sí la nombra bien, así que se descarta
          // el suyo cuando se queda en `mixed` y el contenido pide la lista.
          const suyoFlujo = flujoDelNodo(suyo);
          const pedido = flujo || flujoInteractivo(contenido);
          if (!(pedido === "menu_options" && suyoFlujo !== "menu_options")) biz = suyo;
        }
      }
    } catch {
      biz = null;
    }
  }
  /** @type {object[]} */
  const nodos = [biz || nodoBizPropio({ flujo: flujo || flujoInteractivo(contenido) })];
  if (esPrivado(jid) && ai) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/** Marca que baileys pone a las encuestas que manda él. */
export function nodosEncuesta() {
  return [{ tag: "meta", attrs: { polltype: "creation" } }];
}

export default { nodosInteractivos, nodosInteractivosAsync, nodoBizPropio, nodosEncuesta, esPrivado, flujoInteractivo };
