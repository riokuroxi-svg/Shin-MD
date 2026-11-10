/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';

const formatDate = (timestamp) => {
  const date = new Date(parseInt(timestamp, 10));
  return date.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
};

export default {
  command: ['packlist', 'stickerpacks'],
  category: 'stickers',
  description: 'Listar tus paquetes de stickers.',
  run: async ({ msg, sock }) => {
    try {
      const stickerPackData = db.getStickersPack(msg.sender);
      const packs = stickerPackData.packs || [];
      if (!packs.length) {
        return msg.reply('《✧》No tienes paquetes de stickers creados.');
      }
      let listText = `*❀ Lista de tus paquetes de stickers:*\n`;
      listText += `> ❏ Total: \`${packs.length}\`\n`;
      listText += `> ❏ Usuario: @${msg.sender.split('@')[0]}\n\n`;
      packs.forEach(pack => {
        const estado = pack.spackpublic === 1 ? 'Público' : 'Privado';
        listText += `❖ *${pack.name || 'Sin nombre'}*\n`;
        listText += `> » Stickers: \`${pack.stickers?.length || 0}\`\n`;
        listText += `> » Modificado: \`${formatDate(pack.lastModified || pack.id)}\`\n`;
        listText += `> » Estado: \`${estado}\`\n\n`;
      });
      await sock.sendMessage(msg.chat, { text: listText, mentions: [msg.sender] }, { quoted: msg });
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  }
};
