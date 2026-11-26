/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  album.js — varias fotos en UNA sola burbuja
//
//  CÓMO FUNCIONA DE VERDAD (leído en el proto y en la librería)
//  ─────────────────────────────────────────────────────────────
//  WhatsApp no tiene «un mensaje con N fotos»: tiene un envoltorio
//  `albumMessage` que DICE cuántas fotos vienen
//
//      albumMessage { expectedImageCount, expectedVideoCount }
//
//  y luego cada foto se manda por separado, en el mismo orden, y el
//  teléfono las agrupa. Por eso un álbum son N subidas + 1 envoltorio.
//
//  El stock de Baileys ya arma el envoltorio cuando recibe
//  `{ album: { expectedImageCount, expectedVideoCount } }`
//  (`Utils/messages.js`), así que aquí solo se ordena el envío.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import { proto, generateWAMessageFromContent } from "baileys";
import log from "#logger";

/**
 * Manda un álbum. Cada elemento es { imagen | video, pie }.
 *
 * Devuelve cuántas piezas salieron. Si algo falla a mitad, se avisa y se
 * devuelve lo que sí salió: un álbum incompleto es mejor que nada.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {Array<{imagen?:any, video?:any, pie?:string}>} piezas
 * @param {{cita?:object}} [op]
 */
export async function enviarAlbum(sock, jid, piezas = [], { cita = null } = {}) {
  const lista = (piezas || []).filter((p) => p && (p.imagen || p.video));
  if (!lista.length) return 0;

  // Los canales no tienen álbum: se mandan una por una.
  if (typeof jid === "string" && jid.endsWith("@newsletter")) {
    let n = 0;
    for (const p of lista) {
      try {
        await sock.sendMessage(
          jid,
          p.video ? { video: p.video, caption: p.pie } : { image: p.imagen, caption: p.pie },
        );
        n++;
      } catch {}
    }
    return n;
  }

  const imagenes = lista.filter((p) => p.imagen).length;
  const videos = lista.filter((p) => p.video).length;

  try {
    // 1. El envoltorio: «van a llegar N imágenes y M vídeos».
    await sock.sendMessage(jid, { album: { expectedImageCount: imagenes, expectedVideoCount: videos } });

    // 2. Las piezas, en orden.
    let enviadas = 0;
    for (const p of lista) {
      try {
        await sock.sendMessage(
          jid,
          p.video
            ? { video: p.video, caption: p.pie, gifPlayback: false }
            : { image: p.imagen, caption: p.pie },
        );
        enviadas++;
      } catch (err) {
        log.warn("album: una pieza no salió (" + (err.message || err) + ")");
      }
    }
    return enviadas;
  } catch (err) {
    log.warn("album: no se pudo abrir el álbum (" + (err.message || err) + ")");
    // Respaldo: una por una, sin agrupar.
    let n = 0;
    for (const p of lista) {
      try {
        await sock.sendMessage(
          jid,
          p.video ? { video: p.video, caption: p.pie } : { image: p.imagen, caption: p.pie },
        );
        n++;
      } catch {}
    }
    return n;
  }
}

/** Versión sin red: arma el envoltorio y lo pasa por el protobuf. */
export function armarAlbum(imagenes = 1, videos = 0, jid = "5210000000000@s.whatsapp.net") {
  const armado = generateWAMessageFromContent(jid, {
    albumMessage: { expectedImageCount: imagenes, expectedVideoCount: videos },
  }, {});
  const bytes = proto.Message.encode(armado.message).finish();
  return { bytes, decodificado: proto.Message.decode(bytes) };
}

export default { enviarAlbum, armarAlbum };
