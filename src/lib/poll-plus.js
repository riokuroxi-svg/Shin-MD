/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  poll-plus.js — Las dos encuestas que WhatsApp sabe hacer
//                 y que ninguna librería de bots manda
//
//  HALLAZGO 1 · ENCUESTA TIPO QUIZ
//  -------------------------------
//    proto.Message.PollCreationMessage
//      · pollType      → { POLL: 0, QUIZ: 1 }
//      · correctAnswer → una de las opciones
//
//  Con pollType:1 la encuesta deja de ser una votación y se convierte
//  en una pregunta con respuesta correcta: WhatsApp mismo marca en
//  verde el acierto y en rojo el fallo, en el teléfono de cada quien.
//  Baileys tiene atajo para encuestas ({poll:{...}}, Utils/messages.js
//  línea 394) pero NUNCA toca pollType ni correctAnswer, así que
//  ningún bot manda quizzes: los dibujan como imagen y cuentan los
//  puntos a mano.
//
//  HALLAZGO 2 · ENCUESTA CON FOTOS EN LAS OPCIONES
//  -----------------------------------------------
//    · pollContentType → { TEXT: 1, IMAGE: 2 }
//    · cada foto se cuelga con MessageAssociation.MEDIA_POLL (7) y su
//      messageIndex, igual que las fotos de un álbum.
//
//  Votar "¿cuál portada?" o "¿qué waifu?" viendo las imágenes, no
//  leyendo nombres.
//
//  Todo con baileys 6.7.24 oficial.
// ═══════════════════════════════════════════════════════════════════

import { randomBytes } from "node:crypto";

/** WhatsApp admite hasta 12 opciones por encuesta. */
export const MAX_OPCIONES = 12;
export const MIN_OPCIONES = 2;

/** PollCreationMessage.PollType */
export const TIPO_ENCUESTA = 0;
export const TIPO_QUIZ = 1;

/** pollContentType */
export const CONTENIDO_TEXTO = 1;
export const CONTENIDO_IMAGEN = 2;

/** MessageAssociation.AssociationType.MEDIA_POLL */
export const TIPO_FOTO_ENCUESTA = 7;

/**
 * Lee lo que escribe el usuario:
 *   "¿Capital de Japón? | Kioto | *Tokio | Osaka"
 * El asterisco marca la respuesta correcta.
 *
 * @returns {{ok:boolean, error?:string, pregunta?:string, opciones?:string[], correcta?:number}}
 *   error: "faltan datos" | "pocas" | "muchas" | "sin correcta" | "varias correctas"
 */
export function parseQuiz(texto) {
  const partes = String(texto || "").split("|").map((t) => t.trim()).filter(Boolean);
  if (partes.length < 2) return { ok: false, error: "faltan datos" };

  const pregunta = partes[0];
  const crudas = partes.slice(1);
  if (crudas.length < MIN_OPCIONES) return { ok: false, error: "pocas" };
  if (crudas.length > MAX_OPCIONES) return { ok: false, error: "muchas" };

  const marcadas = [];
  const opciones = crudas.map((o, i) => {
    const marcada = o.startsWith("*") || o.endsWith("*");
    if (marcada) marcadas.push(i);
    return o.replace(/^\*+|\*+$/g, "").trim();
  });

  if (opciones.some((o) => !o)) return { ok: false, error: "faltan datos" };
  if (!marcadas.length) return { ok: false, error: "sin correcta" };
  if (marcadas.length > 1) return { ok: false, error: "varias correctas" };

  return { ok: true, pregunta, opciones, correcta: marcadas[0] };
}

/** Comprueba opciones sueltas (sin marcar correcta). */
function validarOpciones(opciones) {
  const lista = (Array.isArray(opciones) ? opciones : []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (lista.length < MIN_OPCIONES) throw new Error(`hacen falta al menos ${MIN_OPCIONES} opciones`);
  if (lista.length > MAX_OPCIONES) throw new Error(`WhatsApp admite como mucho ${MAX_OPCIONES} opciones`);
  return lista;
}

/**
 * Contenido de un quiz nativo.
 * @param {object} datos
 * @param {string} datos.pregunta
 * @param {string[]} datos.opciones
 * @param {number} datos.correcta  índice dentro de opciones
 */
export function buildQuiz({ pregunta, opciones, correcta = 0, secreto } = {}) {
  const lista = validarOpciones(opciones);
  const indice = Number.isInteger(correcta) ? correcta : 0;
  if (indice < 0 || indice >= lista.length) throw new Error("la respuesta correcta no está en la lista");
  if (!String(pregunta || "").trim()) throw new Error("falta la pregunta");

  return {
    messageContextInfo: { messageSecret: secreto || randomBytes(32) },
    pollCreationMessageV3: {
      name: String(pregunta).trim(),
      selectableOptionsCount: 1,
      pollType: TIPO_QUIZ,
      pollContentType: CONTENIDO_TEXTO,
      options: lista.map((optionName) => ({ optionName })),
      correctAnswer: { optionName: lista[indice] },
    },
  };
}

/**
 * Contenido de una encuesta normal cuyas opciones llevan foto.
 * Las fotos van aparte (ver sendImagePoll).
 */
export function buildImagePoll({ pregunta, opciones, multiple = false, secreto } = {}) {
  const lista = validarOpciones(opciones);
  if (!String(pregunta || "").trim()) throw new Error("falta la pregunta");

  return {
    messageContextInfo: { messageSecret: secreto || randomBytes(32) },
    [multiple ? "pollCreationMessage" : "pollCreationMessageV3"]: {
      name: String(pregunta).trim(),
      selectableOptionsCount: multiple ? lista.length : 1,
      pollType: TIPO_ENCUESTA,
      pollContentType: CONTENIDO_IMAGEN,
      options: lista.map((optionName) => ({ optionName })),
    },
  };
}

/** Cuelga la foto de una opción de su encuesta. */
export function asociarFotoOpcion(message, parentMessageKey, indice) {
  if (!message) throw new Error("falta el mensaje de la foto");
  if (!parentMessageKey?.id) throw new Error("falta la clave de la encuesta");

  message.messageContextInfo = {
    ...(message.messageContextInfo || {}),
    messageAssociation: {
      associationType: TIPO_FOTO_ENCUESTA,
      parentMessageKey,
      messageIndex: Number.isInteger(indice) ? indice : 0,
    },
  };
  return message;
}

/**
 * Manda un quiz nativo. Nunca lanza.
 * @returns {Promise<{sent:boolean, key?:object, error?:any}>}
 */
export async function sendQuiz(sock, jid, datos, { quoted } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, buildQuiz(datos), {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó el quiz");

    await sock.relayMessage(jid, generado.message, {
      messageId: generado.key.id,
      // baileys marca así las encuestas cuando las manda él; al
      // relayear a mano hay que ponerlo o el servidor no la registra
      // como encuesta nueva y los votos se pierden.
      additionalNodes: [{ tag: "meta", attrs: { polltype: "creation" } }],
    });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}

/**
 * Manda una encuesta con foto por opción.
 * @param {object[]} items  [{ texto, imagen }] — imagen: Buffer o URL
 */
export async function sendImagePoll(sock, jid, { pregunta, items = [], multiple = false } = {}, { quoted } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const opciones = items.map((i) => i?.texto);
    const contenido = buildImagePoll({ pregunta, opciones, multiple });

    const { generateWAMessageFromContent, generateWAMessage } = await import("baileys");
    const padre = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!padre?.key?.id) throw new Error("no se generó la encuesta");

    await sock.relayMessage(jid, padre.message, {
      messageId: padre.key.id,
      additionalNodes: [{ tag: "meta", attrs: { polltype: "creation" } }],
    });

    let fotos = 0;
    for (let i = 0; i < items.length; i++) {
      const fuente = items[i]?.imagen;
      if (!fuente) continue;

      const hijo = await generateWAMessage(
        jid,
        { image: typeof fuente === "string" ? { url: fuente } : fuente },
        { userJid: sock.user?.id, upload: sock.waUploadToServer },
      );
      if (!hijo?.key?.id) continue;

      asociarFotoOpcion(hijo.message, padre.key, i);
      await sock.relayMessage(jid, hijo.message, { messageId: hijo.key.id });
      fotos++;
    }

    return { sent: true, key: padre.key, fotos };
  } catch (error) {
    return { sent: false, error };
  }
}
