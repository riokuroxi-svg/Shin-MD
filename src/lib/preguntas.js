/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  preguntas.js — La función «Preguntas» nativa de los grupos
//
//  QUÉ SE ENCONTRÓ EN EL PROTO (6.7.24)
//  ------------------------------------
//  WhatsApp sacó «Preguntas»: en canales y grupos se puede publicar
//  una pregunta y las respuestas de la gente se agrupan debajo con
//  su contador, sin que nadie tenga que estar rastreando quién
//  contestó. Las dos piezas del diccionario oficial son:
//
//    A) ContextInfo.isQuestion  (campo 63, bool)
//       Cualquier mensaje de texto marcado así viaja con la etiqueta
//       oficial de «pregunta». Es la vía ligera.
//
//    B) Message.questionMessage → FutureProofMessage { message }
//       El contenedor nativo a pantalla completa: envuelve una
//       pregunta entera (texto por ahora; media mañana). Es opaco:
//       el teléfono decide cómo lo dibuja según su versión.
//
//  Las respuestas llegan como mensajes que CITAN la pregunta: el
//  router ya las recibe como cualquier respuesta citada, así que
//  contarlas después no exige tocar el motor.
//
//  Como en el resto del laboratorio: que codifique contra el proto
//  está probado en test/tanda7.test.js; que TU móvil lo pinte bonito
//  se comprueba con `.lab pregunta` y `.lab preguntabox`.
// ═══════════════════════════════════════════════════════════════════

/** Variantes del experimento. */
export const VARIANTE = Object.freeze({
  FLAG: "flag",   // texto con isQuestion=true (ligera)
  CAJA: "caja",   // contenedor questionMessage nativo (FutureProof)
});

/**
 * Vía ligera: un texto normal con la etiqueta oficial de pregunta.
 *
 * @param {object} d
 * @param {string} d.texto  la pregunta
 * @returns {object} contenido listo para generateWAMessageFromContent
 */
export function buildPregunta({ texto = "" } = {}) {
  const limpio = String(texto || "").trim();
  if (!limpio) throw new Error("la pregunta no puede ir vacía");
  return {
    extendedTextMessage: {
      text: limpio,
      contextInfo: { isQuestion: true },
    },
  };
}

/**
 * Vía nativa: la pregunta dentro del contenedor del protocolo.
 *
 * @param {object} d
 * @param {string} d.texto
 * @returns {object} contenido listo para generateWAMessageFromContent
 */
export function buildPreguntaNativa({ texto = "" } = {}) {
  const limpio = String(texto || "").trim();
  if (!limpio) throw new Error("la pregunta no puede ir vacía");
  return {
    questionMessage: {
      message: { extendedTextMessage: { text: limpio } },
    },
  };
}

/**
 * Manda la pregunta. NUNCA lanza: si el envío falla, devuelve
 * { sent:false, error } para que el llamador elija qué hacer.
 *
 * @param {object} sock      Socket de baileys (necesita relayMessage).
 * @param {string} jid       Chat destino.
 * @param {object} d         { texto }
 * @param {object} [opts]
 * @param {string} [opts.variante=VARIANTE.FLAG]
 * @param {object} [opts.quoted]
 * @returns {Promise<{sent:boolean, key?:object, error?:any}>}
 */
export async function sendPregunta(sock, jid, d, { variante = VARIANTE.FLAG, quoted } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");
    const contenido = variante === VARIANTE.CAJA ? buildPreguntaNativa(d) : buildPregunta(d);
    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó la pregunta");
    await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}

export default { VARIANTE, buildPregunta, buildPreguntaNativa, sendPregunta };
