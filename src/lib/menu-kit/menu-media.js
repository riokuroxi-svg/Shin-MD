/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-media.js — El vídeo, el audio y la tarjeta de oferta del menú
//
//  POR QUÉ EXISTE
//  ──────────────
//  En v3.7.18+ la miniatura del vídeo se generaba con `execFileSync`
//  DOS VECES por cada `.menu`: primero `ffmpeg -version` para ver si
//  existía (3 s de tope) y luego la extracción del fotograma (4 s).
//  Eso bloquecaba el bucle de eventos del bot y el comando tardaba
//  11–14 s. Coincide con las capturas del teléfono.
//
//  Aquí no se llama a ningún proceso externo:
//   · la miniatura es un ASSET fijo (assets/video/menu-thumb.jpg)
//   · las medidas (segundos, ancho, alto) se leen del propio MP4
//   · el audio ya viene codificado en ogg/opus mono
//
//  Todo se resuelve con `fs.readFileSync` + lectura de bytes.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../../..");

const DIR_VIDEO = path.join(RAIZ, "assets/video");
const DIR_AUDIO = path.join(RAIZ, "assets/audio");
const DIR_MARCA = path.join(RAIZ, "assets/brand");

/**
 * Lee las cajas del MP4 y devuelve duración y medidas.
 * Sin ffmpeg, sin procesos, sin bloqueo: solo `Buffer` y `readUInt32BE`.
 *
 * Sin `seconds`, `width` y `height` el teléfono pinta la tarjeta como
 * ARCHIVO descargable («↓ 649 KB» en las capturas) en vez de vídeo.
 *
 * @param {Buffer} buf
 * @returns {{seconds:number,width:number,height:number}|null}
 */
export function datosDelVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return null;

  const caja = (pos) => {
    if (pos + 8 > buf.length) return null;
    const tamano = buf.readUInt32BE(pos);
    const tipo = buf.toString("latin1", pos + 4, pos + 8);
    return { tamano, tipo, cabecera: 8 };
  };

  // `moov` puede ir al principio (faststart) o al final del archivo.
  let moov = null;
  for (let p = 0; p + 8 <= buf.length; ) {
    const c = caja(p);
    if (!c || c.tamano < 8) break;
    if (c.tipo === "moov") {
      moov = { inicio: p + c.cabecera, fin: p + c.tamano };
      break;
    }
    p += c.tamano;
  }
  if (!moov) return null;

  let seconds = 0;
  let width = 0;
  let height = 0;

  for (let p = moov.inicio; p + 8 <= moov.fin; ) {
    const c = caja(p);
    if (!c || c.tamano < 8) break;

    if (c.tipo === "mvhd") {
      const version = buf.readUInt8(p + 8);
      if (version === 0) {
        const escala = buf.readUInt32BE(p + 20);
        const duracion = buf.readUInt32BE(p + 24);
        if (escala) seconds = Math.round(duracion / escala);
      } else {
        const escala = buf.readUInt32BE(p + 28);
        const duracion = Number(buf.readBigUInt64BE(p + 32));
        if (escala) seconds = Math.round(duracion / escala);
      }
    }

    if (c.tipo === "trak") {
      for (let q = p + c.cabecera; q + 8 <= p + c.tamano; ) {
        const t = caja(q);
        if (!t || t.tamano < 8) break;
        if (t.tipo === "tkhd") {
          const fin = q + t.tamano;
          const w = buf.readUInt32BE(fin - 8) / 65536;
          const h = buf.readUInt32BE(fin - 4) / 65536;
          if (w > 0 && h > 0) {
            width = Math.round(w);
            height = Math.round(h);
          }
        }
        q += t.tamano;
      }
    }

    p += c.tamano;
  }

  if (!seconds && !width) return null;
  return { seconds, width, height };
}

/** ¿Existe la ruta y es un archivo normal? */
function esArchivo(p) {
  try {
    return typeof p === "string" && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * El vídeo del menú, ya listo para `prepareWAMessageMedia`.
 *
 * `MENU_VIDEO_PATH` manda si está definido. Si no, se usa el primero de
 * la lista que exista. Si no hay ninguno, devuelve null y el menú sigue
 * con imagen o solo texto: nunca se rompe por falta de un asset.
 *
 * @returns {{buffer:Buffer, path:string, datos:object}|null}
 */
export function videoDelMenu() {
  const candidatos = [
    process.env.MENU_VIDEO_PATH,
    // Panorámicos primero: el vídeo 1:1 se recorta en el chat y se ve
    // como un cuadrado. Si no están los wide, cae a los cuadrados viejos
    // (y entonces se avisa en el log: assets viejos no rompen el menú).
    path.join(DIR_VIDEO, "menu-1-wide.mp4"),
    path.join(DIR_VIDEO, "menu-2-wide.mp4"),
    path.join(DIR_VIDEO, "menu-1.mp4"),
    path.join(DIR_VIDEO, "menu-2.mp4"),
  ].filter(Boolean);

  for (const p of candidatos) {
    if (!esArchivo(p)) continue;
    try {
      const buffer = fs.readFileSync(p);
      const datos = datosDelVideo(buffer) || {};
      return { buffer, path: p, datos };
    } catch {
      /* se prueba el siguiente */
    }
  }
  return null;
}

/**
 * La miniatura del primer fotograma, como asset fijo.
 *
 * Se genera UNA vez al preparar el repo (no en cada comando). Si falta,
 * devuelve null y la tarjeta sale igual, solo que sin carátula mientras
 * descarga.
 */
export function miniaturaDelMenu() {
  const p = process.env.MENU_THUMB_PATH || path.join(DIR_VIDEO, "menu-thumb.jpg");
  if (!esArchivo(p)) return null;
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

/**
 * El audio del menú en ogg/opus mono, listo para nota de voz (`ptt`).
 *
 * Ya viene codificado: en tiempo de ejecución no hay ninguna conversión
 * ni proceso externo. WhatsApp acepta `audio/ogg; codecs=opus`.
 */
export function audioDelMenu() {
  const candidatos = [
    process.env.MENU_AUDIO_PATH,
    path.join(DIR_AUDIO, "menu-audio.ogg"),
  ].filter(Boolean);

  for (const p of candidatos) {
    if (!esArchivo(p)) continue;
    try {
      return { buffer: fs.readFileSync(p), path: p };
    } catch {
      /* se prueba el siguiente */
    }
  }
  return null;
}

/** La tarjeta de oferta («Dashboard · Kode: ANYA-MD»). */
export function tarjetaOferta() {
  return {
    texto: process.env.MENU_OFFER_TEXT || "Dashboard",
    codigo: process.env.MENU_OFFER_CODE || "SHIN-MD",
    imagen: esArchivo(path.join(DIR_MARCA, "offer-dashboard.jpg"))
      ? path.join(DIR_MARCA, "offer-dashboard.jpg")
      : null,
  };
}

/**
 * La portada del menú según el tema elegido.
 *   MENU_TEMA=neon | pastel | noche  (por defecto: pastel de día,
 *   noche de noche). Si el archivo no está, devuelve null y el menú
 *   sigue con el vídeo o con texto: nunca se rompe por un asset.
 *
 * @param {Date} [fecha]
 * @returns {{buffer:Buffer, path:string}|null}
 */
export function portadaDelMenu(fecha = new Date()) {
  const pedido = String(process.env.MENU_TEMA || "").trim().toLowerCase();
  const porHora = fecha.getHours() >= 6 && fecha.getHours() < 19 ? "pastel" : "noche";
  const tema = pedido || porHora;
  const archivo =
    tema === "neon" ? "menu-neon.png"
    : tema === "noche" || tema === "noche-ciudad" ? "menu-noche-ciudad.png"
    : "menu-pastel.png";
  const p = path.join(DIR_MARCA, archivo);
  if (!esArchivo(p)) return null;
  try {
    return { buffer: fs.readFileSync(p), path: p, tema };
  } catch {
    return null;
  }
}

/** Las imágenes de marca disponibles (para cabeceras de categorías). */
export function arteDeCategoria() {
  try {
    return fs
      .readdirSync(DIR_MARCA)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => path.join(DIR_MARCA, f));
  } catch {
    return [];
  }
}

export default {
  datosDelVideo,
  videoDelMenu,
  miniaturaDelMenu,
  audioDelMenu,
  tarjetaOferta,
  arteDeCategoria,
  portadaDelMenu,
};
