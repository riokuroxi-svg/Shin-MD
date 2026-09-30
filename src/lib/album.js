/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  album.js — Álbumes nativos (varias fotos en UNA sola tarjeta)
//
//  QUÉ SE DESCUBRIÓ
//  ----------------
//  Cuando mandas 4 fotos desde el teléfono, WhatsApp no manda 4
//  mensajes sueltos: manda un mensaje "álbum" vacío que solo dice
//  cuántas fotos vienen, y luego cada foto apuntando a él. El cliente
//  las junta en una cuadrícula.
//
//  La pieza que lo une existe en baileys 6.7.24 y nadie la usa:
//
//    proto.Message.albumMessage        → { expectedImageCount,
//                                          expectedVideoCount }
//    proto.MessageAssociation          → { associationType,
//                                          parentMessageKey }
//    AssociationType.MEDIA_ALBUM = 1
//
//  Cada hijo lleva messageContextInfo.messageAssociation con la clave
//  del álbum padre. Sin fork, sin sendAlbum: se arma y se relayea.
//
//  Se paga en envíos (1 padre + N fotos), así que la cola anti-ban de
//  src/core/socket.js sigue mandando: por eso el tope es 10 y el
//  comando que lo use debe medirse.
// ═══════════════════════════════════════════════════════════════════

/** WhatsApp deja de agrupar bien pasadas las 10 piezas. */
export const MAX_ALBUM = 10;
export const MIN_ALBUM = 2;

/** MessageAssociation.AssociationType.MEDIA_ALBUM en el proto 6.7.24. */
export const TIPO_ALBUM = 1;
/** ...EVENT_COVER_IMAGE, para la portada de los eventos. */
export const TIPO_PORTADA_EVENTO = 3;

/**
 * Revisa y normaliza la lista antes de gastar un solo envío.
 *
 * Cada elemento puede ser:
 *   "https://..."                         → foto por URL
 *   Buffer                                → foto
 *   { image: url|Buffer, caption? }
 *   { video: url|Buffer, caption? }
 *
 * @returns {{ok: boolean, error?: string, medios: object[], imagenes: number, videos: number}}
 *   error: "vacio" | "pocos" | "muchos" | "tipo"
 */
export function planAlbum(items = []) {
  const lista = Array.isArray(items) ? items : [items];
  if (!lista.length) return { ok: false, error: "vacio", medios: [], imagenes: 0, videos: 0 };

  const medios = [];
  for (const item of lista) {
    if (!item) return { ok: false, error: "tipo", medios: [], imagenes: 0, videos: 0 };

    if (typeof item === "string") {
      medios.push({ image: { url: item } });
      continue;
    }
    if (Buffer.isBuffer(item)) {
      medios.push({ image: item });
      continue;
    }
    if (typeof item === "object") {
      const fuente = item.image ?? item.video;
      if (!fuente) return { ok: false, error: "tipo", medios: [], imagenes: 0, videos: 0 };
      const clave = item.image ? "image" : "video";
      const valor = typeof fuente === "string" ? { url: fuente } : fuente;
      const medio = { [clave]: valor };
      if (item.caption) medio.caption = String(item.caption);
      medios.push(medio);
      continue;
    }
    return { ok: false, error: "tipo", medios: [], imagenes: 0, videos: 0 };
  }

  if (medios.length < MIN_ALBUM) return { ok: false, error: "pocos", medios, imagenes: 0, videos: 0 };
  if (medios.length > MAX_ALBUM) return { ok: false, error: "muchos", medios, imagenes: 0, videos: 0 };

  const imagenes = medios.filter((m) => m.image).length;
  const videos = medios.filter((m) => m.video).length;
  return { ok: true, medios, imagenes, videos };
}

/** Contenido del mensaje padre (el que agrupa). */
export function buildAlbumParent(plan, { contextInfo } = {}) {
  const albumMessage = {
    expectedImageCount: plan.imagenes,
    expectedVideoCount: plan.videos,
  };
  if (contextInfo) albumMessage.contextInfo = contextInfo;
  return { albumMessage };
}

/**
 * Cuelga un mensaje de medio del álbum padre.
 * Muta y devuelve el mismo objeto (así lo hace baileys internamente).
 */
export function asociarAlAlbum(message, parentMessageKey, tipo = TIPO_ALBUM) {
  if (!message) throw new Error("falta el mensaje hijo");
  if (!parentMessageKey?.id) throw new Error("falta la clave del mensaje padre");

  message.messageContextInfo = {
    ...(message.messageContextInfo || {}),
    messageAssociation: { associationType: tipo, parentMessageKey },
  };
  return message;
}

/**
 * Manda un álbum completo.
 * Nunca lanza: devuelve {sent:false, error} para poder caer al
 * envío suelto de toda la vida.
 *
 * @returns {Promise<{sent: boolean, enviados?: number, key?: object, error?: any}>}
 */
export async function sendAlbum(sock, jid, items, { quoted, contextInfo } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const plan = planAlbum(items);
    if (!plan.ok) throw new Error(`lista inválida (${plan.error})`);

    const { generateWAMessage, generateWAMessageFromContent } = await import("baileys");
    const userJid = sock.user?.id;

    const padre = generateWAMessageFromContent(jid, buildAlbumParent(plan, { contextInfo }), {
      userJid,
      quoted,
      timestamp: new Date(),
    });
    if (!padre?.key?.id) throw new Error("no se generó el álbum");

    await sock.relayMessage(jid, padre.message, { messageId: padre.key.id });

    let enviados = 0;
    for (const medio of plan.medios) {
      const hijo = await generateWAMessage(jid, medio, {
        userJid,
        upload: sock.waUploadToServer,
      });
      if (!hijo?.key?.id) continue;

      asociarAlAlbum(hijo.message, padre.key);
      // La cola de src/core/socket.js ya espacia los envíos: no se
      // añade delay propio para no sumar retrasos encima.
      await sock.relayMessage(jid, hijo.message, { messageId: hijo.key.id });
      enviados++;
    }

    return { sent: enviados > 0, enviados, key: padre.key };
  } catch (error) {
    return { sent: false, error };
  }
}

/**
 * Portada para una tarjeta de evento: la misma mecánica del álbum,
 * pero con associationType = EVENT_COVER_IMAGE. El evento ya tiene
 * que estar enviado (necesitamos su clave).
 *
 * @returns {Promise<{sent: boolean, error?: any}>}
 */
export async function sendEventCover(sock, jid, imagen, eventKey) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");
    if (!eventKey?.id) throw new Error("falta la clave del evento");
    if (!imagen) throw new Error("falta la imagen");

    const { generateWAMessage } = await import("baileys");
    const medio = typeof imagen === "string" ? { image: { url: imagen } } : { image: imagen };

    const hijo = await generateWAMessage(jid, medio, {
      userJid: sock.user?.id,
      upload: sock.waUploadToServer,
    });
    if (!hijo?.key?.id) throw new Error("no se preparó la portada");

    asociarAlAlbum(hijo.message, eventKey, TIPO_PORTADA_EVENTO);
    await sock.relayMessage(jid, hijo.message, { messageId: hijo.key.id });
    return { sent: true };
  } catch (error) {
    return { sent: false, error };
  }
}
