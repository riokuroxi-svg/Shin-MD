/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';

export default {
  command: ['topcount', 'topmensajes', 'topmsgcount', 'topmessages'],
  category: 'group',
  description: 'Ver el top de usuarios con más mensajes en el grupo.',
  groupOnly: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const allChatUsers = db.getChatUsers(chatId);
    const now = new Date();
    const daysArg = args[0] ? parseInt(args[0], 10) : 1;
    if (isNaN(daysArg) || daysArg < 1) {
      return msg.reply(`「✎」 El número de días debe ser mayor a 0.`);
    }
    const cutoff = new Date(now.getTime() - daysArg * 24 * 60 * 60 * 1000);
    const ranking = [];
    for (const user of allChatUsers) {
      let stats = user.stats;
      if (typeof stats === 'string') {
        try { stats = JSON.parse(stats); } catch { stats = {}; }
      }
      if (!stats || typeof stats !== 'object') continue;
      const days = Object.entries(stats).filter(([date]) => new Date(date) >= cutoff);
      const totalMsgs = days.reduce((acc, [, d]) => acc + (d.msgs || 0), 0);
      const totalCmds = days.reduce((acc, [, d]) => acc + (d.cmds || 0), 0);
      if (totalMsgs > 0) {
        ranking.push({ jid: user.user_id, totalMsgs, totalCmds });
      }
    }
    ranking.sort((a, b) => b.totalMsgs - a.totalMsgs);
    if (ranking.length === 0) {
      return msg.reply(`「✎」 No hay actividad registrada en los últimos ${daysArg} días.`);
    }
    const page = parseInt(args[1], 10) || 1;
    const perPage = 10;
    const totalPages = Math.ceil(ranking.length / perPage);
    if (page < 1 || page > totalPages) {
      return msg.reply(`「✎」 Página inválida. Solo hay ${totalPages} páginas disponibles.`);
    }
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageRanking = ranking.slice(start, end);
    let report = `❀ Top de mensajes en los últimos *${daysArg}* día${daysArg > 1 ? 's' : ''}\n\n`;
    for (let i = 0; i < pageRanking.length; i++) {
      const u = pageRanking[i];
      const userGlobal = db.getUser(u.jid);
      const name = userGlobal?.name || u.jid.split('@')[0];
      report += `*${start + i + 1}.* ${name}\n`;
      report += `   » Mensajes: \`${u.totalMsgs}\`, Comandos: \`${u.totalCmds}\`\n`;
    }
    if (page < totalPages) {
      report += `\n> Para ver la siguiente página › *${usedPrefix + command} ${daysArg} ${page + 1}*`;
    }
    await sock.reply(chatId, report, msg);
  }
};
