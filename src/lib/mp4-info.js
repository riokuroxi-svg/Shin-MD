/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  mp4-info.js — Duración y medidas de un MP4, sin dependencias.
//
//  POR QUÉ EXISTE
//  Al mandar un vídeo dentro de una tarjeta, el teléfono necesita
//  `seconds` y `width`/`height` para pintar el REPRODUCTOR. Si faltan,
//  muestra la tarjeta como un archivo («649 KB» con una flecha): eso es
//  lo que se veía como "el vídeo no se envía". La librería no calcula
//  esos datos sin una librería de imagen, así que se leen del propio
//  archivo: el átomo `moov` del MP4 los tiene.
// ═══════════════════════════════════════════════════════════════════

/**
 * Lee la duración (segundos) y el tamaño del primer `trak` de un MP4.
 *
 * Recorre las cajas de primer nivel hasta `moov`, y dentro busca:
 *   - `mvhd` → duración en unidades de su `timescale` (×1000 ms en la v0)
 *   - `trak > tkhd` → ancho y alto en 16.16 fijo
 *
 * @param {Buffer} buf
 * @returns {{seconds?: number, width?: number, height?: number}|null}
 */
export function datosDelVideo(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 32) return null;

    const leerCaja = (pos, limite) => {
      if (pos + 8 > limite) return null;
      const tamano = buf.readUInt32BE(pos);
      return { tamano, tipo: buf.toString("latin1", pos + 4, pos + 8), pos };
    };

    // Cajas de primer nivel: buscar `moov`
    let moov = null;
    for (let p = 0; p + 8 <= buf.length; ) {
      const caja = leerCaja(p, buf.length);
      if (!caja || caja.tamano < 8) break;
      if (caja.tipo === "moov") {
        moov = { inicio: p + 8, fin: p + caja.tamano };
        break;
      }
      p += caja.tamano;
    }
    if (!moov) return null;

    /** Recorre las cajas hijas de un rango. */
    const hijos = (inicio, fin) => {
      const lista = [];
      for (let p = inicio; p + 8 <= fin; ) {
        const caja = leerCaja(p, fin);
        if (!caja || caja.tamano < 8) break;
        lista.push(caja);
        p += caja.tamano;
      }
      return lista;
    };

    const datos = {};

    for (const caja of hijos(moov.inicio, moov.fin)) {
      // ── Duración (mvhd) ──
      if (caja.tipo === "mvhd") {
        const d = caja.pos + 8; // tras tamaño+tipo
        const version = buf[d];
        if (version === 0) {
          const timescale = buf.readUInt32BE(d + 12);
          const duracion = buf.readUInt32BE(d + 16);
          if (timescale > 0) datos.seconds = Math.round(duracion / timescale);
        } else if (version === 1) {
          const timescale = buf.readUInt32BE(d + 20);
          const duracion = Number(buf.readBigUInt64BE(d + 24));
          if (timescale > 0) datos.seconds = Math.round(duracion / timescale);
        }
      }

      // ── Medidas (trak > tkhd) ──
      if (caja.tipo === "trak" && datos.width == null) {
        for (const hijo of hijos(caja.pos + 8, caja.pos + caja.tamano)) {
          if (hijo.tipo !== "tkhd") continue;
          const d = hijo.pos + 8;
          const version = buf[d];
          // 16.16 fijo: el entero son los 16 bits altos
          const offAncho = version === 0 ? 76 : 88;
          const offAlto = version === 0 ? 80 : 92;
          if (d + offAlto + 4 <= buf.length) {
            const ancho = buf.readUInt32BE(d + offAncho) / 65536;
            const alto = buf.readUInt32BE(d + offAlto) / 65536;
            if (ancho >= 1 && alto >= 1) {
              datos.width = Math.round(ancho);
              datos.height = Math.round(alto);
            }
          }
        }
      }
    }

    return Object.keys(datos).length ? datos : null;
  } catch {
    return null;
  }
}

export default { datosDelVideo };
