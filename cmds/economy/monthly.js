/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import db from '../../src/services/ginko-db.js';
import { tiempoLargo } from "#lib/tiempo";
export default {
  command: ['monthly', 'mensual'],
  category: 'economy',
  description: 'Reclamar tu recompensa mensual.',
  run: async ({ msg, sock, usedPrefix, text }) => {
    const { blocked, message: avisoEconomia, chat } = economyGate(msg.chat, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const bot = db.getSettings(botId);
    const currency = bot.currency;
    db.setCreate('users', msg.sender, 'monthlyStreak', 0);
    db.setCreate('users', msg.sender, 'lastMonthlyGlobal', 0);
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastmonthly', 0);
    const users = db.getUser(msg.sender);
    const user = db.getChatUser(msg.chat, msg.sender);
    const gap = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (now < user.lastmonthly) {
      const wait = tiempoLargo(user.lastmonthly - now);
      return sock.sendMessage(msg.chat, { text: `ꕥ Ya has reclamado tu recompensa mensual.\n> Puedes reclamarlo de nuevo en *${wait}*` }, { quoted: msg });
    }
    let currentStreak = users.monthlyStreak;
    const lost = users.monthlyStreak >= 1 && now - users.lastMonthlyGlobal > gap * 1.5;
    if (lost) {
      currentStreak = 0;
      db.setUser(msg.sender, 'monthlyStreak', 0);
    }
    const canClaimGlobal = now - users.lastMonthlyGlobal >= gap;
    if (canClaimGlobal) {
      currentStreak = Math.min(currentStreak + 1, 8);
      db.setUser(msg.sender, 'monthlyStreak', currentStreak);
      db.setUser(msg.sender, 'lastMonthlyGlobal', now);
    }
    const coins = Math.min(60000 + (currentStreak - 1) * 5000, 95000);
    db.setChatUser(msg.chat, msg.sender, 'coins', (user.coins || 0) + coins);
    db.setChatUser(msg.chat, msg.sender, 'lastmonthly', now + gap);
    let next = Math.min(60000 + currentStreak * 5000, 95000).toLocaleString();
    let caption = `> Mes *${currentStreak + 1}* » *+${next}*`;
    if (lost) caption += `\n> ☆ ¡Has perdido tu racha de meses!`;
    await sock.sendMessage(msg.chat, { text: `「❁」 Has reclamado tu recompensa mensual de *+${coins.toLocaleString()} ${currency}* (Mes *${currentStreak}*)\n${caption}` }, { quoted: msg });
  }
};
