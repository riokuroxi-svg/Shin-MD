/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-card.js — El menú de una sola tarjeta (el formato que se ve
//  como el de FURINA): viewOnceMessage + header de video + single_select
//
//  POR QUÉ EXISTE
//  Antes el menú pasaba por sendInteractive, que sube el video a los
//  servidores de WhatsApp EN CADA ENVÍO. Con un video de 3 MB eso son
//  10-18 segundos y el usuario cree que el bot no responde.
//
//  La solución es la que usan los bots que se ven "instantáneos":
//  1. El video se sube UNA vez y se guarda su `mediaKey`/`url`/`directPath`
//     (media-cache.json). Los siguientes envíos reutilizan el medio ya
//     subido: el mensaje sale en menos de un segundo.
//  2. La tarjeta va dentro de `viewOnceMessage`, que es el envoltorio que
//     hace que WhatsApp dibuje los botones y el header en grupos.
//  3. Se manda con relayMessage y su nodo `biz` con el flujo real
//     (menu_options cuando hay single_select), igual que wa-nodes.
//
//  Si la caché no existe o falla la subida, se cae al formato anterior
//  (sendInteractive) sin que el usuario note nada raro.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateWAMessageFromContent, proto, prepareWAMessageMedia } from "baileys";
import log from "#logger";
import { nodosInteractivos } from "#lib/wa-nodes";

const CACHE_FILE = path.join(process.cwd(), "data", "media-cache.json");
const CACHE_VERSION = 1;

/** ¿Existe el mensaje ya subido y sigue siendo del mismo archivo? */
function leerCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (raw?.version !== CACHE_VERSION) return {};
    return raw.media || {};
  } catch {
    return {};
  }
}

function escribirCache(media) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, media }, null, 2));
  } catch (err) {
    log.warn("menu-card: no se pudo guardar la caché de medios (" + (err.message || err) + ")");
  }
}

/** Huella del archivo para invalidar la caché cuando cambia el video. */
function huella(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/**
 * Sube el video la PRIMERA vez y devuelve el videoMessage listo para
 * incrustar. Las llamadas siguientes leen la caché (disco) o la memoria.
 */
async function videoMessageCacheado(sock, filePath, cacheMemoria) {
  if (!filePath) return null;
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  const marca = huella(buf);
  const clave = `video:${path.basename(filePath)}:${marca}`;

  // 1) memoria del proceso (lo normal entre mensajes seguidos)
  if (cacheMemoria.has(clave)) return cacheMemoria.get(clave);

  // 2) disco (sobrevive a reinicios del bot)
  const enDisco = leerCache()[clave];
  if (enDisco?.videoMessage) {
    cacheMemoria.set(clave, enDisco.videoMessage);
    return enDisco.videoMessage;
  }

  // 3) subir ahora (primera vez o video cambiado)
  const preparado = await prepareWAMessageMedia(
    { video: buf, gifPlayback: true },
    { upload: sock.waUploadToServer },
  );
  const videoMessage = preparado?.videoMessage;
  if (!videoMessage) return null;

  cacheMemoria.set(clave, videoMessage);
  const todas = { ...leerCache(), [clave]: { videoMessage, creado: new Date().toISOString() } };
  escribirCache(todas);
  return videoMessage;
}

const CACHE_MEMORIA = new Map();

/**
 * Manda el menú como UNA tarjeta con video en bucle y lista desplegable.
 *
 * @param {object} sock conexión de baileys
 * @param {string} jid
 * @param {object} op
 * @param {string} op.body texto de la tarjeta
 * @param {string} [op.footer]
 * @param {string} [op.title]
 * @param {string} [op.videoPath] ruta local del video (se cachea al subir)
 * @param {object} op.selector { title, sections } para el single_select
 * @param {object} [op.contextInfo]
 * @param {object} [op.quoted]
 * @returns {Promise<object|null>} el mensaje enviado, o null si no se pudo
 */
export async function sendMenuCard(sock, jid, op = {}) {
  const { body = "", footer = "", title = "", videoPath = null, selector = null } = op;
  if (!sock?.relayMessage || !selector) return null;

  const videoMessage = await videoMessageCacheado(sock, videoPath, CACHE_MEMORIA);

  const interactivo = {
    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: videoMessage ? "" : title,
        subtitle: "",
        hasMediaAttachment: !!videoMessage,
        videoMessage: videoMessage || undefined,
      }),
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: body }),
      footer: footer ? proto.Message.InteractiveMessage.Footer.fromObject({ text: footer }) : undefined,
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify(selector),
          },
        ],
      }),
      contextInfo: op.contextInfo || undefined,
    }),
  };

  // viewOnce es el envoltorio que hace que la tarjeta se vea "completa"
  // en Android y que los botones se dibujen en grupos.
  const content = { viewOnceMessage: { message: interactivo } };

  try {
    const msg = generateWAMessageFromContent(jid, content, {
      userJid: sock.user?.id,
      quoted: op.quoted && op.quoted.message ? op.quoted : undefined,
    });

    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: nodosInteractivos(jid, { contenido: msg.message }),
    });
    return msg;
  } catch (err) {
    log.warn("menu-card: no se pudo enviar (" + (err.message || err) + ")");
    return null;
  }
}

export default { sendMenuCard };
