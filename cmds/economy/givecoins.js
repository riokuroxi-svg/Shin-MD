/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import { mismaPersona } from "#lib/lid";
import db from '../../src/services/ginko-db.js';

export default {
  command: ['givecoins', 'pay', 'coinsgive'],
  category: 'economy',
  description: 'Dar coins a un usuario.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const { blocked, message: avisoEconomia } = economyGate(chatId, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId) || {};
    const monedas = botSettings.currency || 'Coins';
    const rawDigits = args[1] ? args[1].replace(/\D/g, '') : '';
    const who = msg.quoted?.sender || msg.mentionedJid?.[0] || (rawDigits ? `${rawDigits}@s.whatsapp.net` : null);
    if (!who) {
      return msg.reply(`❀ Debes mencionar a quien quieras transferir *${monedas}*.\n> Ejemplo » *${usedPrefix + command} 25000 @mencion*`);
    }
    if (mismaPersona(who, msg.sender)) {
      return msg.reply('《✧》 No puedes transferirte coins a ti mismo.');
    }
    const senderData = db.getChatUser(chatId, msg.sender) || {};
    const targetData = db.getChatUser(chatId, who);
    if (!targetData) {
      return msg.reply(`ꕥ El usuario mencionado no está registrado en el bot.`);
    }
    const cantidadInput = args[0]?.toLowerCase();
    const saldoBanco = senderData.bank || 0;
    const cantidad = cantidadInput === 'all' ? saldoBanco : parseInt(cantidadInput, 10);
    if (!cantidadInput || isNaN(cantidad) || cantidad <= 0) {
      return msg.reply(`ꕥ Ingresa una cantidad válida de *${monedas}* para transferir.`);
    }
    if (saldoBanco < cantidad) {
      return msg.reply(`ꕥ No tienes suficientes *${monedas}* en el banco para transferir.\n> Tu saldo actual: *¥${saldoBanco.toLocaleString()} ${monedas}*`);
    }
    db.setChatUser(chatId, msg.sender, 'bank', saldoBanco - cantidad);
    db.setChatUser(chatId, who, 'bank', (targetData.bank || 0) + cantidad);
    const userData = db.getUser(who);
    const name = userData?.name || who.split('@')[0];
    await sock.sendMessage(chatId, { text: `❀ Transferiste *¥${cantidad.toLocaleString()} ${monedas}* a *${name}*\n> Ahora tienes *¥${(saldoBanco - cantidad).toLocaleString()} ${monedas}* en tu banco.`, mentions: [who] }, { quoted: msg });
  }
};
