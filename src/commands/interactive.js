/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
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
 * Botón de lista desplegable nativa (single_select). Se abre como lista
 * del sistema con secciones — el estándar de los menús premium 2026.
 * @param {string} title - texto visible del botón que abre la lista
 * @param {Array} sections - [{ title, rows: [{ id, title, description? }] }]
 *   El id de cada row sigue el formato del router: "comando" o "comando:arg".
 */
export function singleSelect(title, sections) {
  const clean = (sections || []).map(s => ({
    title: s.title || "",
    highlight_label: s.highlight_label || "",
    rows: (s.rows || []).map(r => ({
      id: r.id,
      title: r.title,
      description: r.description || "",
    })),
  }));
  return {
    name: "single_select",
    buttonParamsJson: JSON.stringify({ title, sections: clean }),
  };
}

/**
 * Mensaje con externalAdReply: el "tag verde chiquito" + link preview.
 * Opcionalmente lleva imagen (thumbnailUrl) y título/descripción.
 * ⚠️ B4: si RICH_EXTRA=1 añade forwardingScore/newsletter fake (riesgo de
 * ban — por defecto APAGADO).
 */
export async function sendAdReply(sock, jid, opts = {}) {
  const contextInfo = {
    externalAdReply: {
      title: opts.title || "Shin-MD",
      body: opts.body || "",
      mediaType: 1,
      previewType: 0,
      ...(opts.thumbnailUrl ? { thumbnailUrl: opts.thumbnailUrl, mediaUrl: opts.sourceUrl || opts.thumbnailUrl } : {}),
      sourceUrl: opts.sourceUrl || "https://github.com/riokuroxi-svg/Shin-MD",
      renderLargerThumbnail: !!opts.thumbnailUrl,
      showAdAttribution: false,
    },
  };
  if (process.env.RICH_EXTRA === "1") {
    contextInfo.forwardingScore = 9999;
    contextInfo.isForwarded = true;
    contextInfo.forwardedNewsletterMessageInfo = {
      newsletterJid: opts.newsletterJid || "120363000000000000@newsletter",
      newsletterName: opts.newsletterName || "Shin-MD",
      serverMessageId: -1,
    };
  }
  try {
    return await sock.sendMessage(jid, {
      text: opts.text || "",
      contextInfo,
    }, opts.quoted && opts.quoted.message ? { quoted: opts.quoted } : {});
  } catch (err) {
    log.warn("adReply: fallback simple (" + (err.message || err) + ")");
    try {
      return await sock.sendMessage(jid, { text: opts.text || "" }, opts.quoted && opts.quoted.message ? { quoted: opts.quoted } : {});
    } catch { return null; }
  }
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
    // Fallback: texto plano. Usa el MISMO filtro que el intento principal:
    // si el fallo fue por quoted inválido (key sin message), reenviar con
    // el quoted crudo re-lanzaba el error DENTRO del catch.
    // opts.fallbackText: el llamador puede dar un texto más completo que
    // body+footer (el menú lo usa para caer al menú clásico con la lista
    // entera de comandos si la tarjeta no se pudo enviar).
    try {
      const safeQuoted = (opts.quoted && opts.quoted.message) ? opts.quoted : undefined;
      const fbText = opts.fallbackText || (body + (footer ? "\n\n" + footer : ""));
      const sent = await sock.sendMessage(jid, { text: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
      return sent;
    } catch (err2) {
      log.error("interactive: el fallback de texto también falló: " + (err2.message || err2));
      return null;
    }
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
    try {
      const safeQuoted = (opts.quoted && opts.quoted.message) ? opts.quoted : undefined;
      const sent = await sock.sendMessage(jid, { text: opts.body || "" }, safeQuoted ? { quoted: safeQuoted } : {});
      return sent;
    } catch (err2) {
      log.error("interactive: el fallback de texto del carousel también falló: " + (err2.message || err2));
      return null;
    }
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

export default { sendInteractive, sendCarousel, parseButtonResponse, isButtonResponse, quickReply, ctaUrl, ctaCopy, singleSelect, sendAdReply };
