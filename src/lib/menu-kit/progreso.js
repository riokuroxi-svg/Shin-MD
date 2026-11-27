/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  progreso.js — el indicador de progreso del proto (el «pensando» nativo)
//
//  `botMetadata.progressIndicatorMetadata` existe en el protocolo:
//
//      botMetadata {
//        progressIndicatorMetadata {
//          progressDescription: "Pensando…"
//          stepsMetadata: [ { statusTitle, statusBody, status } ... ]
//        }
//      }
//
//  Es el formato que Meta usa en su propio asistente. Se manda como una
//  tarjeta de `richResponseMessage` acompañada de esa metadata.
//
//  HONESTIDAD: si el cliente no pinta el indicador (porque no tiene el
//  bot verificado), el texto de los pasos se ve igual, solo que sin las
//  animaciones. Por eso los pasos llevan siempre un `statusBody` legible.
// ═══════════════════════════════════════════════════════════════════

import { generateWAMessageFromContent, proto } from "baileys";
import log from "#logger";

/** Estados del plan (enum del proto). */
export const PASO = Object.freeze({
  EN_CURSO: 1,
  COMPLETO: 2,
});

/**
 * Arma el mensaje de progreso SIN enviarlo.
 *
 * @param {Array<{titulo:string, cuerpo?:string, estado?:number, razonamiento?:boolean}>} pasos
 * @param {{descripcion?:string}} [op]
 */
export function armarProgreso(pasos = [], { descripcion = "Pensando…" } = {}) {
  return {
    messageContextInfo: {
      botMetadata: {
        progressIndicatorMetadata: {
          progressDescription: descripcion,
          stepsMetadata: (pasos || []).map((p) => ({
            statusTitle: p.titulo || "",
            statusBody: p.cuerpo || "",
            status: p.estado || PASO.EN_CURSO,
            ...(p.razonamiento ? { isReasoning: true } : {}),
          })),
        },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: descripcion }],
          contextInfo: { isForwarded: true, forwardingScore: 1, forwardOrigin: 4 },
        },
      },
    },
  };
}

/**
 * Manda el progreso. Devuelve la `key` para poder borrarlo o editarlo
 * cuando llegue la respuesta final.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {Array} pasos
 * @param {{descripcion?:string, cita?:object}} [op]
 */
export async function enviarProgreso(sock, jid, pasos, { descripcion, cita = null } = {}) {
  try {
    const armado = generateWAMessageFromContent(jid, armarProgreso(pasos, { descripcion }), {
      userJid: sock.user?.id,
      quoted: cita || undefined,
    });
    await sock.relayMessage(jid, armado.message, { messageId: armado.key.id });
    return armado.key;
  } catch (err) {
    log.warn("progreso: el cliente no aceptó el indicador (" + (err.message || err) + ")");
    return null;
  }
}

/** Versión sin red: arma y pasa por el protobuf. */
export function armarBytesProgreso(pasos, jid = "5210000000000@s.whatsapp.net") {
  const armado = generateWAMessageFromContent(jid, armarProgreso(pasos), {});
  const bytes = proto.Message.encode(armado.message).finish();
  return { bytes, decodificado: proto.Message.decode(bytes) };
}

export default { armarProgreso, enviarProgreso, armarBytesProgreso, PASO };
