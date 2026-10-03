/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  context.js — Fábrica ÚNICA del contexto de mensaje
//
//  ANTES: router.js (hooks `before`) y loader.js (comandos) construían
//  cada uno su propia versión del mismo objeto `msg`. Las dos copias
//  divergieron: los hooks veían un `msg` empobrecido (sin `isBot`, sin
//  `command`, sin `react`, sin `readMore`) mientras los comandos veían
//  el completo. `cmds/antilink.js` ya usa `msg.isBot` y `msg.command`:
//  funcionaba "de casualidad" porque `undefined` es falsy.
//
//  AHORA: existe un solo constructor. Hooks y comandos reciben
//  exactamente el mismo objeto. Un campo nuevo se agrega una vez.
//
//  Regla de diseño: este módulo NO importa de loader.js ni de router.js
//  (rompería el ciclo). Es el nivel más bajo de la cadena: sólo depende
//  de serialize + libs puras.
// ═══════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "baileys";
import { isAdmin, userPart, getCachedMeta } from "#serialize";
import { readMore } from "../lib/formatter.js";
import { getVerifiedQuoted, getChannelContext } from "../lib/contextBuilder.js";

const MEDIA_KEY_RE = /imageMessage|videoMessage|stickerMessage|audioMessage|documentMessage/i;

/** Devuelve la clave del mensaje que contiene media, o null. */
export function findMediaKey(obj) {
  if (!obj) return null;
  return Object.keys(obj).find((k) => MEDIA_KEY_RE.test(k)) || null;
}

/**
 * Descarga el media de un objeto de mensaje de Baileys a Buffer.
 * Vive aquí (y no en loader.js) para que nadie tenga que importar el
 * cargador desde el constructor de contexto.
 */
export async function downloadMediaFromObject(msgObject) {
  if (!msgObject) return null;
  const target = msgObject.message || msgObject;
  const mediaKey = findMediaKey(target);
  if (!mediaKey) return null;
  const rawType = mediaKey.replace(/Message$/i, "").toLowerCase();
  // Baileys tipa el tipo como union literal ("image" | "audio" | ...).
  // El valor sale del nombre de la clave de Baileys, así que es seguro.
  const stream = await downloadContentFromMessage(
    target[mediaKey],
    /** @type {import("baileys").MediaType} */ (rawType)
  );
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

/**
 * Añade `sock.reply(jid, texto, quoted, opts)` si el socket no lo trae.
 * Idempotente: llamarlo en cada mensaje no hace nada la segunda vez.
 */
export function ensureReplyShim(sock) {
  if (sock.reply) return sock.reply;
  sock.reply = (jid, text, quoted, opts) => {
    const content = typeof text === "string" ? { text } : text || {};
    const quote = quoted?.key ? quoted : quoted?.full || quoted;
    return sock.sendMessage(jid, { ...content, ...(opts || {}) }, { quoted: quote });
  };
  return sock.reply;
}

/**
 * Datos de grupo que cuestan red: se resuelven UNA vez por mensaje y se
 * pasan tanto a los hooks como al comando.
 */
export async function resolveGroupFacts(sock, ctx, engine) {
  let isAdmins = false;
  let isBotAdmins = false;
  let isOwner = false;
  let groupMetadata = null;

  if (ctx.isGroup) {
    isAdmins = await isAdmin(sock, ctx.chatId, ctx.senderId);
    const botJid = sock?.user?.id;
    if (botJid) isBotAdmins = await isAdmin(sock, ctx.chatId, botJid);
    const ownerJid = engine?.getOwnerJid?.();
    if (ownerJid) isOwner = userPart(ctx.senderId) === userPart(ownerJid);
    groupMetadata =
      getCachedMeta(ctx.chatId) ||
      (await sock?.groupMetadata?.(ctx.chatId).catch(() => null)) ||
      null;
  }

  return {
    isAdmins,
    isBotAdmins,
    isOwner,
    groupMetadata,
    participants: groupMetadata?.participants || [],
  };
}

/**
 * Construye el objeto `msg` que ven hooks y comandos.
 * @param {object} sock  socket de Baileys
 * @param {object} ctx   resultado de serializeMessage()
 * @param {object} [extra] { commandName, facts } para no recalcular
 */
export function buildEnrichedMessage(sock, ctx, extra = {}) {
  const full = ctx.full || {};
  const inner = full.message || {};

  ensureReplyShim(sock);

  const directMediaKey = findMediaKey(inner);
  const directInner = directMediaKey ? inner[directMediaKey] : null;

  const msg = {
    // ── Identidad ────────────────────────────────────────────────
    chat: ctx.chatId,
    sender: ctx.senderId,
    isGroup: ctx.isGroup,
    key: full.key || {},
    id: full.key?.id,
    fromMe: full.key?.fromMe,
    pushName: ctx.pushName || full.pushName || "",

    // ── Contenido ────────────────────────────────────────────────
    text: ctx.text,
    body: ctx.text,
    command: extra.commandName || "",
    usedPrefix: ctx.usedPrefix || ".",
    message: inner,
    msg: directInner || inner,
    mimetype: directInner?.mimetype || "",
    mentionedJid:
      inner?.extendedTextMessage?.contextInfo?.mentionedJid || [],
    quoted: null,

    // ── Permisos (rellenados por resolveGroupFacts) ──────────────
    isAdmin: false,
    isBotAdmin: false,
    isOwner: false,
    isBot: !!ctx.isBot,

    // ── Utilidades de respuesta ──────────────────────────────────
    readMore,
    download: () => downloadMediaFromObject(full.message),
    reply: async (content) => {
      if (typeof content === "string") {
        return sock.sendMessage(ctx.chatId, { text: content }, { quoted: full });
      }
      return sock.sendMessage(ctx.chatId, content, { quoted: full });
    },
    replyVerified: async (content, opts = {}) => {
      const vQuote = getVerifiedQuoted({
        botName: "Shin-MD",
        sender: ctx.senderId,
      });
      const payload =
        typeof content === "string"
          ? { text: content, ...opts }
          : { ...content, ...opts };
      return sock.sendMessage(ctx.chatId, payload, { quoted: vQuote });
    },
    replyChannel: async (content, opts = {}) => {
      const cCtx = getChannelContext({
        mentionedJid: [ctx.senderId],
        ...opts.contextInfo,
      });
      const payload =
        typeof content === "string"
          ? { text: content, contextInfo: cCtx, ...opts }
          : { ...content, contextInfo: cCtx, ...opts };
      return sock.sendMessage(ctx.chatId, payload, { quoted: full });
    },
    simulateRecording: async (ms = 1000) => {
      try {
        await sock.sendPresenceUpdate("recording", ctx.chatId);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      } catch {}
    },
    simulateTyping: async (ms = 1000) => {
      try {
        await sock.sendPresenceUpdate("composing", ctx.chatId);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      } catch {}
    },
    react: (emoji) => sock.sendMessage(ctx.chatId, { react: { text: emoji, key: full.key } }),
  };

  // ── Mensaje citado ─────────────────────────────────────────────
  // Se cubren las dos formas en que Baileys puede traer la cita: texto
  // extendido (lo normal) e imagen/video con caption.
  const ci = full.message?.extendedTextMessage?.contextInfo;
  const qMsg = ci?.quotedMessage;
  if (qMsg) {
    const qMediaKey = findMediaKey(qMsg);
    const qInner = qMediaKey ? qMsg[qMediaKey] : null;
    msg.quoted = {
      id: ci.stanzaId,
      stanzaId: ci.stanzaId,
      sender: ci.participant || "",
      text:
        qMsg?.conversation ||
        qMsg?.extendedTextMessage?.text ||
        qInner?.caption ||
        "",
      key: {
        remoteJid: ctx.chatId,
        fromMe: ci.participant ? ci.participant === sock?.user?.id : false,
        id: ci.stanzaId || "",
        participant: ci.participant || "",
      },
      message: qMsg,
      msg: qInner || qMsg,
      mimetype: qInner?.mimetype || "",
      seconds: qInner?.seconds || 0,
      download: () => downloadMediaFromObject(qMsg),
    };
  }

  return msg;
}

/**
 * Atajo: resuelve permisos, construye el `msg` y devuelve el paquete
 * completo que esperan hooks y handlers. Un solo camino, sin copias.
 */
export async function buildCommandContext(sock, ctx, engine, extra = {}) {
  const facts = extra.facts || (await resolveGroupFacts(sock, ctx, engine));
  const msg = buildEnrichedMessage(sock, ctx, extra);
  msg.isAdmin = facts.isAdmins;
  msg.isBotAdmin = facts.isBotAdmins;
  msg.isOwner = facts.isOwner;
  return { msg, ...facts, raw: ctx.full };
}

export default {
  buildCommandContext,
  buildEnrichedMessage,
  resolveGroupFacts,
  ensureReplyShim,
  downloadMediaFromObject,
  findMediaKey,
};
