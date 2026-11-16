/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Transporte experimental de juegos HTML, sin credenciales ni claves de grupo.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { generateWAMessageFromContent } from "baileys";

// Límite conservador del proyecto: no es un límite oficial de WhatsApp.
export const MAX_HTML_BYTES = 48 * 1024;
const BOT_RICH = "867051314767696@bot";

export function crearContenidoJuego(html, titulo = "🎮 Juego experimental") {
  if (typeof html !== "string" || !html.trim()) throw new Error("El juego HTML está vacío.");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("El juego HTML excede el límite de prueba.");
  const responseId = randomUUID();
  const respuesta = {
    __typename: "GenAIUnifiedResponse",
    response_id: responseId,
    sections: [{
      __typename: "GenAIUnifiedResponseSection",
      view_model: {
        __typename: "GenAISingleLayoutViewModel",
        primitive: { __typename: "GenAIaeacdsnwHtmlPrimitive", payload: html, trusted_sources: [] },
      },
    }],
  };
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32).toString("base64"),
      botMetadata: { messageDisclaimerText: "", botResponseId: responseId },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: titulo }],
          unifiedResponse: { data: Buffer.from(JSON.stringify(respuesta), "utf8").toString("base64") },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: BOT_RICH },
            forwardOrigin: 4,
          },
        },
      },
    },
  };
}

export async function enviarJuegoHtml(sock, jid, html, titulo) {
  if (!sock?.user?.id) throw new Error("La sesión todavía no está conectada.");
  if (typeof jid !== "string" || !jid || typeof sock.relayMessage !== "function") {
    throw new Error("Falta el destino o el envío no está disponible.");
  }
  const contenido = crearContenidoJuego(html, titulo);
  const mensaje = generateWAMessageFromContent(jid, contenido, { userJid: sock.user.id });
  if (!mensaje?.key?.id || !mensaje.message) throw new Error("No se pudo preparar el juego.");
  // Un solo envío. Si el resultado es incierto, no reenviar automáticamente.
  await sock.relayMessage(jid, mensaje.message, { messageId: mensaje.key.id });
  return mensaje;
}
