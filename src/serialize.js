// ═══════════════════════════════════════════════════════════════════
//  serialize.js — Serializador de mensajes de WhatsApp
//  Extrae de la WAMessage cruda: texto, argumentos, menciones, quoted,
//  tipo de contenido. Es el puente entre Baileys y el router.
// ═══════════════════════════════════════════════════════════════════

import { getContentType } from "baileys";
import { getCachedMeta, setCachedMeta, deleteCachedMeta } from "#metaCache";

const GROUP_REGEX = /^(\d+)@g\.us$/;

export function getText(msg) {
  if (!msg || !msg.message) return "";
  const content = msg.message;
  const type = getContentType(content);

  if (type === "conversation") return content.conversation || "";
  if (type === "extendedTextMessage") return content.extendedTextMessage.text || "";
  if (type === "imageMessage") return content.imageMessage.caption || "";
  if (type === "videoMessage") return content.videoMessage.caption || "";
  if (type === "documentMessage") return content.documentMessage.caption || "";
  if (type === "audioMessage") return "";
  if (type === "stickerMessage") return "";
  if (type === "reactionMessage") return content.reactionMessage.text || "";

  return "";
}

export function isJidGroup(jid) {
  return typeof jid === "string" && GROUP_REGEX.test(jid);
}

export function normalizeJid(jid) {
  if (!jid) return "";
  const match = /^(\d+)/.exec(jid);
  return match ? match[1] + "@s.whatsapp.net" : jid;
}

/**
 * Serializa un mensaje de Baileys a un objeto manejable por comandos.
 * @param {object} msg - WAMessage de Baileys
 * @param {object} sock - socket de Baileys
 */
export function serializeMessage(msg, sock) {
  const key = msg.key || {};
  const chatId = key.remoteJid || "";
  const senderId = key.participant || key.remoteJid || "";
  const isGroup = isJidGroup(chatId);
  const pushName = msg.pushName || "";
  const text = getText(msg);
  const type = getContentType(msg.message || {});

  // Argumentos: texto partido por espacios, quitando el comando
  const args = text.trim().split(/\s+/).slice(1).filter(Boolean);
  const arg = args.join(" ");

  // Menciones del contextInfo (quoted + mencionadas en el texto)
  const mentions = [];
  const quoted = msg.message && msg.message.extendedTextMessage
    ? msg.message.extendedTextMessage.contextInfo : null;
  if (quoted && Array.isArray(quoted.mentionedJid)) {
    for (const j of quoted.mentionedJid) mentions.push(j);
  }

  // Quoted message (el mensaje que se está respondiendo)
  let replyMsg = null;
  if (quoted && quoted.quotedMessage) {
    replyMsg = {
      key: {
        remoteJid: chatId,
        fromMe: quoted.participant ? quoted.participant === sock?.user?.id : false,
        id: quoted.stanzaId || "",
        participant: quoted.participant || "",
      },
      message: quoted.quotedMessage,
      pushName: "",
      messageTimestamp: Date.now() / 1000,
    };
  }

  const isOwner = (ownerJid) => {
    if (!ownerJid) return false;
    return normalizeJid(senderId) === normalizeJid(ownerJid) ||
           normalizeJid(senderId) === normalizeJid(ownerJid.split(":")[0] + "@s.whatsapp.net");
  };

  const timestampMs = (msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now());

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
    quoted,
    replyMsg,
    isOwner,
    timestampMs,
    fromMe: !!key.fromMe,
    isBot: key.fromMe || chatId === "status@broadcast",
    full: msg,
  };
}

/**
 * Resuelve el JID al que responder: quoted → participante, si no el sender.
 */
export function getReplyTarget(jid, isGroup) {
  // En grupos se responde al remitente del mensaje
  return normalizeJid(jid);
}

export async function isAdmin(sock, chatId, senderId) {
  try {
    const meta = getCachedMeta(chatId);
    if (meta && Array.isArray(meta.participants)) {
      const participant = meta.participants.find(p => p.id === senderId);
      return participant ? (participant.admin === "admin" || participant.admin === "superadmin") : false;
    }
    // Si no hay caché, no asumir admin (evita privilegios indebidos)
    return false;
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

export default { getText, isJidGroup, normalizeJid, serializeMessage, isAdmin, getReplyTarget,
  getCachedMeta, setCachedMeta, deleteCachedMeta, resolveParticipantJid, resolveJidSync, BoundedMap, getBuffer };
