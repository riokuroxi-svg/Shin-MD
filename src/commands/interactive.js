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
//  · sendCarousel: carrusel interactivo de tarjetas
//  · parseButtonResponse / isButtonResponse: extrae el id del botón tocado
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
async function prepareMedia(sock, bufferOrUrl, isVideo = false, gifPlayback = false) {
  if (!bufferOrUrl) return { imageMessage: null, videoMessage: null };
  try {
    if (isVideo) {
      const videoPayload = (typeof bufferOrUrl === "string" && /^https?:\/\//i.test(bufferOrUrl))
        ? { url: bufferOrUrl }
        : bufferOrUrl;
      const media = await prepareWAMessageMedia(
        { video: videoPayload, gifPlayback: !!gifPlayback },
        { upload: sock.waUploadToServer },
      );
      return { imageMessage: null, videoMessage: media.videoMessage };
    }

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
 * Botón de lista desplegable nativa (single_select).
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
 * Mensaje con externalAdReply
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

function formatButtonsAsText(buttons = []) {
  if (!buttons || !buttons.length) return "";
  const lines = [];
  for (const b of buttons) {
    try {
      const p = typeof b.buttonParamsJson === "string" ? JSON.parse(b.buttonParamsJson) : (b.buttonParamsJson || {});
      if (b.name === "quick_reply") {
        lines.push(`🔘 *[ ${p.display_text || p.id} ]* ➔ \`${p.id || p.display_text}\``);
      } else if (b.name === "cta_url") {
        lines.push(`🔗 *[ ${p.display_text || "Enlace"} ]* ➔ ${p.url}`);
      } else if (b.name === "cta_copy") {
        lines.push(`📋 *[ ${p.display_text || "Copiar"} ]* ➔ \`${p.copy_code}\``);
      } else if (b.name === "single_select") {
        lines.push(`📑 *[ ${p.title || "Menú"} ]*`);
        for (const sec of p.sections || []) {
          for (const row of sec.rows || []) {
            lines.push(`   • *${row.title}* ➔ \`${row.id}\``);
          }
        }
      }
    } catch {}
  }
  return lines.length ? "\n\n╭──〔 🔘 *OPCIONES* 〕──⬣\n" + lines.map(l => "│ " + l).join("\n") + "\n╰─────────────────────────⬣" : "";
}

/**
 * Envía un mensaje interactivo con botones.
 */
export async function sendInteractive(sock, jid, opts = {}) {
  const body = opts.body || "";
  const footer = opts.footer || "";
  const isGroup = typeof jid === "string" && (jid.endsWith("@g.us") || jid.endsWith("@newsletter"));

  if (isGroup) {
    const safeQuoted = (opts.quoted && (opts.quoted.message || opts.quoted.key)) ? (opts.quoted.full || opts.quoted) : undefined;
    const btnText = formatButtonsAsText(opts.buttons);
    const fbText = opts.fallbackText || (body + (footer ? "\n\n" + footer : "") + btnText);

    if (opts.video) {
      const videoPayload = typeof opts.video === "string" && /^https?:\/\//i.test(opts.video)
        ? { url: opts.video }
        : opts.video;
      return await sock.sendMessage(jid, { video: videoPayload, gifPlayback: !!opts.gifPlayback, caption: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
    }

    if (opts.image) {
      const imagePayload = typeof opts.image === "string" && /^https?:\/\//i.test(opts.image)
        ? { url: opts.image }
        : opts.image;
      return await sock.sendMessage(jid, { image: imagePayload, caption: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
    }
    return await sock.sendMessage(jid, { text: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
  }

  const isVideo = !!opts.video;
  const mediaSource = opts.video || opts.image;
  const { imageMessage, videoMessage } = await prepareMedia(sock, mediaSource, isVideo, opts.gifPlayback);
  const buttons = Array.isArray(opts.buttons) ? opts.buttons.filter(Boolean) : [];
  const hasMedia = !!(imageMessage || videoMessage);

  try {
    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.fromObject({
              text: body,
            }),
            footer: footer
              ? proto.Message.InteractiveMessage.Footer.fromObject({ text: footer })
              : undefined,
            header: proto.Message.InteractiveMessage.Header.fromObject({
              title: hasMedia ? "" : (opts.title || ""),
              subtitle: "",
              hasMediaAttachment: hasMedia,
              imageMessage: imageMessage || undefined,
              videoMessage: videoMessage || undefined,
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
              buttons: buttons.map(b => ({
                name: b.name,
                buttonParamsJson: b.buttonParamsJson,
              })),
            }),
            contextInfo: opts.contextInfo || undefined,
          }),
        },
      },
    };

    const msg = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.id,
      quoted: opts.quoted && opts.quoted.message ? opts.quoted : undefined,
    });

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("interactive: fallback a texto (" + (err.message || err) + ")");
    const btnText = formatButtonsAsText(buttons);
    const fbText = opts.fallbackText || (body + (footer ? "\n\n" + footer : "") + btnText);
    const safeQuoted = (opts.quoted && (opts.quoted.message || opts.quoted.key)) ? (opts.quoted.full || opts.quoted) : undefined;
    try {
      if (opts.video) {
        const videoPayload = typeof opts.video === "string" && /^https?:\/\//i.test(opts.video) ? { url: opts.video } : opts.video;
        return await sock.sendMessage(jid, { video: videoPayload, gifPlayback: !!opts.gifPlayback, caption: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
      }
      if (opts.image) {
        const imagePayload = typeof opts.image === "string" && /^https?:\/\//i.test(opts.image) ? { url: opts.image } : opts.image;
        return await sock.sendMessage(jid, { image: imagePayload, caption: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
      }
      return await sock.sendMessage(jid, { text: fbText }, safeQuoted ? { quoted: safeQuoted } : {});
    } catch {
      return null;
    }
  }
}

/**
 * Envía un carrusel interactivo de tarjetas (Carousel)
 */
export async function sendCarousel(sock, jid, opts = {}) {
  const cards = opts.cards || [];
  const contextInfo = opts.contextInfo || {};
  const isGroup = typeof jid === "string" && (jid.endsWith("@g.us") || jid.endsWith("@newsletter"));

  if (isGroup || !cards.length) {
    let fallback = opts.text || "✨ *SHOWCASE*\n\n";
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      fallback += `╭──〔 📌 *${c.title || "Opción"}* 〕──⬣\n`;
      fallback += `│ ${(c.body || "").replace(/\n/g, "\n│ ")}\n`;
      if (c.footer) fallback += `│ _${c.footer}_\n`;
      fallback += `╰─────────────────────────⬣\n\n`;
    }
    const safeQuoted = (opts.quoted && (opts.quoted.message || opts.quoted.key)) ? (opts.quoted.full || opts.quoted) : undefined;
    return await sock.sendMessage(jid, { text: fallback.trim(), contextInfo }, safeQuoted ? { quoted: safeQuoted } : {});
  }

  try {
    const cardObjects = [];
    for (const card of cards) {
      const { imageMessage } = await prepareMedia(sock, card.image);
      cardObjects.push({
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: imageMessage ? "" : (card.title || ""),
          hasMediaAttachment: !!imageMessage,
          imageMessage: imageMessage || undefined,
        }),
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: card.body || "" }),
        footer: card.footer ? proto.Message.InteractiveMessage.Footer.fromObject({ text: card.footer }) : undefined,
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: (card.buttons || []).map(b => ({
            name: b.name,
            buttonParamsJson: b.buttonParamsJson,
          })),
        }),
      });
    }

    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.fromObject({
            body: proto.Message.InteractiveMessage.Body.fromObject({ text: opts.text || "" }),
            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
              cards: cardObjects,
            }),
            contextInfo,
          }),
        },
      },
    };

    const msg = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.id,
      quoted: opts.quoted && opts.quoted.message ? opts.quoted : undefined,
    });

    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("carousel fallback (" + (err.message || err) + ")");
    let fallback = opts.text || "✨ *SHOWCASE*\n\n";
    for (const c of cards) {
      fallback += `• *${c.title}*: ${c.body}\n`;
    }
    return await sock.sendMessage(jid, { text: fallback, contextInfo }, opts.quoted ? { quoted: opts.quoted } : {});
  }
}

export function parseButtonResponse(rawMsg) {
  if (!rawMsg || !rawMsg.message) return null;
  const msg = rawMsg.message;

  if (msg.buttonsResponseMessage?.selectedButtonId) {
    return msg.buttonsResponseMessage.selectedButtonId;
  }

  if (msg.templateButtonReplyMessage?.selectedId) {
    return msg.templateButtonReplyMessage.selectedId;
  }

  const interactive =
    msg.interactiveResponseMessage ||
    msg.viewOnceMessage?.message?.interactiveResponseMessage ||
    msg.viewOnceMessageV2?.message?.interactiveResponseMessage;

  if (interactive?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const parsed = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
      if (parsed.id) return parsed.id;
      if (parsed.selected_row_id) return parsed.selected_row_id;
      if (parsed.values && parsed.values[0]) return parsed.values[0];
    } catch {}
  }

  if (interactive?.body?.text) {
    return interactive.body.text;
  }

  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  }

  return null;
}

export function isButtonResponse(rawMsg) {
  return parseButtonResponse(rawMsg) !== null;
}

export default {
  sendInteractive,
  sendCarousel,
  sendAdReply,
  quickReply,
  ctaUrl,
  ctaCopy,
  singleSelect,
  parseButtonResponse,
  isButtonResponse,
};
