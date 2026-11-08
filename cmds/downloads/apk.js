/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { getBuffer } from "#serialize"
import { sendFicha, enlace, copiar } from '#lib/ui-kit';
import { state } from '#lib/theme';
// aptoide-scraper se importa de forma PESA dentro del handler: al cargarlo
// crea un setInterval interno que impediría la salida limpia del proceso
// (tests/shutdown) y tardaría en importar sin usarse nunca.

export default {
  command: ['apk', 'aptoide', 'apkdl'],
  category: 'downloads',
  description: 'Buscar y descargar aplicaciones de Aptoide.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {    if (!args || !args.length) {
      return msg.reply('《✧》 Por favor, ingresa el nombre de la aplicación.')
    }
    const query = args.join(' ').trim()
    try {
      const aptoide = await import('aptoide-scraper')
      const searchA = await aptoide.search(query)
      if (!searchA || searchA.length === 0) {
        return msg.reply('《✧》 No se encontraron resultados.')
      }
      const apkInfo = await aptoide.download(searchA[0].id)
      if (!apkInfo) {
        return msg.reply('《✧》 No se pudo obtener la información de la aplicación.')
      }
      const { name, package: id, size, icon, dllink: downloadUrl, lastup } = apkInfo
      const caption = `✰ ᩧ　𓈒　ׄ　Aptoide 　ׅ　✿\n\n➩ *Nombre ›* ${name}\n❖ *Paquete ›* ${id}\n✿ *Última actualización ›* ${lastup}\n☆ *Tamaño ›* ${size}`
      const sizeBytes = parseSize(size)
      if (sizeBytes > 524288000) {
        // Antes te dejaba tirado con una url larguísima que había que
        // seleccionar a mano en el móvil. Ahora se abre o se copia.
        return sendFicha(sock, msg.chat, {
          titulo: name,
          filas: [['Peso', size], ['Estado', 'demasiado grande para mandarlo por aquí']],
          nota: 'WhatsApp no deja adjuntar archivos de este tamaño.',
          botones: [enlace('⬇️ Descargar del origen', downloadUrl), copiar('📋 Copiar enlace', downloadUrl)],
          quoted: msg.full || msg,
        })
      }
      await sock.sendMessage(msg.chat, { document: { url: downloadUrl }, mimetype: 'application/vnd.android.package-archive', fileName: `${name}.apk`, caption }, { quoted: msg })
    } catch (e) {
      await msg.reply(state('error', { detail: e?.message }))
    }
  },
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0
  const parts = sizeStr.trim().toUpperCase().split(' ')
  const value = parseFloat(parts[0])
  const unit = parts[1] || 'B'
  switch (unit) {
    case 'KB': return value * 1024
    case 'MB': return value * 1024 * 1024
    case 'GB': return value * 1024 * 1024 * 1024
    default: return value
  }
}