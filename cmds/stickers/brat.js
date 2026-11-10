/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import axios from 'axios';
import fs from 'fs';
import db from '../../src/services/ginko-db.js';
import { runGuarded } from '#lib/apiBreaker';
import { state } from '#lib/theme';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchSticker = async (text, attempt = 1) => {
  try {
    const response = await runGuarded('brat', async () =>
      axios.get(`https://skyzxu-brat.hf.space/brat`, { params: { text }, responseType: 'arraybuffer', timeout: 15000 })
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 429 && attempt <= 3) {
      const retryAfter = Number(error.response.headers['retry-after']) || 5;
      await delay(retryAfter * 1000);
      return fetchSticker(text, attempt + 1);
    }
    throw error;
  }
};

export default {
  command: ['brat'],
  category: 'stickers',
  description: 'Crear un sticker estilo brat con texto.',
  run: async ({ msg, sock, text }) => {
    let tmpFile = null;
    try {
      const contenido = msg.quoted?.text || text;
      if (!contenido) {
        return sock.reply(msg.chat, `《✧》 Por favor, responde a un mensaje o ingresa un texto para crear el Sticker.`, msg);
      }
      await msg.react('🕒');
      const user = db.getUser(msg.sender) || {};
      const name = user.name || msg.sender.split('@')[0];
      const hasMeta1 = user.metadatos ? String(user.metadatos).trim() : '';
      const hasMeta2 = user.metadatos2 ? String(user.metadatos2).trim() : '';
      const texto1 = hasMeta1 ? user.metadatos : (global.stickerBrand || 'Shin-MD');
      const texto2 = hasMeta1 ? (hasMeta2 ? user.metadatos2 : '') : `@${name}`;
      const buffer = await fetchSticker(contenido);
      fs.mkdirSync('./tmp', { recursive: true });
      tmpFile = `./tmp/brat-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
      fs.writeFileSync(tmpFile, buffer);
      await sock.sendImageAsSticker(msg.chat, tmpFile, msg, { packname: texto1, author: texto2 });
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      return msg.reply(state('error', { detail: e.message }));
    } finally {
      if (tmpFile) fs.rmSync(tmpFile, { force: true });
    }
  }
};
