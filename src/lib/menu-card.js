/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-card.js — El menú de una sola tarjeta con botones nativos.
//
//  LAS CUATRO REGLAS QUE HACEN QUE EL TELÉFONO LO PINTE
//  ────────────────────────────────────────────────────
//  1. NADA de `viewOnceMessage`. Envolver la tarjeta en viewOnce hace
//     que el servidor la acepte y los clientes nuevos la descarten
//     (es lo primero que se quitó en las librerías que sí funcionan).
//     Va el InteractiveMessage suelto con messageContextInfo.
//  2. NADA de `title`/`subtitle` vacíos en el header. Un header con
//     title:"" y subtitle:"" se codifica igual, el servidor lo acusa,
//     llegan los recibos de WhatsApp Web… y el teléfono principal
//     nunca lo pinta. Si no hay título, el campo se OMITE.
//  3. `hasMediaAttachment` sólo cuando de verdad hay media dentro.
//  4. contextInfo con forwardingScore 99 + isForwarded y canal con
//     serverMessageId 1 (0 es inválido).
//
//  LO QUE SE CONSERVA DEL DISEÑO ANTERIOR
//  ─────────────────────────────────────
//  El video se sube UNA vez y se guarda en data/media-cache.json.
//  Subirlo en cada envío costaba 10-18 s por redes móviles.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateWAMessageFromContent, proto, prepareWAMessageMedia } from "baileys";
import { datosDelVideo } from "#lib/mp4-info";
import log from "#logger";

const CACHE_FILE = path.join(process.cwd(), "data", "media-cache.json");
const CACHE_VERSION = 2; // v2: formato nuevo, invalida la caché vieja

// ── Serialización con Buffers ─────────────────────────────────────
// mediaKey, fileSha256 y fileEncSha256 son Buffer en el videoMessage.
// JSON.stringify los convierte en {"type":"Buffer","data":[...]} o en
// string, y al revivirlos el mensaje viaja con claves corruptas: el
// servidor lo acepta y el teléfono NO lo pinta. Se guardan en base64
// con una marca y se reconstruyen como Buffer al leer.
const ES_BUFFER = "__buf__";

function empaquetar(objeto) {
  return JSON.stringify(objeto, (k, v) => {
    if (Buffer.isBuffer(v)) return { [ES_BUFFER]: v.toString("base64") };
    // objetos que ya vienen como {type:"Buffer",data:[...]}
    if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
      return { [ES_BUFFER]: Buffer.from(v.data).toString("base64") };
    }
    return v;
  });
}

function desenvolver(objeto) {
  return JSON.parse(JSON.stringify(objeto), (k, v) => {
    if (v && typeof v === "object" && typeof v[ES_BUFFER] === "string") {
      return Buffer.from(v[ES_BUFFER], "base64");
    }
    return v;
  });
}

function leerCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (raw?.version !== CACHE_VERSION) return {};
    return desenvolver(raw.media || {});
  } catch {
    return {};
  }
}

function escribirCache(media) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, empaquetar({ version: CACHE_VERSION, media }));
  } catch (err) {
    log.warn("menu-card: caché no guardada (" + (err.message || err) + ")");
  }
}

function huella(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

const MEMORIA = new Map();

/** ¿La clave de medio sirve para reenviar? Buffer no vacío o base64 no vacío. */
function claveValida(k) {
  if (Buffer.isBuffer(k)) return k.length > 0;
  return typeof k === "string" && k.length >= 16;
}

/**
 * Sube el video la PRIMERA vez y reutiliza el `videoMessage` después.
 * Ese objeto (url, mediaKey, directPath, fileSha256...) es lo que
 * `prepareWAMessageMedia` devuelve y lo que el cliente necesita para
 * pintar el bucle sin volver a subir nada.
 */
/**
 * Miniatura JPEG del primer fotograma útil del vídeo.
 *
 * WhatsApp usa la miniatura como carátula del reproductor. Sin ella
 * el cliente no tiene qué pintar mientras descarga y, si además faltan
 * las dimensiones, termina mostrando la tarjeta como un archivo.
 *
 * Se genera con ffmpeg si está en el PATH (Termux lo trae) y queda
 * cacheada en disco. Si no hay ffmpeg no pasa nada: la tarjeta sale
 * igual, sólo que sin carátula.
 *
 * @param {string} filePath
 * @returns {Buffer|null}
 */
function miniaturaDeVideo(filePath) {
  if (!filePath) return null;
  const destino = path.join(
    process.cwd(), "data", "media-cache",
    path.basename(filePath, path.extname(filePath)) + "-thumb.jpg",
  );
  try {
    if (fs.existsSync(destino)) {
      const guardada = fs.readFileSync(destino);
      if (guardada.length > 200) return guardada;
    }
  } catch { /* sigue abajo */ }

  // Si no hay ffmpeg, se usa la carátula que viene con el bot (misma
  // ruta relativa al video: menu.mp4 → menu-thumb.jpg).
  const delRepo = path.join(
    path.dirname(filePath),
    path.basename(filePath, path.extname(filePath)) + "-thumb.jpg",
  );

  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    execFileSync(
      "ffmpeg",
      ["-y", "-ss", "1", "-i", filePath, "-vframes", "1", "-vf", "scale=320:-2", "-q:v", "6", destino],
      { stdio: "ignore", timeout: 20000 },
    );
    const mini = fs.readFileSync(destino);
    if (mini.length > 200) return mini;
  } catch { /* sin ffmpeg en el PATH */ }

  // Plan B: la carátula incluida en el repositorio.
  try {
    if (delRepo !== destino && fs.existsSync(delRepo)) {
      const mini = fs.readFileSync(delRepo);
      if (mini.length > 200) return mini;
    }
  } catch { /* nada */ }

  return null; // sin carátula la tarjeta funciona igual
}

async function videoCacheado(sock, filePath) {
  if (!filePath) return null;
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  const clave = `video:${path.basename(filePath)}:${huella(buf)}:v2`;
  if (MEMORIA.has(clave)) return MEMORIA.get(clave);

  const enDisco = leerCache()[clave]?.videoMessage;
  // La caché sirve si trae lo mínimo para pintar el video. `mediaKey` y
  // los hashes pueden ser Buffer O string base64: prepareWAMessageMedia
  // los devuelve como string y el proto los acepta igual. Lo que NUNCA
  // se acepta es un mediaKey vacío o un objeto {type:"Buffer",data:[]}
  // sin convertir (eso es lo que rompía la tarjeta al revivirla).
  if (enDisco && typeof enDisco.url === "string" && claveValida(enDisco.mediaKey)) {
    MEMORIA.set(clave, enDisco);
    return enDisco;
  }

  // Baileys NO calcula width/height sin librería de imagen, y nunca
  // calcula `seconds` para vídeo. Sin esos tres campos el teléfono no
  // pinta el reproductor: enseña la tarjeta como archivo descargable
  // («649 KB» con una flecha). Se leen del propio MP4.
  const datos = datosDelVideo(buf) || {};
  const miniatura = miniaturaDeVideo(filePath);
  const preparado = await prepareWAMessageMedia(
    {
      video: buf,
      gifPlayback: true,
      ...(datos.seconds ? { seconds: datos.seconds } : {}),
      ...(datos.width && datos.height ? { width: datos.width, height: datos.height } : {}),
      ...(miniatura ? { jpegThumbnail: miniatura } : {}),
    },
    { upload: sock.waUploadToServer },
  );
  const videoMessage = preparado?.videoMessage;
  if (!videoMessage) return null;

  MEMORIA.set(clave, videoMessage);
  escribirCache({ ...leerCache(), [clave]: { videoMessage, creado: new Date().toISOString() } });
  return videoMessage;
}

/**
 * Manda el menú como UNA tarjeta: video en bucle + lista desplegable.
 * Forma probada en producción: viewOnce + interactiveMessage con
 * single_select, más el cacheo del medio (data/media-cache.json).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op
 * @param {string} op.body
 * @param {string} [op.footer]
 * @param {string} [op.videoPath]  ruta local del video
 * @param {{title:string, sections:object[]}} op.selector
 * @param {object} [op.contextInfo] extras para el contextInfo
 * @param {object} [op.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendMenuCard(sock, jid, op = {}) {
  const { body = "", footer = "", videoPath = null, selector = null, contextInfo = {} } = op;
  if (!sock?.relayMessage || !selector) return null;

  const videoMessage = await videoCacheado(sock, videoPath);

  // contextInfo que el servidor acepta sin descartar la tarjeta:
  // forwardingScore 99 e isForwarded, más el canal si viene.
  // serverMessageId 1 (nunca 0: 0 es inválido y el mensaje no se pinta).
  const ctx = {
    mentionedJid: Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [],
    forwardingScore: 99,
    isForwarded: true,
    ...(contextInfo.forwardedNewsletterMessageInfo
      ? {
          forwardedNewsletterMessageInfo: {
            ...contextInfo.forwardedNewsletterMessageInfo,
            serverMessageId: contextInfo.forwardedNewsletterMessageInfo.serverMessageId || 1,
          },
        }
      : {}),
  };

  try {
    // Header SIN title/subtitle cuando están vacíos: un header con
    // cadenas vacías hace que el teléfono descarte la tarjeta aunque
    // el servidor la acuse. Sólo se incluye si hay algo que mostrar.
    const header = proto.Message.InteractiveMessage.Header.create({
      ...(op.title ? { title: String(op.title) } : {}),
      ...(op.subtitle ? { subtitle: String(op.subtitle) } : {}),
      hasMediaAttachment: !!videoMessage,
      ...(videoMessage ? { videoMessage } : {}),
    });

    // SIN viewOnceMessage: el envoltorio viewOnce es justo lo que
    // impide que los clientes actuales pinten la tarjeta. Va suelto.
    const msg = generateWAMessageFromContent(
      jid,
      {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          contextInfo: ctx,
          body: proto.Message.InteractiveMessage.Body.create({ text: body }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
          header,
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
              {
                name: "single_select",
                buttonParamsJson: JSON.stringify(selector),
              },
            ],
          }),
        }),
      },
      { quoted: op.quoted && op.quoted.message ? op.quoted : undefined },
    );

    // SIN additionalNodes: la librería arma el sobre. (Ese era el bug.)
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("menu-card: no se pudo enviar (" + (err.message || err) + ")");
    return null;
  }
}

/**
 * Deja el video del menú ya subido y cacheado, sin mandar nada.
 * Se llama en segundo plano al conectar: así el primer `.menu` del día
 * no paga la subida. Si falla, el menú sigue funcionando (tardará una vez).
 */
export async function calentarVideoMenu(sock) {
  try {
    const { getVideoPath } = await import("#lib/menu-shared");
    const ruta = getVideoPath();
    if (!ruta) return false;
    const video = await videoCacheado(sock, ruta);
    if (video) log.info("menu-card: video del menú listo en caché");
    return !!video;
  } catch (err) {
    log.warn("menu-card: no se pudo pre-subir el video (" + (err.message || err) + ")");
    return false;
  }
}

export default { sendMenuCard, calentarVideoMenu };
