/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import db from '../../src/services/ginko-db.js';
import { sendFicha, atajo } from '#lib/ui-kit';
import { state } from '#lib/theme';

export default {
  command: ['economyboard', 'eboard', 'baltop'],
  category: 'economy',
  description: 'Ver el ranking de usuarios con más coins.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const { blocked, message: avisoEconomia } = economyGate(chatId, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId) || {};
    const monedas = botSettings.currency || 'Coins';
    try {
      const chatUsers = db.getChatUsers(chatId);
      const users = [];
      for (const userData of chatUsers || []) {
        const total = (userData.coins || 0) + (userData.bank || 0);
        if (total >= 1000) {
          const userInfo = db.getUser(userData.user_id);
          users.push({ ...userData, jid: userData.user_id, name: userInfo?.name || 'Usuario' });
        }
      }
      if (users.length === 0) {
        return msg.reply(`ꕥ No hay usuarios en el grupo con más de 1,000 ${monedas}.`);
      }
      const sorted = users.sort((a, b) => ((b.coins || 0) + (b.bank || 0)) - ((a.coins || 0) + (a.bank || 0)));
      const page = parseInt(args[0], 10) || 1;
      const pageSize = 10;
      const totalPages = Math.ceil(sorted.length / pageSize);
      if (isNaN(page) || page < 1 || page > totalPages) {
        return msg.reply(`《✧》 La página *${page}* no existe. Hay *${totalPages}* páginas.`);
      }
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      let cuerpo = `*✩ EconomyBoard (✿◡‿◡)*\n\n`;
      cuerpo += sorted.slice(start, end).map(({ name, coins, bank }, i) => {
        const total = (coins || 0) + (bank || 0);
        return `✩ ${start + i + 1} › *${name}*\n     Total → *¥${total.toLocaleString()} ${monedas}*`;
      }).join('\n');
      cuerpo += `\n\n> ⌦ Página *${page}* de *${totalPages}*`;
      if (page < totalPages) {
        cuerpo += `\n> Para ver la siguiente página › *${usedPrefix + command} ${page + 1}*`;
      }
      await sendFicha(sock, chatId, {
        titulo: `Ranking · página ${page} de ${totalPages}`,
        filas: [cuerpo],
        botones: [
          ...(page < totalPages ? [atajo('▶️ Siguiente página', `economyboard ${page + 1}`, usedPrefix)] : []),
          atajo('💰 Mi saldo', 'balance', usedPrefix),
          atajo('🎁 Diaria', 'daily', usedPrefix),
        ],
        quoted: msg.full || msg,
      });
    } catch (e) {
      await msg.reply(state('error', { detail: e?.message }));
    }
  }
};
