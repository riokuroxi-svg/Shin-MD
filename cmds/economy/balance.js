/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import db from '../../src/services/ginko-db.js';
import { sendFicha, atajo } from '#lib/ui-kit';
export default {
  command: ['balance', 'bal', 'coins', 'bank'],
  category: 'economy',
  description: 'Ver cuantos coins tienes.',
  run: async ({ msg, sock, usedPrefix, text }) => {
    const chatId = msg.chat;
    const chatData = db.getChat(chatId);
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId);
    const monedas = botSettings.currency;
    if (chatData.adminonly || !chatData.economy) {
      return msg.reply(`ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}economy on*`);
    }
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    const user = db.getChatUser(chatId, who);
    if (!user) {
      return msg.reply(`「✎」 El usuario mencionado no está registrado en el bot.`);
    }
    const users = db.getUser(who);
    const total = (user.coins || 0) + (user.bank || 0);
    // Ficha con atajos: los botones lanzan otros comandos del bot,
    // así que desde el saldo se llega al banco o al ranking sin
    // volver a escribir nada.
    await sendFicha(sock, chatId, {
      titulo: `Cartera de ${users?.name || who.split('@')[0]}`,
      filas: [
        ['Cartera', `¥${user.coins?.toLocaleString() || 0} ${monedas}`],
        ['Banco', `¥${user.bank?.toLocaleString() || 0} ${monedas}`],
        ['Total', `¥${total.toLocaleString()} ${monedas}`],
      ],
      nota: 'El dinero de la cartera te lo pueden robar; el del banco no.',
      botones: [
        atajo('🎁 Diaria', 'daily', usedPrefix),
        atajo('🏦 Depositar', 'deposit', usedPrefix),
        atajo('🏆 Ranking', 'economyboard', usedPrefix),
      ],
      quoted: msg.full || msg,
    });
  }
};