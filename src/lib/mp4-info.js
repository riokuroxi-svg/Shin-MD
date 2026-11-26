/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 *
 * Lee la duración y el tamaño de un MP4 directamente del contenedor.
 *
 * ¿Por qué hace falta? Baileys calcula `width`/`height` sólo si hay
 * una librería de imagen (sharp/jimp) instalada, y NUNCA calcula
 * `seconds` para vídeo. Sin esos tres campos el cliente de WhatsApp
 * no puede pintar el reproductor y muestra la tarjeta como un archivo
 * para descargar («649 KB» con la flecha) en vez de reproducirla.
 *
 * Se recorre la caja `moov` del MP4 a mano: son unas decenas de bytes
 * y no necesita ffmpeg ni binarios nativos, así que funciona igual en
 * Termux que en un servidor.
 */

import fs from "node:fs";

const CAJAS_CONTENEDOR = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

/**
 * Recorre cajas MP4 dentro de un rango y llama a `visitar` con cada una.
 * @param {Buffer} buf
 * @param {number} desde
 * @param {number} hasta
 * @param {(tipo:string, inicio:number, fin:number) => void} visitar
 */
function recorrerCajas(buf, desde, hasta, visitar) {
  let p = desde;
  while (p + 8 <= hasta) {
    let tam = buf.readUInt32BE(p);
    const tipo = buf.toString("latin1", p + 4, p + 8);
    let cabecera = 8;
    if (tam === 1) {
      // tamaño de 64 bits
      if (p + 16 > hasta) break;
      tam = Number(buf.readBigUInt64BE(p + 8));
      cabecera = 16;
    } else if (tam === 0) {
      tam = hasta - p; // hasta el final
    }
    if (tam < cabecera || p + tam > hasta) break;
    visitar(tipo, p + cabecera, p + tam);
    p += tam;
  }
}

/**
 * @param {string|Buffer} entrada ruta del archivo o su contenido
 * @returns {{seconds:number, width:number, height:number}|null}
 */
export function datosDelVideo(entrada) {
  let buf = entrada;
  try {
    if (typeof entrada === "string") {
      // Sólo hace falta la cabecera para el moov en la mayoría de MP4;
      // pero si el moov va al final (habitual), hay que leerlo entero.
      // 3-4 MB es asumible y evita dos lecturas.
      buf = fs.readFileSync(entrada);
    }
  } catch {
    return null;
  }
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;

  const res = { seconds: 0, width: 0, height: 0 };

  const buscar = (desde, hasta, profundidad = 0) => {
    if (profundidad > 6) return;
    recorrerCajas(buf, desde, hasta, (tipo, ini, fin) => {
      if (CAJAS_CONTENEDOR.has(tipo)) {
        buscar(ini, fin, profundidad + 1);
        return;
      }
      if (tipo === "mvhd") {
        // version 0: creation(4) mod(4) timescale(4) duration(4)
        // version 1: creation(8) mod(8) timescale(4) duration(8)
        const v = buf[ini];
        try {
          if (v === 1) {
            const escala = buf.readUInt32BE(ini + 20);
            const dur = Number(buf.readBigUInt64BE(ini + 24));
            if (escala > 0 && dur > 0) res.seconds = dur / escala;
          } else {
            const escala = buf.readUInt32BE(ini + 12);
            const dur = buf.readUInt32BE(ini + 16);
            if (escala > 0 && dur > 0) res.seconds = dur / escala;
          }
        } catch { /* caja cortada: se ignora */ }
        return;
      }
      if (tipo === "tkhd") {
        // width/height son los dos últimos UInt32 (16.16 fixed point).
        // Los desplazamientos se cuentan desde el primer byte de datos
        // de la caja (justo tras ver+flags):
        //   v0: 4+4+4+4+4+8+2+2+2+2+36 = 76  → W en 76, H en 80
        //   v1: los tiempos son de 8 bytes → W en 88, H en 92
        try {
          const v = buf[ini];
          const off = v === 1 ? 88 : 76;
          if (ini + off + 8 <= fin) {
            const w = buf.readUInt32BE(ini + off) >>> 16;
            const h = buf.readUInt32BE(ini + off + 4) >>> 16;
            // el track de audio trae 0×0: sólo interesa el de vídeo
            if (w > 0 && h > 0) {
              res.width = w;
              res.height = h;
            }
          }
        } catch { /* caja cortada */ }
        return;
      }
    });
  };

  try {
    buscar(0, buf.length);
  } catch {
    return null;
  }

  if (!res.seconds && !res.width) return null;
  return {
    seconds: Math.max(1, Math.round(res.seconds)),
    width: res.width,
    height: res.height,
  };
}

export default datosDelVideo;
