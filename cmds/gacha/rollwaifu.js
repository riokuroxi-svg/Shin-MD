/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { pickRandom } from "#lib/random";
import { fastFetch } from '#lib/fastFetch';
import db from '../../src/services/ginko-db.js';
import { flattenCharacters, formatTag, getSeriesNameByCharacter, loadCharacters } from "#lib/gacha-shared";

const rollLocks = new Map();

function cleanOldLocks() {
  const now = Date.now();
  for (const [userId, lockTime] of rollLocks.entries()) {
    if (now - lockTime > 30000) rollLocks.delete(userId);
  }
}

// Precalentar caché al cargar el comando
loadCharacters().catch(() => {});

function getRefererForUrl(url) {
  if (url.includes('safebooru.org')) return 'https://safebooru.org/';
  if (url.includes('danbooru.donmai.us')) return 'https://danbooru.donmai.us/';
  if (url.includes('gelbooru.com')) return 'https://gelbooru.com/';
  return '';
}

async function buscarImagenDelirius(tag) {
  const query = formatTag(tag);
  const urls = [
    `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${query}`,
    `https://danbooru.donmai.us/posts.json?tags=${query}`,
    `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${query}&api_key=98f554258c88c44f4dd28ccde0c28f36682b2a992490ab35ebcc7baf7e196a86d7550b174bce577b8cc3f544e9b3ad0f6aeb09ad63bf89a9141cc3eddb6fbfd2&user_id=1917269`
  ];

  const results = await Promise.allSettled(urls.map(async (url) => {
    try {
      const res = await fastFetch(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Shin-MD/3.7', 'Accept': 'application/json' }
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('json')) return [];
      const json = await res.json();
      const data = Array.isArray(json) ? json : json?.post || json?.data || [];
      return data.map(i => i?.file_url || i?.large_file_url || i?.image || i?.media_asset?.variants?.[0]?.url).filter(u => typeof u === 'string' && /\.(jpe?g|png)$/i.test(u));
    } catch {
      return [];
    }
  }));

  const allUrls = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allUrls.push(...r.value);
    }
  }
  return allUrls;
}

export default {
  command: ['rollwaifu', 'rw', 'roll'],
  category: 'gacha',
  description: 'Waifu o husbando aleatorio.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const userId = msg.sender;
    const chatId = msg.chat;
    cleanOldLocks();
    if (rollLocks.has(userId)) {
      const lockTime = rollLocks.get(userId);
      const now = Date.now();
      if (now - lockTime < 15000) return;
      rollLocks.delete(userId);
    }
    const chat = db.getChat(chatId);
    if (chat?.adminonly || !chat?.gacha) {
      return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
    }
    db.setCreate('chat_users', [chatId, userId], 'lastRoll', 0);
    const me = db.getChatUser(chatId, userId);
    const now = Date.now();
    const cooldown = 15 * 60 * 1000;
    if (me.lastRoll && now < me.lastRoll) {
      const r = Math.ceil((me.lastRoll - now) / 1000);
      const min = Math.floor(r / 60);
      const sec = r % 60;
      let timeText = '';
      if (min > 0) timeText += `${min} minuto${min !== 1 ? 's' : ''} `;
      if (sec > 0 || timeText === '') timeText += `${sec} segundo${sec !== 1 ? 's' : ''}`;
      return msg.reply(`ꕥ Debes esperar *${timeText.trim()}* para usar *${usedPrefix + 'rw'}* de nuevo.`);
    }
    rollLocks.set(userId, now);

    try { await sock.sendMessage(chatId, { react: { text: '🎲', key: msg.key } }); } catch {}

    try {
      const chars = await loadCharacters();
      const all = flattenCharacters(chars);
      const selected = pickRandom(all);
      const id = String(selected.id);
      const source = getSeriesNameByCharacter(chars, selected.id);
      const baseTag = formatTag(selected.tags?.[0] || '');

      const mediaList = await buscarImagenDelirius(baseTag);
      const media = mediaList.length > 0 ? pickRandom(mediaList) : null;

      if (!media) {
        rollLocks.delete(userId);
        try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
        return msg.reply(`ꕥ No se encontró imágenes para el personaje *${selected.name}*.`);
      }
      const charKey = chatId + '__' + id;
      if (!db.getCharacter(charKey)) {
        db.setCharacter(charKey, { name: String(selected.name || 'Sin nombre') });
      } else if (!db.getCharacter(charKey)?.name) {
        db.setCharacter(charKey, { ...db.getCharacter(charKey), name: String(selected.name || 'Sin nombre') });
      }
      const globalChar = db.getCharacter(id) || {};
      const chatChar = db.getCharacter(charKey) || {};
      chatChar.name = String(selected.name || 'Sin nombre');
      chatChar.value = typeof globalChar.value === 'number' ? globalChar.value : Number(selected.value) || 100;
      chatChar.votes = Number(chatChar.votes || globalChar.votes || 0);
      chatChar.reservedBy = userId;
      chatChar.reservedUntil = now + 20000;
      chatChar.expiresAt = now + 60000;
      db.setCharacter(charKey, chatChar);
      const claimedBy = chatChar?.user || null;
      const owner = claimedBy ? (db.getUser(claimedBy))?.name || claimedBy.split('@')[0] : 'desconocido';
      const caption = `❀ Nombre » *${chatChar.name}*\n⚥ Género » *${selected.gender || 'Desconocido'}*\n✰ Valor » *${chatChar.value.toLocaleString()}*\n♡ Estado » *${claimedBy ? `Reclamado por ${owner}` : 'Libre'}*\n❖ Fuente » *${source}*\u206c`;

      const imgRes = await fastFetch(media, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': getRefererForUrl(media)
        }
      });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status} al descargar imagen`);
      const buffer = Buffer.from(await imgRes.arrayBuffer());

      const sent = await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: msg });

      let rolls = chat.rolls || {};
      if (typeof rolls === 'string') {
        try { rolls = JSON.parse(rolls); } catch { rolls = {}; }
      }
      if (sent?.key?.id) {
        rolls[sent.key.id] = { id, charKey, name: chatChar.name, expiresAt: chatChar.expiresAt, reservedBy: userId, reservedUntil: chatChar.reservedUntil };
        db.setChat(chatId, 'rolls', rolls);
      }
      db.setChatUser(chatId, userId, 'lastRoll', now + cooldown);
      try { await sock.sendMessage(chatId, { react: { text: '✅', key: msg.key } }); } catch {}
    } catch (e) {
      try { await sock.sendMessage(chatId, { react: { text: '❌', key: msg.key } }); } catch {}
      await msg.reply(`> Ocurrió un error al ejecutar *${usedPrefix + command}*.\n> Error: *${e.message}*`);
    } finally {
      rollLocks.delete(userId);
    }
  }
};
