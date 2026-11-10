/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';

async function getEmojiMix(emoji1, emoji2) {
  try {
    const url = `https://emojik.vercel.app/s/${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}?size=128`;
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(response.data, 'binary');
  } catch {
    return null;
  }
}

export default {
  command: ['emojimix'],
  category: 'stickers',
  description: 'Combinar dos emojis en un sticker.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    let tmpFile = null;
    try {
      const text = args.join(' ').trim();
      if (!text) return msg.reply(`❀ Por favor, ingresa *2 emojis* para combinarlos.`);
      const emojis = text.split('+').map(e => e.trim()).filter(Boolean);
      let emoji1, emoji2;
      if (emojis.length === 2) {
        [emoji1, emoji2] = emojis;
      } else {
        const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
        const emojiList = [...segmenter.segment(text)].map(s => s.segment).filter(s => s.trim());
        if (emojiList.length < 2) {
          return msg.reply(`《✧》 Debes ingresar *2 emojis* válidos.\n> Ejemplo: *${usedPrefix + command} 😎+😳* o *${usedPrefix + command} 😎 😳*`);
        }
        emoji1 = emojiList[0];
        emoji2 = emojiList[1];
      }
      await msg.react('🕒');
      const buffer = await getEmojiMix(emoji1, emoji2);
      if (!buffer) {
        await msg.react('✖️');
        return msg.reply(`ꕥ No se pudo combinar *${emoji1}* + *${emoji2}*. Intenta con otros emojis.`);
      }
      fs.mkdirSync('./tmp', { recursive: true });
      tmpFile = path.join('./tmp', `emojimix_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
      fs.writeFileSync(tmpFile, buffer);
      const user = db.getUser(msg.sender) || {};
      const name = user.name || msg.sender.split('@')[0];
      const meta1 = user.metadatos ? String(user.metadatos).trim() : '';
      const meta2 = user.metadatos2 ? String(user.metadatos2).trim() : '';
      const texto1 = meta1 ? meta1 : (global.stickerBrand || 'Shin-MD');
      const texto2 = meta1 ? (meta2 ? meta2 : '') : `@${name}`;
      await sock.sendImageAsSticker(msg.chat, tmpFile, msg, { packname: texto1, author: texto2 });
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(state('error', { detail: e.message }));
    } finally {
      if (tmpFile) fs.rmSync(tmpFile, { force: true });
    }
  },
};
