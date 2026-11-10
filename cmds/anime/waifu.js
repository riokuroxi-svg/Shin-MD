/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";
import fetch from "node-fetch";
import db from '../../src/services/ginko-db.js';

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0', 'accept': 'application/json', ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export default {
  command: ['waifu', 'neko'],
  category: 'anime',
  description: 'Obtener una imagen de waifu aleatoria.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      await msg.react('🕒');
      const chat = db.getChat(msg.chat);
      const isNsfw = !!chat?.nsfw;
      const tipo = command === 'neko' ? 'neko' : 'waifu';

      let imgUrl = null;

      // Intento 1: waifu.pics (soporta SFW y NSFW)
      try {
        const scope = isNsfw ? 'nsfw' : 'sfw';
        const j = await fetchJson(`https://api.waifu.pics/${scope}/${tipo}`);
        imgUrl = j?.url;
      } catch (e) {
        log.info('[waifu] waifu.pics falló:', e.message);
      }

      // Intento 2 (SFW): nekos.life
      if (!imgUrl && !isNsfw) {
        try {
          const j = await fetchJson(`https://nekos.life/api/v2/img/${tipo}`);
          imgUrl = j?.url;
        } catch (e) {
          log.info('[waifu] nekos.life falló:', e.message);
        }
      }

      // Intento 3 (SFW): nekos.best
      if (!imgUrl && !isNsfw) {
        try {
          const j = await fetchJson(`https://nekos.best/api/v2/${tipo}`, {
            headers: { 'user-agent': 'Shin-MD/3.7' },
          });
          imgUrl = j?.results?.[0]?.url;
        } catch (e) {
          log.info('[waifu] nekos.best falló:', e.message);
        }
      }

      if (!imgUrl) {
        await msg.react('✖️');
        return msg.reply('《✧》 No se pudo obtener una imagen en este momento, intenta más tarde.');
      }

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      let img;
      try {
        const r = await fetch(imgUrl, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        img = Buffer.from(await r.arrayBuffer());
      } finally {
        clearTimeout(t);
      }

      await sock.sendFile(msg.chat, img, `${command}.jpg`, `✿ ¡Aquí tienes tu *${command.toUpperCase()}*!`, msg);
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(`> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  },
};
