/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { pickRandom } from "#lib/random";
import axios from 'axios';
import { promises as fs } from 'fs';
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';
import { flattenCharacters, formatTag, getSeriesNameByCharacter, loadCharacters } from "#lib/gacha-shared";
function getRefererForUrl(url) {
  if (url.includes('safebooru.org')) return 'https://safebooru.org/';
  if (url.includes('danbooru.donmai.us')) return 'https://danbooru.donmai.us/';
  if (url.includes('gelbooru.com')) return 'https://gelbooru.com/';
  return '';
}


async function buscarImagenDelirius(tag) {
  const query = formatTag(tag);
  const urls = [`https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${query}`, `https://danbooru.donmai.us/posts.json?tags=${query}`, `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${query}&api_key=98f554258c88c44f4dd28ccde0c28f36682b2a992490ab35ebcc7baf7e196a86d7550b174bce577b8cc3f544e9b3ad0f6aeb09ad63bf89a9141cc3eddb6fbfd2&user_id=1917269`];  
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }});
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('json')) continue;      
      const json = await res.json();
      const data = Array.isArray(json) ? json : json?.post || json?.data || [];
      const valid = data.map(i => i?.file_url || i?.large_file_url || i?.image || i?.media_asset?.variants?.[0]?.url).filter(u => typeof u === 'string' && /\.(jpe?g|png)$/.test(u));      
      if (valid.length) return valid;
    } catch {}
  }
  return [];
}

export default {
  command: ['charimage', 'waifuimage', 'cimage', 'wimage'],
  category: 'gacha',
  description: 'Ver una imagen aleatoria de un personaje.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    try {
      const chat = db.getChat(msg.chat);
      if (chat.adminonly || !chat.gacha) {
        return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
      }
      if (!args.length) {
        return msg.reply(`❀ Por favor, proporciona el nombre de un personaje.\n> Ejemplo » *${usedPrefix + command} Ginko-MD*`);
      }
      const dbChars = await loadCharacters();
      const allCharacters = flattenCharacters(dbChars);
      const nameQuery = args.join(' ').toLowerCase().trim();
      const character = allCharacters.find(c => String(c.name).toLowerCase() === nameQuery) || allCharacters.find(c => String(c.name).toLowerCase().includes(nameQuery) || (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(nameQuery)))) || allCharacters.find(c => nameQuery.split(' ').some(q => String(c.name).toLowerCase().includes(q) || (Array.isArray(c.tags) && c.tags.some(tag => tag.toLowerCase().includes(q)))));
      if (!character) {
        return msg.reply(`ꕥ No se encontró el personaje *${nameQuery}*.`);
      }
      const tag = Array.isArray(character.tags) ? character.tags[0] : null;
      if (!tag) {
        return msg.reply(`ꕥ El personaje *${character.name}* no tiene un tag válido para buscar imágenes.`);
      }
      const mediaList = await buscarImagenDelirius(tag);
      const media = pickRandom(mediaList);
      if (!media) {
        return msg.reply(`ꕥ No se encontraron imágenes para *${character.name}* con el tag *${tag}*.`);
      }
      const source = getSeriesNameByCharacter(dbChars, character.id);
      const caption = `❀ Nombre » *${character.name}*\n⚥ Género » *${character.gender || 'Desconocido'}*\n❖ Fuente » *${source}*\u206c`;
      const imgRes = await axios.get(media, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': getRefererForUrl(media) }});
      const buffer = Buffer.from(imgRes.data);
      await sock.sendMessage(msg.chat, { image: buffer, caption: caption }, { quoted: msg });
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  }
};