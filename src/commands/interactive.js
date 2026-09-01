// ═══════════════════════════════════════════════════════════════════
//  interactive.js — Mensajes interactivos (rich messages) con botones
//  · sendInteractive: tarjeta con botones nativos (quick_reply, cta_url,
//    cta_copy, single_select...) en un solo mensaje
//  · parseButtonResponse: extrae el id del botón que el usuario tocó
//  · Siempre con fallback a texto plano si WhatsApp no lo renderiza
//  ⚠️ Anti-ban: usamos estos mensajes con moderación, todo por la cola.
// ═══════════════════════════════════════════════════════════════════

import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} from "baileys";
import log from "#logger";

/**
 * Prepara un buffer o URL como header media (imagen/video) del mensaje.
 */
async function prepareMedia(sock, bufferOrUrl) {
  if (!bufferOrUrl) return { imageMessage: null, videoMessage: null };
  try {
    if (typeof bufferOrUrl === "string" && /^https?:\/\//i.test(bufferOrUrl)) {
      const media = await prepareWAMessageMedia(
        { image: { url: bufferOrUrl } },
        { upload: sock.waUploadToServer },
      );
      return { imageMessage: media.imageMessage, videoMessage: null };
    }
    if (Buffer.isBuffer(bufferOrUrl)) {
      const media = await prepareWAMessageMedia(
        { image: bufferOrUrl },
        { upload: sock.waUploadToServer },
      );
      return { imageMessage: media.imageMessage, videoMessage: null };
    }
  } catch (err) {
    log.warn("interactive: prepareMedia falló: " + (err.message || err));
  }
  return { imageMessage: null, videoMessage: null };
}

/**
 * Construye el botón nativo quick_reply.
 * @param {string} label - texto visible del botón (máx ~20 chars)
 * @param {string} id - id que se devuelve al tocar
 */
export function quickReply(label, id) {
  return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: label, id }) };
}

export function ctaUrl(label, url) {
  return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }) };
}

export function ctaCopy(label, code) {
  return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: label, copy_code: code }) };
}

/**
 * Envía un mensaje interactivo con botones.
 * @param {object} sock - socket Baileys
 * @param {string} jid - chat destino
 * @param {object} opts
 *   - body: texto principal (tabla/markdown permitido)
 *   - footer: texto inferior
 *   - title: cabecera (si no hay imagen)
 *   - image: Buffer o URL de imagen de cabecera
 *   - buttons: array de botones (quickReply/ctaUrl/...)
 *   - quoted: mensaje a citar
 * @returns {Promise<object|null>} mensaje enviado o null si falló
 */
export async function sendInteractive(sock, jid, opts = {}) {
  const body = opts.body || "";
  const footer = opts.footer || "";
  const { imageMessage } = await prepareMedia(sock, opts.image);

  const buttons = Array.isArray(opts.buttons) ? opts.buttons.filter(Boolean) : [];
  const hasMedia = !!imageMessage;

  try {
    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            body: { text: body },
            footer: { text: footer },
            header: {
              hasMediaAttachment: hasMedia,
              imageMessage: imageMessage || null,
              ...(opts.title ? { title: opts.title } : {}),
            },
            nativeFlowMessage: {
              buttons,
              messageParamsJson: "",
            },
          },
        },
      },
    };

    // Baileys 6.7.24 falla si quoted tiene key pero no message → validar
    const validQuoted = opts.quoted && opts.quoted.message ? opts.quoted : undefined;

    const msg = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.jid || sock.user?.id,
      quoted: validQuoted,
      upload: sock.waUploadToServer,
    });

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("interactive: fallback a texto (" + (err.message || err) + ")");
    // Fallback: enviar como texto plano para no romper la experiencia
    const sent = await sock.sendMessage(jid, { text: body + (footer ? "\n\n" + footer : "") }, { quoted: opts.quoted });
    return sent;
  }
}

/**
 * Envía un carrusel de tarjetas (tabla + imagen + botones en un solo mensaje).
 * @param {object} sock - socket Baileys
 * @param {string} jid - chat destino
 * @param {object} opts
 *   - title: título del carrusel
 *   - body: texto del carrusel
 *   - footer: pie
 *   - cards: array de { image (Buffer|URL), title, body, footer, buttons }
 * @returns {Promise<object|null>}
 */
export async function sendCarousel(sock, jid, opts = {}) {
  const cards = [];
  for (const card of opts.cards || []) {
    const { imageMessage } = await prepareMedia(sock, card.image);
    cards.push({
      body: { text: card.body || "" },
      footer: { text: card.footer || "" },
      header: {
        hasMediaAttachment: !!imageMessage,
        imageMessage: imageMessage || null,
        title: card.title || "",
      },
      nativeFlowMessage: {
        buttons: (card.buttons || []).filter(Boolean),
        messageParamsJson: "",
      },
    });
  }
  if (cards.length === 0) return null;

  try {
    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: {
            body: { text: opts.body || "" },
            footer: { text: opts.footer || "" },
            header: {
              hasMediaAttachment: false,
              title: opts.title || "",
            },
            carouselMessage: {
              cards,
              messageVersion: 2,
            },
          },
        },
      },
    };
    const validQuoted = opts.quoted && opts.quoted.message ? opts.quoted : undefined;
    const msg = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.jid || sock.user?.id,
      quoted: validQuoted,
      upload: sock.waUploadToServer,
    });
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("interactive: carousel fallback (" + (err.message || err) + ")");
    const sent = await sock.sendMessage(jid, { text: opts.body || "" }, { quoted: opts.quoted });
    return sent;
  }
}

/**
 * Extrae el id del botón que el usuario tocó, de cualquier tipo de respuesta.
 * @param {object} msg - mensaje entrante (WAMessage)
 * @returns {string|null} id del botón, o null si no es una respuesta
 */
export function parseButtonResponse(msg) {
  if (!msg || !msg.message) return null;
  const m = msg.message;

  if (m.buttonsResponseMessage) {
    return m.buttonsResponseMessage.selectedButtonId || null;
  }
  if (m.templateButtonReplyMessage) {
    return m.templateButtonReplyMessage.selectedId || null;
  }
  if (m.listResponseMessage) {
    return m.listResponseMessage.singleSelectReply?.selectedRowId || null;
  }
  if (m.interactiveResponseMessage) {
    try {
      const params = m.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
      if (params) return JSON.parse(params).id || null;
    } catch {}
  }
  return null;
}

/**
 * ¿Es este mensaje una respuesta a un botón? (no reaccionar como comando normal)
 */
export function isButtonResponse(msg) {
  return parseButtonResponse(msg) !== null;
}

export default { sendInteractive, sendCarousel, parseButtonResponse, isButtonResponse, quickReply, ctaUrl, ctaCopy };
