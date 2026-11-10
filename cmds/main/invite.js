/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { mismaPersona } from "#lib/lid";
import db from '../../src/services/ginko-db.js';
import { tiempoLargo as msToTime, esperaRestante } from "#lib/tiempo";

/** Lo mínimo entre dos invitaciones. */
const ESPERA_INVITAR_MS = 3600000;
const linkRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})(?:\s+[0-9]{1,3})?/i;

async function getGroupName(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);
    return metadata.subject || 'Grupo desconocido';
  } catch {
    return 'Chat privado';
  }
}

export default {
  command: ['invite', 'invitar'],
  category: 'main',
  description: 'Invitar el bot a un grupo.',
  run: async ({ msg, sock, args }) => {
    db.setCreate('users', [msg.sender], 'jointime', 0);
    const user = db.getUser(msg.sender);
    const grupo = msg.isGroup ? await getGroupName(sock, msg.chat) : 'Chat privado';
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId) || {};
    const botname = botSettings.botname || 'Bot';
    const dueño = botSettings.owner || '';
    const { esperaMs } = esperaRestante(user.jointime, ESPERA_INVITAR_MS);
    if (esperaMs > 0) {
      return msg.reply(`ꕥ Espera *${msToTime(esperaMs)}* para volver a enviar otra invitacion.`);
    }
    if (!args || !args.length) {
      return msg.reply('《✧》 Ingresa el enlace para invitar al bot a tu grupo.');
    }
    const link = args.join(' ');
    const match = link.match(linkRegex);
    if (!match || !match[1]) {
      return msg.reply('《✧》 El enlace ingresado no es válido o está incompleto.');
    }
    const isOficialBot = !!(botId && global.sock?.user?.id && mismaPersona(botId, botJid(global.sock)));
    const botType = isOficialBot ? 'Principal/Owner' : 'Sub Bot';
    const userName = user?.name || 'Usuario';
    const sugg = `❀ 𝗦𝗢𝗟𝗜𝗖𝗜𝗧𝗨𝗗 𝗥𝗘𝗖𝗜𝗕𝗜𝗗𝗔

✩ *Usuario ›* ${userName}
✿ *Enlace ›* ${args.join(' ')}
✿ *Chat ›* ${grupo}

➤ 𝗜𝗡𝗙𝗢 𝗕𝗢𝗧
♡ *Socket ›* ${botType}
★ *Nombre ›* ${botname}
❐ *Versión ›* @latest`;
    if (typeof sugg !== 'string' || !sugg.trim()) return;
    if (isOficialBot) {
      for (const num of global.owner) {
        try {
          await sock.sendMessage(`${num}@s.whatsapp.net`, { text: sugg });
        } catch {}
      }
    } else {
      const destino = dueño || botId;
      try {
        await sock.sendMessage(destino, { text: sugg });
      } catch {}
    }
    await sock.reply(msg.chat, '❀ El enlace fue enviado correctamente. ¡Gracias por tu invitación! ฅ^•ﻌ•^ฅ', msg);
    db.setUser(msg.sender, 'jointime', Date.now());
  },
};
