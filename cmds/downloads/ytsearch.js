/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ytsearch.js — Buscar en YouTube, en carrusel
//
//  Antes: una sola foto y debajo un ladrillo de texto con TODOS los
//  resultados pegados, separados por una guirnalda de símbolos. Había
//  que leerlo entero para elegir, y el enlace se copiaba a mano.
//
//  Ahora: cinco tarjetas que se pasan con el dedo, cada una con su
//  miniatura, su duración y sus botones. El de descargar manda
//  directamente ".play <url>", así que el resultado elegido entra por
//  el camino de siempre — el bueno, con su cola anti-ban y todo.
// ═══════════════════════════════════════════════════════════════════

import yts from '#lib/youtubeSearch'
import { getBuffer } from '#serialize'
import { buildTarjeta, prepararImagen, sendCarousel, MAX_TARJETAS } from '#lib/carousel'
import { state, footer } from '#lib/theme'

/** Cuántos resultados enseñamos. Cinco caben sin cansar el dedo. */
export const RESULTADOS = 5

/** Un resultado de yts en algo que se pueda dibujar. Pura, para probar. */
export function resumirVideo(v = {}) {
  return {
    titulo: String(v.title || 'Sin título').slice(0, 60),
    canal: String(v.author?.name || v.author || '—').slice(0, 30),
    duracion: v.timestamp || '—',
    vistas: typeof v.views === 'number' ? v.views.toLocaleString('es-MX') : String(v.views || '—'),
    subido: v.ago || '—',
    url: v.url || '',
    miniatura: v.thumbnail || v.image || '',
  }
}

/** El respaldo en texto, por si el carrusel no se dibuja. */
export function renderLista(videos = [], prefijo = '.') {
  const filas = videos.map((v, i) =>
    `*${i + 1}.* ${v.titulo}\n> ⴵ ${v.duracion} · ✿ ${v.vistas} vistas · ${v.subido}\n> ${v.url}`)
  return `🔎 *Resultados de YouTube*\n\n${filas.join('\n\n')}\n\n_Descarga con_ \`${prefijo}play <número o enlace>\`\n${footer()}`
}

export default {
  command: ['ytsearch', 'search', 'yts'],
  category: 'downloads',
  description: 'Buscar vídeos de YouTube (carrusel de resultados).',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    const consulta = (text || (args || []).join(' ')).trim()
    if (!consulta) {
      return msg.reply(state('usage', {
        usage: `${usedPrefix}${command} <lo que buscas>`,
        example: `${usedPrefix}${command} cunumi faraon love shady`,
      }))
    }

    let videos = []
    try {
      const res = await yts(consulta)
      videos = (res?.all || [])
        .filter(v => v.type === 'video')
        .slice(0, Math.min(RESULTADOS, MAX_TARJETAS))
        .map(resumirVideo)
    } catch (e) {
      return msg.reply(state('error', { detail: e?.message || 'la búsqueda no respondió' }))
    }

    if (!videos.length) {
      return msg.reply(state('notfound', { what: consulta, hint: 'Prueba con otras palabras.' }))
    }

    const respaldo = renderLista(videos, usedPrefix)

    // Las miniaturas se suben en paralelo: cinco descargas de golpe,
    // no cinco esperas seguidas. Si alguna falla, esa tarjeta va sin
    // foto y las demás ni se enteran.
    const imagenes = await Promise.all(videos.map(async (v) => {
      if (!v.miniatura) return null
      try {
        const buf = await getBuffer(v.miniatura)
        return await prepararImagen(sock, buf)
      } catch { return null }
    }))

    const tarjetas = videos.map((v, i) => buildTarjeta({
      titulo: v.titulo,
      cuerpo: `ⴵ *${v.duracion}*  ·  ✿ ${v.vistas} vistas\n❖ ${v.canal}  ·  ${v.subido}`,
      pie: `${i + 1} de ${videos.length}`,
      imagen: imagenes[i],
      botones: [
        { texto: '⬇️ Descargar', id: `${usedPrefix}play ${v.url}` },
        { texto: '▶️ Ver en YouTube', url: v.url },
        { texto: '📋 Copiar enlace', copiar: v.url },
      ],
    }))

    const r = await sendCarousel(sock, msg.chat, {
      texto: `🔎 *${consulta}*\n> ${videos.length} resultados · pásalos con el dedo`,
      pie: footer(),
      tarjetas,
      quoted: msg.full || msg,
      respaldo,
    })

    if (!r.sent) await msg.reply(respaldo)
  },
}
