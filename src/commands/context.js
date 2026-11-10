/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  context.js — Fábrica ÚNICA del contexto de mensaje
//
//  Regla de diseño: este módulo NO importa de loader.js ni de router.js
//  (rompería el ciclo). Es el nivel más bajo de la cadena: sólo depende
//  de serialize + libs puras.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { downloadContentFromMessage } from "baileys";
import { fileTypeFromBuffer } from "file-type";
import mimeTypes from "mime-types";
import { botJid as resolveBotJid, isAdmin, getCachedMeta, normalizeJid } from "#serialize";
import { readMore } from "../lib/formatter.js";
import { getVerifiedQuoted, getChannelContext } from "../lib/contextBuilder.js";
import { attachExifToWebp, imageToWebp } from "#core/exif";
import * as lid from "../lib/lid.js";

const execFileAsync = promisify(execFile);
const MEDIA_KEY_RE = /imageMessage|videoMessage|stickerMessage|audioMessage|documentMessage/i;

/** Devuelve la clave del mensaje que contiene media, o null. */
export function findMediaKey(obj) {
  if (!obj) return null;
  return Object.keys(obj).find((k) => MEDIA_KEY_RE.test(k)) || null;
}

/**
 * Descarga el media de un objeto de mensaje de Baileys a Buffer.
 */
export async function downloadMediaFromObject(msgObject) {
  if (!msgObject) return null;
  const target = msgObject.message || msgObject;
  const mediaKey = findMediaKey(target);
  if (!mediaKey) return null;
  const rawType = mediaKey.replace(/Message$/i, "").toLowerCase();
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

async function resolveMediaBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input !== "string") throw new Error("Entrada multimedia inválida");
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar medio`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (input.startsWith("data:")) {
    const idx = input.indexOf(",");
    return Buffer.from(idx >= 0 ? input.slice(idx + 1) : "", "base64");
  }
  return fs.readFileSync(input);
}

/**
 * Añade shims heredados compatibles (`decodeJid`, `sendFile`, `sendCodeMessage`,
 * `sendImageAsSticker`, `sendVideoAsSticker`) sobre `sock`. Idempotente.
 */
export function ensureSocketShims(sock) {
  if (!sock) return sock;
  ensureReplyShim(sock);

  if (typeof sock.decodeJid !== "function") {
    sock.decodeJid = (jid) => (jid ? normalizeJid(jid) : jid);
  }

  if (typeof sock.sendFile !== "function") {
    sock.sendFile = async (jid, media, filename = "", caption = "", quoted = null, opts = {}) => {
      const buf = await resolveMediaBuffer(media);
      const detected = await fileTypeFromBuffer(buf).catch(() => null);
      const extMime = filename ? mimeTypes.lookup(filename) : null;
      const mimetype = opts.mimetype || detected?.mime || (typeof extMime === "string" ? extMime : "application/octet-stream");
      const quote = quoted?.key ? quoted : quoted?.full || quoted;
      const cap = caption ?? undefined;

      /** @type {any} */
      let payload;
      if (opts.asDocument) {
        payload = { document: buf, mimetype, fileName: filename || `file.${detected?.ext || "bin"}`, caption: cap };
      } else if (/webp/i.test(mimetype) && opts.asSticker) {
        payload = { sticker: buf };
      } else if (/^image\//.test(mimetype) && !/svg|tiff/i.test(mimetype)) {
        payload = { image: buf, caption: cap, mimetype };
      } else if (/^video\//.test(mimetype)) {
        payload = { video: buf, caption: cap, mimetype, fileName: filename || "video.mp4" };
      } else if (/^audio\//.test(mimetype)) {
        payload = { audio: buf, mimetype, ptt: !!opts.ptt };
      } else {
        payload = { document: buf, mimetype, fileName: filename || `file.${detected?.ext || "bin"}`, caption: cap };
      }
      return sock.sendMessage(jid, { ...payload, ...opts }, quote ? { quoted: quote } : undefined);
    };
  }

  if (typeof sock.sendCodeMessage !== "function") {
    sock.sendCodeMessage = async (jid, filename = "code.txt", content = "", quoted = null) => {
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
      const extMime = mimeTypes.lookup(filename);
      const mimetype = typeof extMime === "string" ? extMime : "text/plain";
      const quote = quoted?.key ? quoted : quoted?.full || quoted;
      return sock.sendMessage(
        jid,
        { document: buf, mimetype, fileName: filename || "code.txt" },
        quote ? { quoted: quote } : undefined
      );
    };
  }

  if (typeof sock.sendImageAsSticker !== "function") {
    sock.sendImageAsSticker = async (jid, media, quoted = null, opts = {}) => {
      const rawBuf = await resolveMediaBuffer(media);
      const detected = await fileTypeFromBuffer(rawBuf).catch(() => null);
      const webpBuf = detected?.mime === "image/webp" ? rawBuf : await imageToWebp(rawBuf);
      let finalBuf = webpBuf;
      try {
        finalBuf = await attachExifToWebp(webpBuf, opts);
      } catch {
        finalBuf = webpBuf;
      }
      const quote = quoted?.key ? quoted : quoted?.full || quoted;
      return sock.sendMessage(jid, { sticker: finalBuf }, quote ? { quoted: quote } : undefined);
    };
  }

  if (typeof sock.sendVideoAsSticker !== "function") {
    sock.sendVideoAsSticker = async (jid, media, quoted = null, opts = {}) => {
      const tmpDir = path.join(process.cwd(), "tmp");
      fs.mkdirSync(tmpDir, { recursive: true });
      const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let inFile = typeof media === "string" && fs.existsSync(media) ? media : null;
      let createdIn = false;
      const outFile = path.join(tmpDir, `vsticker-${tag}.webp`);
      try {
        if (!inFile) {
          const rawBuf = await resolveMediaBuffer(media);
          inFile = path.join(tmpDir, `vsrc-${tag}.mp4`);
          fs.writeFileSync(inFile, rawBuf);
          createdIn = true;
        }
        await execFileAsync("ffmpeg", [
          "-y", "-i", inFile,
          "-vf", "fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
          "-an", "-c:v", "libwebp_anim", "-preset", "picture", "-compression_level", "6", "-q:v", "65", "-loop", "0", "-t", "10",
          outFile,
        ], { timeout: 30000, windowsHide: true });
        const webpBuf = fs.readFileSync(outFile);
        let finalBuf = webpBuf;
        try {
          finalBuf = await attachExifToWebp(webpBuf, opts);
        } catch {
          finalBuf = webpBuf;
        }
        const quote = quoted?.key ? quoted : quoted?.full || quoted;
        return await sock.sendMessage(jid, { sticker: finalBuf }, quote ? { quoted: quote } : undefined);
      } finally {
        if (createdIn && inFile) try { fs.unlinkSync(inFile); } catch {}
        try { fs.unlinkSync(outFile); } catch {}
      }
    };
  }

  return sock;
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

  const ownerJid = engine?.getOwnerJid?.();
  if (ownerJid) isOwner = !!ctx.isOwner?.(ownerJid) || lid.mismaPersona(ctx.senderId, ownerJid);

  if (ctx.isGroup) {
    isAdmins = await isAdmin(sock, ctx.chatId, ctx.senderId);
    const botId = resolveBotJid(sock);
    if (botId) isBotAdmins = await isAdmin(sock, ctx.chatId, botId);
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
 * @param {object} [extra] { commandName, facts, isCommands }
 */
export function buildEnrichedMessage(sock, ctx, extra = {}) {
  const full = ctx.full || {};
  const inner = full.message || {};

  ensureSocketShims(sock);

  const directMediaKey = findMediaKey(inner);
  const directInner = directMediaKey ? inner[directMediaKey] : null;
  const directMentions = Array.isArray(directInner?.contextInfo?.mentionedJid)
    ? directInner.contextInfo.mentionedJid
    : [];
  const textMentions = Array.isArray(inner?.extendedTextMessage?.contextInfo?.mentionedJid)
    ? inner.extendedTextMessage.contextInfo.mentionedJid
    : [];
  const mentionedJid = [...new Set([...textMentions, ...directMentions])];

  const msg = {
    // ── Identidad ────────────────────────────────────────────────
    chat: ctx.chatId,
    sender: ctx.senderId,
    senderPn: ctx.senderPn || "",
    senderLid: ctx.senderLid || "",
    isGroup: ctx.isGroup,
    key: full.key || {},
    id: full.key?.id,
    fromMe: full.key?.fromMe,
    pushName: ctx.pushName || full.pushName || "",
    full,

    // ── Contenido ────────────────────────────────────────────────
    text: ctx.text,
    body: ctx.text,
    command: extra.commandName || ctx.commandName || "",
    usedPrefix: ctx.usedPrefix || ".",
    isCommands: Boolean(extra.isCommands ?? ctx.isCommands),
    message: inner,
    msg: directInner || inner,
    mimetype: directInner?.mimetype || "",
    mentionedJid,
    quoted: null,

    // ── Permisos (rellenados por resolveGroupFacts) ──────────────
    isAdmin: false,
    isBotAdmin: false,
    isOwner: false,
    isBot: !!ctx.isBot,

    // ── Utilidades de respuesta ──────────────────────────────────
    readMore,
    download: () => downloadMediaFromObject(full.message),
    reply: async (content, opts = {}) => {
      if (typeof content === "string") {
        return sock.sendMessage(ctx.chatId, { text: content, ...opts }, { quoted: full });
      }
      return sock.sendMessage(ctx.chatId, { ...content, ...opts }, { quoted: full });
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
  const ci =
    inner?.extendedTextMessage?.contextInfo ||
    directInner?.contextInfo ||
    inner?.stickerMessage?.contextInfo ||
    inner?.audioMessage?.contextInfo ||
    null;
  const qMsg = ci?.quotedMessage;
  if (qMsg) {
    const qMediaKey = findMediaKey(qMsg);
    const qInner = qMediaKey ? qMsg[qMediaKey] : null;
    const qCaption = qInner?.caption || "";
    const qType = qMediaKey || Object.keys(qMsg)[0] || "";
    msg.quoted = {
      id: ci.stanzaId,
      stanzaId: ci.stanzaId,
      sender: ci.participant || "",
      type: qType,
      caption: qCaption,
      isAnimated: !!qInner?.isAnimated,
      text:
        qMsg?.conversation ||
        qMsg?.extendedTextMessage?.text ||
        qCaption ||
        "",
      key: {
        remoteJid: ctx.chatId,
        fromMe: ci.participant
          ? lid.mismaPersona(ci.participant, sock?.user?.id) ||
            lid.mismaPersona(ci.participant, sock?.user?.lid)
          : false,
        id: ci.stanzaId || "",
        participant: ci.participant || "",
      },
      message: qMsg,
      msg: qInner ? { ...qInner, isAnimated: !!qInner.isAnimated, seconds: qInner.seconds || 0 } : qMsg,
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
  ensureSocketShims,
  downloadMediaFromObject,
  findMediaKey,
};
