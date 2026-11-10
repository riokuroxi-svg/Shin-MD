/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import { delay } from 'baileys';
import db from '../../src/services/ginko-db.js';
import { tiempoLargo } from "#lib/tiempo";

const formatTime = (ms) => (ms <= 0 || isNaN(ms) ? "Ahora" : tiempoLargo(ms));

const buatall = 1;
export default {
  command: ['apostar', 'casino'],
  category: 'economy',
  description: 'Apostar coins en el casino.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const { blocked, message: avisoEconomia } = economyGate(msg.chat, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const bot = db.getSettings(botId) || {};
    const currency = bot.currency || 'Coins';
    const botname = bot.botname || global.botname || 'Shin-MD';
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastApuesta', 0);
    const user = db.getChatUser(msg.chat, msg.sender) || {};
    const Aku = Math.floor(Math.random() * 101);
    const Kamu = Math.floor(Math.random() * 55);
    const users = db.getUser(msg.sender);
    const userName = users?.name || msg.sender.split('@')[0];
    const tiempoEspera = 30 * 1000;
    const ahora = Date.now();
    if (user.lastApuesta && ahora - user.lastApuesta < tiempoEspera) {
      const restante = user.lastApuesta + tiempoEspera - ahora;
      const tiempoRestante = formatTime(restante);
      return sock.reply(msg.chat, `ꕥ Debes esperar *${tiempoRestante}* para usar *${usedPrefix + command}* nuevamente.`, msg);
    }
    if (args.length < 1) {
      return sock.reply(msg.chat, `❀ Ingresa la cantidad de *${currency}* que deseas apostar contra *${botname}*\n> Ejemplo: *${usedPrefix + command} 100*`, msg);
    }
    const rawCount = args[0];
    let count;
    if (/^all$/i.test(rawCount)) {
      count = Math.floor((user.coins || 0) / buatall);
    } else {
      count = parseInt(rawCount, 10);
    }
    if (!count || isNaN(count) || count < 1) {
      return sock.reply(msg.chat, `ꕥ Ingresa una cantidad válida de *${currency}* para apostar.`, msg);
    }
    if ((user.coins || 0) >= count) {
      db.setChatUser(msg.chat, msg.sender, 'lastApuesta', ahora);
      const saldoTrasApuesta = (user.coins || 0) - count;
      db.setChatUser(msg.chat, msg.sender, 'coins', saldoTrasApuesta);
      let resultado = '';
      let ganancia = 0;
      if (Aku > Kamu) {
        resultado = `> ${userName}, *Perdiste ¥${formatNumber(count)} ${currency}*.`;
      } else if (Aku < Kamu) {
        ganancia = count * 2;
        db.setChatUser(msg.chat, msg.sender, 'coins', saldoTrasApuesta + ganancia);
        resultado = `> ${userName}, *Ganaste ¥${formatNumber(ganancia)} ${currency}*.`;
      } else {
        ganancia = count;
        db.setChatUser(msg.chat, msg.sender, 'coins', saldoTrasApuesta + ganancia);
        resultado = `> ${userName}, *Empataste y recuperaste ¥${formatNumber(ganancia)} ${currency}*.`;
      }
      const { key } = await sock.sendMessage(msg.chat, { text: "🎲 El crupier lanza los dados... ¡Las apuestas están cerradas!" }, { quoted: msg });
      await delay(2000);
      await sock.sendMessage(msg.chat, { text: "❀ Los números están girando... ¡Prepárate para el resultado!", edit: key }, { quoted: msg });
      await delay(2000);
      const replyMsg = `❀ \`Veamos qué números tienen!\`\n\n➠ *${botname}* : ${Aku}\n➠ *${userName}* : ${Kamu}\n\n${resultado}`;
      await sock.sendMessage(msg.chat, { text: replyMsg.trim(), edit: key }, { quoted: msg });
    } else {
      await sock.reply(msg.chat, `ꕥ No tienes *¥${formatNumber(count)} ${currency}* para apostar!`, msg);
    }
  }
};

function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
