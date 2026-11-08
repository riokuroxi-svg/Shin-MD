/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';
export default {
  command: ['newpack', 'newstickerpack'],
  category: 'stickers',
  description: 'Crear un nuevo paquete de stickers.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const settings = db.getSettings(botJid(sock)) || {}
      const userId = db.getUser(msg.sender)
      const dev = userId.name || msg.pushName || 'Desconocido'
      const name = args.join(' ').trim()
      if (!name || name.length < 4 || name.length > 64) {
        return msg.reply('《✧》El nombre del paquete de stickers debe tener entre 4 y 64 caracteres.')
      }
      const stickerPackData = db.getStickersPack(msg.sender)
      const packs = stickerPackData.packs || []
      if (packs.find(p => p.name.toLowerCase() === name.toLowerCase())) {
        return msg.reply('《✧》Ya tienes un paquete con ese nombre.')
      }
      const newPack = { id: Date.now().toString(), lastModified: Date.now().toString(), name, author: global.stickerBrand || '🍁 Ginko-MD', desc: `Paquete de stickers creado por ${dev}`, stickers: [], spackpublic: 0 }
      packs.push(newPack)
      db.setStickersPack(msg.sender, 'packs', packs)
      await msg.reply(`《✧》El paquete de stickers \`${name}\` ha sido creado exitosamente!
> Puedes agregar stickers respondiendo a uno usando *${usedPrefix}addsticker ${name}*!`)
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  }
}
