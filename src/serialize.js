/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  serialize.js — Serializador de mensajes de WhatsApp
//  Extrae de la WAMessage cruda: texto, argumentos, menciones, quoted,
//  tipo de contenido. Es el puente entre Baileys y el router.
// ═══════════════════════════════════════════════════════════════════

import { getContentType, jidDecode } from "baileys";
import { getCachedMeta, setCachedMeta, deleteCachedMeta } from "#metaCache";

export function isJidGroup(jid) {
  if (!jid || typeof jid !== "string") return false;
  return jid.endsWith("@g.us");
}

export function normalizeJid(jid) {
  if (!jid) return "";
  const s = typeof jid === "number" ? String(jid) : String(jid).trim();
  if (!s) return "";
  if (s.endsWith("@g.us")) return s;
  if (s.endsWith("@newsletter")) return s;
  if (s.endsWith("@broadcast")) return s;
  if (s.endsWith("@lid")) return s;
  if (/:\d+@/i.test(s)) {
    const decoded = jidDecode(s);
    if (decoded?.user && decoded?.server) return `${decoded.user}@${decoded.server}`;
  }
  if (s.endsWith("@s.whatsapp.net")) {
    const user = s.split("@")[0].split(":")[0];
    return `${user}@s.whatsapp.net`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits && digits.length >= 4 && digits.length <= 15) return `${digits}@s.whatsapp.net`;
  return s;
}

/**
 * Parte de usuario de un JID: sin servidor (@...) ni sufijo de dispositivo (:0, :1...)
 */
/**
 * JID del propio bot a partir del socket, sin el sufijo de dispositivo.
 *
 * Reemplaza el `sock.user.id.split(":")[0] + "@s.whatsapp.net"` que
 * estaba copiado en 62 archivos. Además corrige un fallo latente del
 * original: si `sock.user.id` llega YA sin dispositivo
 * ("5215...@s.whatsapp.net"), la expresión vieja producía
 * "5215...@s.whatsapp.net@s.whatsapp.net" (JID inválido); `normalizeJid`
 * lo detecta y lo deja bien.
 * @param {{user?: {id?: string}}} sock
 * @returns {string} JID del bot, o "" si el socket aún no tiene usuario
 */
export function botJid(sock) {
  return normalizeJid(sock?.user?.id || "");
}

export function userPart(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

/**
 * Desenvolve recursivamente cualquier envoltura de mensaje de WhatsApp
 * (ephemeral, viewOnce, viewOnceExtension, documentWithCaption, etc.)
 */
export function getRealMessage(content) {
  if (!content) return null;
  let m = content;
  while (
    m?.ephemeralMessage?.message ||
    m?.viewOnceMessage?.message ||
    m?.viewOnceMessageV2?.message ||
    m?.viewOnceMessageV2Extension?.message ||
    m?.documentWithCaptionMessage?.message ||
    m?.editedMessage?.message
  ) {
    m =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;
  }
  return m;
}

export function getText(msg) {
  if (!msg || !msg.message) return "";
  const content = getRealMessage(msg.message);
  if (!content) return "";
  const type = getContentType(content);

  if (type === "conversation") return content.conversation || "";
  if (type === "extendedTextMessage") return content.extendedTextMessage?.text || "";
  if (type === "imageMessage") return content.imageMessage?.caption || "";
  if (type === "videoMessage") return content.videoMessage?.caption || "";
  if (type === "documentMessage") return content.documentMessage?.caption || "";
  if (type === "buttonsResponseMessage") return content.buttonsResponseMessage?.selectedButtonId || "";
  if (type === "templateButtonReplyMessage") return content.templateButtonReplyMessage?.selectedId || "";
  if (type === "listResponseMessage") return content.listResponseMessage?.singleSelectReply?.selectedRowId || "";
  if (type === "interactiveResponseMessage") {
    try {
      const params = JSON.parse(content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || "{}");
      return params.id || "";
    } catch { return ""; }
  }
  if (type === "reactionMessage") return content.reactionMessage?.text || "";

  return content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.videoMessage?.caption || "";
}

/**
 * Serializa un mensaje de Baileys a un objeto manejable por comandos.
 * @param {object} msg - WAMessage de Baileys
 * @param {object} sock - socket de Baileys
 */
export function serializeMessage(msg, sock) {
  const key = msg.key || {};
  const chatId = key.remoteJid || "";
  const crudo = isJidGroup(chatId) ? (key.participant || key.remoteJid || "") : (key.remoteJid || "");
  // WhatsApp ya direcciona muchos mensajes (sobre todo de grupo) con IDs
  // @lid en vez del número real. Baileys adjunta el número en el propio
  // mensaje (key.participantPn / key.senderPn): si el remitente salió
  // como @lid y el número viaja pegado, usamos el número. Si no viaja,
  // caemos al @lid (nadie podrá suplantar al dueño solo por salir @lid).
  const numeroPegado = normalizeJid(key.participantPn || key.senderPn || "");
  const senderId = (crudo.endsWith("@lid") && numeroPegado.endsWith("@s.whatsapp.net"))
    ? numeroPegado
    : crudo;
  const isGroup = isJidGroup(chatId);
  const pushName = msg.pushName || "";
  const text = getText(msg);
  const unwrappedMessage = getRealMessage(msg.message || {}) || {};
  const type = getContentType(unwrappedMessage);

  // Argumentos: texto partido por espacios, quitando el comando
  const args = text.trim().split(/\s+/).slice(1).filter(Boolean);
  const arg = args.join(" ");

  // Menciones del contextInfo (quoted + mencionadas en el texto)
  const mentions = [];
  const contextInfo = unwrappedMessage?.extendedTextMessage?.contextInfo
    || unwrappedMessage?.imageMessage?.contextInfo
    || unwrappedMessage?.videoMessage?.contextInfo
    || unwrappedMessage?.documentMessage?.contextInfo
    || null;

  if (contextInfo && Array.isArray(contextInfo.mentionedJid)) {
    for (const j of contextInfo.mentionedJid) mentions.push(j);
  }

  // Quoted message (el mensaje que se está respondiendo)
  let replyMsg = null;
  if (contextInfo && contextInfo.quotedMessage) {
    const qUnwrapped = getRealMessage(contextInfo.quotedMessage);
    replyMsg = {
      key: {
        remoteJid: chatId,
        fromMe: contextInfo.participant ? contextInfo.participant === sock?.user?.id : false,
        id: contextInfo.stanzaId || "",
        participant: contextInfo.participant || "",
      },
      message: qUnwrapped,
      pushName: "",
      messageTimestamp: Date.now() / 1000,
    };
  }

  const isOwner = (ownerJid) => {
    const sUser = userPart(senderId);
    if (!sUser) return false;
    if (ownerJid && userPart(ownerJid) === sUser) return true;
    if (Array.isArray(globalThis.owner)) {
      return globalThis.owner.some(num => userPart(num) === sUser);
    }
    return normalizeJid(senderId) === normalizeJid(ownerJid);
  };

  const rawTs = typeof msg.messageTimestamp === "object" && msg.messageTimestamp !== null
    ? (msg.messageTimestamp.low || Number(msg.messageTimestamp))
    : Number(msg.messageTimestamp || 0);
  const timestampMs = rawTs > 0 ? rawTs * 1000 : Date.now();

  return {
    key,
    chatId,
    senderId,
    isGroup,
    pushName,
    text,
    arg,
    args,
    type,
    mentions,
    quoted: contextInfo,
    replyMsg,
    isOwner,
    timestampMs,
    fromMe: !!key.fromMe,
    isBot: !!key.fromMe || chatId === "status@broadcast",
    full: msg,
  };
}

/**
 * Resuelve el JID al que responder en grupos o privados.
 */
export function getReplyTarget(jid, isGroup) {
  if (isGroup || (typeof jid === "string" && jid.endsWith("@g.us"))) return jid;
  return normalizeJid(jid);
}

export async function isAdmin(sock, chatId, senderId) {
  try {
    const target = userPart(senderId);
    if (!target) return false;

    let meta = getCachedMeta(chatId);
    if (!meta || !Array.isArray(meta.participants)) {
      meta = await sock?.groupMetadata?.(chatId).catch(() => null);
      if (meta?.participants) setCachedMeta(chatId, meta);
    }
    if (!meta || !Array.isArray(meta.participants)) return false;

    const participant = meta.participants.find(p => {
      const pId = userPart(p.id);
      const pLid = userPart(p.lid);
      const pPhone = userPart(p.phoneNumber);
      return pId === target || pLid === target || pPhone === target;
    });
    return participant ? (participant.admin === "admin" || participant.admin === "superadmin") : false;
  } catch {
    return false;
  }
}

// ─── Ginko-compat exports ─────────────────────────────────────
export { getCachedMeta, setCachedMeta, deleteCachedMeta };
export function resolveParticipantJid(p) {
  if (!p) return null;
  return p.id || p.jid || p.phoneNumber || null;
}
export function resolveJidSync(raw) { return normalizeJid(raw); }
export class BoundedMap extends Map {
  constructor(m, t) { super(); this.max = m; this.ttl = t || 0; }
  set(k, v) { if (this.size >= this.max) this.delete(this.keys().next().value); return super.set(k, v); }
}
export async function getBuffer(url) {
  const r = await fetch(url);
  return Buffer.from(await r.arrayBuffer());
}
export function getSelectedResponse() { return null; }

// Alias de compatibilidad: los comandos de Ginko importan `smsg`.
export const smsg = serializeMessage;

export function patchGroupMetadata(sock) {
  const socks = Array.isArray(sock) ? sock : [sock];
  for (const s of socks) {
    if (!s || s.groupMetadataPatched || typeof s.groupMetadata !== "function") continue;
    s.groupMetadataPatched = true;
    const orig = s.groupMetadata.bind(s);
    s.groupMetadata = async (jid) => {
      try {
        const cached = getCachedMeta(jid);
        if (cached) return cached;
        const meta = await orig(jid);
        if (meta?.participants) setCachedMeta(jid, meta);
        return meta;
      } catch {
        deleteCachedMeta(jid);
        return null;
      }
    };
  }
}

export default {
  getText,
  getRealMessage,
  isJidGroup,
  normalizeJid,
  userPart,
  serializeMessage,
  smsg,
  patchGroupMetadata,
  isAdmin,
  getReplyTarget,
  getCachedMeta,
  setCachedMeta,
  deleteCachedMeta,
  resolveParticipantJid,
  resolveJidSync,
  BoundedMap,
  getBuffer,
};
