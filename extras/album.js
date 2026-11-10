/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { generateWAMessage, generateWAMessageFromContent } from "baileys";

/** WhatsApp deja de agrupar bien pasadas las 10 piezas. */
export const MAX_ALBUM = 10;
export const MIN_ALBUM = 2;
/** MessageAssociation.AssociationType.MEDIA_ALBUM en el proto actual. */
export const TIPO_ALBUM = 1;

/**
 * Revisa y normaliza la lista antes de gastar un solo envío.
 * Cada elemento puede ser una URL, un Buffer, `{ image, caption }` o `{ video, caption }`.
 *
 * @returns {{ok:boolean, error?:string, medios:object[], imagenes:number, videos:number}}
 *   error: "vacio" | "pocos" | "muchos" | "tipo"
 */
export function planAlbum(items = []) {
  const lista = Array.isArray(items) ? items : [items];
  const vacio = { medios: [], imagenes: 0, videos: 0 };
  if (!lista.length) return { ok: false, error: "vacio", ...vacio };

  const medios = [];
  for (const item of lista) {
    if (!item) return { ok: false, error: "tipo", ...vacio };

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
      if (!fuente) return { ok: false, error: "tipo", ...vacio };
      const clave = item.image ? "image" : "video";
      const valor = typeof fuente === "string" ? { url: fuente } : fuente;
      const medio = { [clave]: valor };
      if (item.caption) medio.caption = String(item.caption);
      medios.push(medio);
      continue;
    }
    return { ok: false, error: "tipo", ...vacio };
  }

  if (medios.length < MIN_ALBUM) return { ok: false, error: "pocos", medios, imagenes: 0, videos: 0 };
  if (medios.length > MAX_ALBUM) return { ok: false, error: "muchos", medios, imagenes: 0, videos: 0 };

  return {
    ok: true,
    medios,
    imagenes: medios.filter((m) => m.image).length,
    videos: medios.filter((m) => m.video).length,
  };
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

/** Cuelga un mensaje de medio del álbum padre. */
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
 * Manda un álbum completo. Nunca lanza: devuelve `{ sent:false, error }` para
 * poder caer al envío suelto de toda la vida.
 */
export async function sendAlbum(sock, jid, items, { quoted, contextInfo } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const plan = planAlbum(items);
    if (!plan.ok) throw new Error(`lista inválida (${plan.error})`);

    const userJid = sock.user?.id || sock.user?.jid;
    const padre = generateWAMessageFromContent(jid, buildAlbumParent(plan, { contextInfo }), {
      userJid,
      quoted,
      timestamp: new Date(),
    });
    if (!padre?.key?.id) throw new Error("no se generó el álbum");

    await sock.relayMessage(jid, padre.message, { messageId: padre.key.id });

    let enviados = 0;
    for (const medio of plan.medios) {
      const hijo = await generateWAMessage(jid, medio, { userJid, upload: sock.waUploadToServer });
      if (!hijo?.key?.id) continue;
      asociarAlAlbum(hijo.message, padre.key);
      await sock.relayMessage(jid, hijo.message, { messageId: hijo.key.id });
      enviados++;
    }

    return { sent: enviados > 0, enviados, key: padre.key };
  } catch (error) {
    return { sent: false, error };
  }
}
