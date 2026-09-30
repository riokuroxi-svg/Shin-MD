/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  carousel.js — Tarjetas que se pasan con el dedo
//
//  Era el "FALTA" más grande de las maquetas: un carrusel de tarjetas
//  dentro de UN solo mensaje. Existe en el proto que ya tiene el bot:
//
//    interactiveMessage.carouselMessage { cards[], messageVersion }
//
//  y cada `card` es un interactiveMessage entero, con su cabecera
//  (imagen incluida), su cuerpo, su pie y sus botones propios. O sea:
//  cinco resultados de búsqueda, cada uno con su miniatura y su botón
//  de descargar, sin reventar el chat con cinco mensajes.
//
//  Reglas que aprendimos a golpes y aquí están aplicadas:
//   · el envoltorio binario es obligatorio (#lib/wa-nodes)
//   · máximo 10 tarjetas: de ahí para arriba WhatsApp corta
//   · la imagen de cada tarjeta hay que SUBIRLA antes (no vale una url
//     suelta), y si la subida falla la tarjeta se queda sin foto pero
//     no se pierde
//   · siempre un respaldo en texto, porque un iPhone viejo o un
//     WhatsApp Web verán el mensaje vacío
// ═══════════════════════════════════════════════════════════════════

import { nodosInteractivos } from "#lib/wa-nodes";

/** Más de esto y WhatsApp deja de dibujar las últimas. */
export const MAX_TARJETAS = 10;
/** Menos de esto no es un carrusel: es una tarjeta suelta. */
export const MIN_TARJETAS = 2;

/**
 * Una tarjeta del carrusel.
 *
 * @param {object} d
 * @param {string} d.titulo    va en grande arriba
 * @param {string} [d.cuerpo]  el texto de la tarjeta
 * @param {string} [d.pie]     letra pequeña
 * @param {object} [d.imagen]  imageMessage YA subido (ver prepararImagen)
 * @param {object[]} [d.botones]  { texto, id } | { texto, url } | { texto, copiar }
 * @returns {object} card listo para el carrusel
 */
export function buildTarjeta({ titulo, cuerpo = "", pie = "", imagen = null, botones = [] } = {}) {
  if (!titulo && !cuerpo) throw new Error("la tarjeta necesita al menos título o cuerpo");

  const header = { title: String(titulo || ""), hasMediaAttachment: !!imagen };
  if (imagen) header.imageMessage = imagen;

  const card = {
    header,
    body: { text: String(cuerpo || "") },
    nativeFlowMessage: { buttons: (Array.isArray(botones) ? botones : []).map(mapearBoton) },
  };
  if (pie) card.footer = { text: String(pie) };
  return card;
}

/** Traduce nuestro botón de andar por casa al que entiende WhatsApp. */
function mapearBoton(b = {}) {
  if (b.copiar) {
    return {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({
        display_text: String(b.texto || "Copiar"),
        id: String(b.id || "copiar"),
        copy_code: String(b.copiar),
      }),
    };
  }
  if (b.url) {
    return {
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: String(b.texto || "Abrir"),
        url: String(b.url),
        merchant_url: String(b.url),
      }),
    };
  }
  return {
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: String(b.texto || ""),
      id: String(b.id || ""),
    }),
  };
}

/**
 * El mensaje entero con su carrusel dentro.
 *
 * @param {object} d
 * @param {string} d.texto      lo que se lee encima del carrusel
 * @param {string} [d.pie]
 * @param {object[]} d.tarjetas  de buildTarjeta
 * @returns {object} contenido para generateWAMessageFromContent
 */
export function buildCarouselContent({ texto, pie = "", tarjetas = [] } = {}) {
  const cards = (Array.isArray(tarjetas) ? tarjetas : []).slice(0, MAX_TARJETAS);
  if (cards.length < MIN_TARJETAS) throw new Error(`un carrusel necesita ${MIN_TARJETAS} tarjetas o más`);

  const interactivo = {
    body: { text: String(texto || "") },
    carouselMessage: { cards, messageVersion: 1 },
  };
  if (pie) interactivo.footer = { text: String(pie) };

  return {
    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
    interactiveMessage: interactivo,
  };
}

/**
 * Sube una imagen para usarla de cabecera. NUNCA lanza: si la subida
 * falla (sin red, url muerta, socket de mentira), devuelve null y la
 * tarjeta sale sin foto en vez de tumbar el comando entero.
 *
 * @param {object} sock
 * @param {{url?:string}|Buffer} fuente
 * @returns {Promise<object|null>} imageMessage o null
 */
export async function prepararImagen(sock, fuente) {
  try {
    if (!fuente || !sock?.waUploadToServer) return null;
    const { prepareWAMessageMedia } = await import("baileys");
    const media = await prepareWAMessageMedia(
      { image: Buffer.isBuffer(fuente) ? fuente : { url: String(fuente) } },
      { upload: sock.waUploadToServer },
    );
    return media?.imageMessage || null;
  } catch {
    return null;
  }
}

/**
 * Manda el carrusel. Nunca lanza.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} d
 * @param {string} d.texto
 * @param {string} [d.pie]
 * @param {object[]} d.tarjetas
 * @param {object} [d.quoted]
 * @param {string} [d.respaldo] texto que se manda si el carrusel falla
 * @returns {Promise<{sent:boolean, key?:object, error?:any, respaldo?:boolean}>}
 */
export async function sendCarousel(sock, jid, { texto, pie = "", tarjetas = [], quoted, respaldo = "" } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, buildCarouselContent({ texto, pie, tarjetas }), {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó el carrusel");

    await sock.relayMessage(jid, generado.message, {
      messageId: generado.key.id,
      additionalNodes: nodosInteractivos(jid),
    });
    return { sent: true, key: generado.key };
  } catch (error) {
    if (respaldo && sock?.sendMessage) {
      try {
        await sock.sendMessage(jid, { text: respaldo }, { quoted });
        return { sent: true, respaldo: true, error };
      } catch { /* ni eso: que lo vea el llamador */ }
    }
    return { sent: false, error };
  }
}

export default {
  MAX_TARJETAS, MIN_TARJETAS,
  buildTarjeta, buildCarouselContent, prepararImagen, sendCarousel,
};
