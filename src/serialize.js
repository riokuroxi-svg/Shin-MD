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

import { getContentType } from "baileys";
import { getCachedMeta, setCachedMeta, deleteCachedMeta } from "#metaCache";
import {
  esGrupo as isJidGroup,
  normalizeJid,
  mxCanon,
  userPart,
  esLid as isLidJid,
} from "./lib/jid.js";
import * as lid from "./lib/lid.js";

// Las utilidades viven en #lib/jid para que la capa LID pueda usarlas sin
// crear un ciclo de imports. Se re-exportan con los mismos nombres de
// siempre: los comandos y las pruebas siguen importando de aquí.
export { isJidGroup, normalizeJid, mxCanon, userPart };

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
  const crudo = normalizeJid(
    isJidGroup(chatId) ? (key.participant || key.remoteJid || "") : (key.remoteJid || "")
  );

  // WhatsApp direcciona muchos mensajes (sobre todo de grupo) con el LID
  // en vez del número. El identificador alternativo viene en la propia
  // clave, con nombres distintos según la versión del conector:
  //   6.x  grupos:   key.participant (puede ser @lid) + key.participantPn
  //        privados: key.remoteJid  (puede ser @lid) + key.senderPn
  //   7.x  grupos:   key.participant + key.participantAlt
  //        privados: key.remoteJid  + key.remoteJidAlt
  // #lib/lid acepta las dos formas; la pareja se guarda para siempre y la
  // llave que ve el bot es el TELÉFONO cuando se conoce: así la economía y
  // los permisos no se parten en dos cuentas. Si aún no se conoce, la llave
  // es el LID.
  const pareja = lid.parejaDeClave(key);
  const identidad = lid.resolver(crudo, isLidJid(crudo) ? pareja.pn : pareja.lid);
  const senderId = identidad.key || crudo;
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
    || unwrappedMessage?.stickerMessage?.contextInfo
    || unwrappedMessage?.audioMessage?.contextInfo
    || unwrappedMessage?.buttonsResponseMessage?.contextInfo
    || unwrappedMessage?.templateButtonReplyMessage?.contextInfo
    || unwrappedMessage?.interactiveResponseMessage?.contextInfo
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
        fromMe: contextInfo.participant
          ? lid.mismaPersona(contextInfo.participant, sock?.user?.id)
          : false,
        id: contextInfo.stanzaId || "",
        participant: contextInfo.participant || "",
      },
      message: qUnwrapped,
      pushName: "",
      messageTimestamp: Date.now() / 1000,
    };
  }

  // Dueño: se compara por número (con la regla mexicana 521 = 52) y por la
  // pareja LID ↔ teléfono. Antes, si el dueño escribía desde un chat LID y
  // solo se conocía ese identificador, el bot le contestaba «solo el dueño».
  const isOwner = (ownerJid) => {
    const sUser = userPart(senderId);
    if (!sUser) return false;
    if (ownerJid && userPart(ownerJid) === sUser) return true;
    if (Array.isArray(globalThis.owner)) {
      if (globalThis.owner.some(num => userPart(num) === sUser)) return true;
    }
    if (ownerJid && lid.mismaPersona(senderId, ownerJid)) return true;
    if (Array.isArray(globalThis.owner)) {
      return globalThis.owner.some(num => lid.mismaPersona(senderId, String(num)));
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
    // Cara LID y cara teléfono del remitente (una puede venir vacía).
    senderPn: identidad.pn,
    senderLid: identidad.lid,
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

/**
 * ¿El remitente es administrador del grupo?
 *
 * Baileys entrega cada participante como `{ id, jid, lid, admin }`:
 *   · en un grupo con direccionamiento por teléfono, `id` es el PN;
 *   · en un grupo con direccionamiento por LID (los nuevos), `id` es el
 *     LID y el teléfono viene en `jid`.
 * Comparar solo `id` (o buscar un `phoneNumber` que no existe) daba el
 * fallo simétrico: el admin real no era admin, y a veces otro heredaba
 * el permiso. Aquí se comparan las CUATRO formas y, además, la pareja
 * LID ↔ teléfono que ya se conozca.
 */
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

    // Aprender la pareja de cada participante antes de comparar: el grupo
    // trae las dos caras juntas, es la fuente más barata que hay.
    lid.aprenderDeGrupo(meta);

    const participant = meta.participants.find((p) => {
      const formas = [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean);
      return formas.some((f) => userPart(f) === target || lid.mismaPersona(f, senderId));
    });
    if (!participant) return false;
    return participant.admin === "admin" || participant.admin === "superadmin";
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
  set(k, v) { if (!this.has(k) && this.size >= this.max) this.delete(this.keys().next().value); return super.set(k, v); }
}
export async function getBuffer(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
        if (meta?.participants) {
          setCachedMeta(jid, meta);
          // El grupo trae, por cada participante, el LID y el teléfono
          // juntos: cada vez que se piden metadatos se aprende gratis.
          lid.aprenderDeGrupo(meta);
        }
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
  mxCanon,
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
