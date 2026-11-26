/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-card.js — El menú: una foto, el texto y los botones nativos.
//
//  POR QUÉ SE USA LA API DE ALTO NIVEL DE LA LIBRERÍA
//  ────────────────────────────────────────────────
//  `generateWAMessageContent` con `image` + `caption` + `nativeFlow`
//  arma el mensaje entero y coloca cada cosa en su sitio:
//
//    - `image` + `caption`        → cabecera con foto y cuerpo de texto
//    - `offerText`/`offerCode`    → la tarjeta de oferta con el código
//    - `optionTitle`/`optionText` → la hoja inferior desplegable
//    - `nativeFlow: [...]`        → los botones (`sections` = selector,
//                                   `id` = respuesta rápida)
//
//  Armar el proto a mano era la fuente del bug de "la foto no llega":
//  los campos de la imagen (`url`, `mediaKey`, `fileLength`...) se le
//  pasaban sueltos al `Header`, que los acepta al crear pero los TIRA
//  al serializar. El mensaje decía `hasMediaAttachment: true` y no
//  llevaba media. Aquí eso no puede pasar: la media va anidada.
//
//  LA SUBIDA SE PAGA UNA VEZ
//  ─────────────────────────
//  La media se pasa como `{ url: <ruta local> }`. La librería la lee de
//  disco y, si el socket trae `mediaCache` (ver src/core/socket.js),
//  reaprovecha la subida en los envíos siguientes. Con un Buffer no
//  habría caché: su índice es la `url` del medio, y un Buffer no tiene.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { prepareWAMessageMedia, generateWAMessageFromContent } from "baileys";
import { datosDelVideo } from "#lib/mp4-info";
import log from "#logger";


/**
 * Miniatura JPEG del primer fotograma del vídeo.
 *
 * WhatsApp la usa como carátula mientras descarga. Sin ella el cliente
 * no tiene qué pintar y, si además faltan las medidas, termina
 * enseñando la tarjeta como un archivo. Se genera con ffmpeg si está
 * instalado; si no, se devuelve null y la tarjeta sale igual (sin
 * carátula).
 *
 * @param {string} rutaVideo
 * @returns {Buffer|null}
 */
function miniaturaDeVideo(rutaVideo) {
  // ffmpeg puede no estar en el PATH (Termux lo trae, otros entornos
  // no): se prueban el del PATH y las rutas habituales, y si no hay
  // ninguno se devuelve null (la tarjeta sale sin carátula).
  const candidatos = [
    process.env.FFMPEG_PATH,
    "ffmpeg",
    "/usr/bin/ffmpeg",
    "/data/data/com.termux/files/usr/bin/ffmpeg",
  ].filter(Boolean);
  const bin = candidatos.find((b) => {
    try {
      if (b === "ffmpeg") { execFileSync(b, ["-version"], { timeout: 3000, stdio: "ignore" }); return true; }
      return fs.existsSync(b);
    } catch { return false; }
  });
  if (!bin) return null;
  try {
    return execFileSync(
      bin,
      ["-v", "error", "-i", rutaVideo, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
      { maxBuffer: 2 * 1024 * 1024, timeout: 4000 },
    );
  } catch {
    return null;
  }
}

/**
 * Manda el menú como UNA tarjeta: foto arriba, texto, y los botones
 * nativos abajo.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op
 * @param {string} op.body
 * @param {string} [op.footer]
 * @param {string} [op.videoPath]  ruta local del video (opcional, en bucle)
 * @param {string} [op.imagePath]  ruta local de la imagen (por defecto)
 * @param {{title:string, sections:object[]}} op.selector
 * @param {string} [op.optionTitle] Título de la hoja inferior
 * @param {string} [op.optionText]  Texto del botón que abre la hoja
 * @param {string} [op.offerText]   Título de la tarjeta de oferta
 * @param {string} [op.offerCode]   Código que se copia de la oferta
 * @param {object} [op.contextInfo] extras para el contextInfo
 * @param {object} [op.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendMenuCard(sock, jid, op = {}) {
  const {
    body = "", footer = "", videoPath = null, imagePath = null,
    selector = null, contextInfo = {},
    optionTitle = null, optionText = null,
    offerText = null, offerCode = null,
  } = op;
  if (!sock?.relayMessage || !selector) return null;

  const rutaMedia = imagePath || videoPath;
  const esVideo = !imagePath && !!videoPath;
  if (rutaMedia && !fs.existsSync(rutaMedia)) {
    log.warn("menu-card: no se encontró la media del menú (" + rutaMedia + ")");
  }

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

  // Todos los botones tienen que ser DEL MISMO TIPO: mezclar un
  // `single_select` con `quick_reply`s hace que el cliente no sepa qué
  // dibujar y pinte la tarjeta como no soportada (lo avisa la propia
  // librería). Por eso aquí sólo va el selector.
  const nativeFlow = [
    { text: selector.title || "📂 Explorar Categorías", sections: selector.sections },
  ];

  try {
    // ── La media, preparada a mano SOLO para ponerle los datos que el
    // teléfono necesita para pintarla como reproductor ──
    let mediaMessage = null;
    if (rutaMedia && fs.existsSync(rutaMedia)) {
      try {
        const buf = fs.readFileSync(rutaMedia);
        if (esVideo) {
          // Sin `seconds`, `width` y `height` el cliente pinta la tarjeta
          // como archivo descargable en vez de vídeo. La librería no los
          // calcula sola: se leen del propio MP4.
          const datos = datosDelVideo(buf) || {};
          mediaMessage = (
            await prepareWAMessageMedia(
              {
                video: buf,
                gifPlayback: true,
                ...(datos.seconds ? { seconds: datos.seconds } : {}),
                ...(datos.width && datos.height
                  ? { width: datos.width, height: datos.height }
                  : {}),
                ...(miniaturaDeVideo(rutaMedia) ? { jpegThumbnail: miniaturaDeVideo(rutaMedia) } : {}),
              },
              { upload: sock.waUploadToServer, mediaCache: sock.mediaCache, logger: log },
            )
          )?.videoMessage;
        } else {
          mediaMessage = (
            await prepareWAMessageMedia(
              { image: buf },
              { upload: sock.waUploadToServer, mediaCache: sock.mediaCache, logger: log },
            )
          )?.imageMessage;
        }
      } catch (err) {
        log.warn("menu-card: no se pudo preparar la media (" + (err.message || err) + ")");
        mediaMessage = null;
      }
    }

    // El header lleva la media ANIDADA en su casilla. Pasarla suelta
    // (url/mediaKey/... directamente en el header) hace que el proto la
    // tire al serializar y la tarjeta salga sin foto ni vídeo.
    const header = {
      hasMediaAttachment: !!mediaMessage,
      ...(mediaMessage
        ? esVideo
          ? { videoMessage: mediaMessage }
          : { imageMessage: mediaMessage }
        : {}),
    };

    // El `<biz>` lo pone la librería. Aquí sólo se arma el interactivo.
    const msg = generateWAMessageFromContent(
      jid,
      {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: {
          ...(op.title ? { header: { ...header, title: String(op.title) } } : { header }),
          body: { text: body },
          footer: { text: footer },
          contextInfo: ctx,
          nativeFlowMessage: {
            // Todos los botones DEL MISMO TIPO: mezclar clases hace que
            // el cliente no sepa qué dibujar y no pinte la tarjeta.
            buttons: nativeFlow.map((b) => ({
              name: "single_select",
              buttonParamsJson: JSON.stringify({ title: b.text, sections: b.sections }),
            })),
            ...(optionText
              ? {
                  messageParamsJson: JSON.stringify({
                    bottom_sheet: {
                      in_thread_buttons_limit: 1,
                      divider_indices: nativeFlow.map((_, i) => i),
                      list_title: optionTitle || "Menú",
                      button_title: optionText,
                    },
                    ...(offerText
                      ? {
                          limited_time_offer: {
                            text: offerText,
                            copy_code: offerCode || undefined,
                          },
                        }
                      : {}),
                  }),
                }
              : {}),
          },
        },
      },
      { quoted: op.quoted && op.quoted.message ? op.quoted : undefined },
    );

    // SIN additionalNodes: la librería arma el sobre `<biz>` sola, y si
    // se le pasa uno no añade otro (no puede haber doble biz: el
    // servidor lo rechazaría en silencio).
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  } catch (err) {
    log.warn("menu-card: no se pudo enviar (" + (err.message || err) + ")");
    return null;
  }
}

/**
 * Deja la media del menú ya subida, sin mandar nada.
 * Se llama en segundo plano al conectar: así el primer `.menu` del día
 * no paga la subida. Si falla, el menú sigue funcionando (tardará una).
 *
 * @param {object} sock
 * @returns {Promise<boolean>}
 */
export async function calentarMediaMenu(sock) {
  try {
    const { getVideoPath, getMenuImagePath } = await import("#lib/menu-shared");
    const ruta = getMenuImagePath() || getVideoPath();
    if (!ruta || !fs.existsSync(ruta)) return false;
    if (!sock?.waUploadToServer) return false;
    // Se pide el contenido sin enviarlo: la librería sube y cachea.
    await generateWAMessageContent(
      {
        caption: " ",
        nativeFlow: [{ text: "x", sections: [] }],
        image: { url: ruta },
      },
      { upload: sock.waUploadToServer, mediaCache: sock.mediaCache, logger: log },
    );
    log.info("menu-card: media del menú lista en caché");
    return true;
  } catch (err) {
    log.warn("menu-card: no se pudo pre-subir la media (" + (err.message || err) + ")");
    return false;
  }
}

export default { sendMenuCard, calentarMediaMenu };
