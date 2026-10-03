/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import { pickRandom } from "#lib/random";
import { delay } from 'baileys';
import db from '../../src/services/ginko-db.js';

export default {
  command: ['slot'],
  category: 'economy',
  description: 'Apostar coins en el casino.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    const { blocked, message: avisoEconomia, chat } = economyGate(msg.chat, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const bot = db.getSettings(botId);
    const currency = bot.currency;
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastslot', 0);
    const user = db.getChatUser(msg.chat, msg.sender);
    if (!args[0] || isNaN(args[0]) || parseInt(args[0]) <= 0) {
      return msg.reply(`❀ Por favor, ingresa la cantidad que deseas apostar.`);
    }
    const apuesta = parseInt(args[0]);
    if (Date.now() - user.lastslot < 30000) {
      const restante = user.lastslot + 30000 - Date.now();
      return msg.reply(`ꕥ Debes esperar *${formatTime(restante)}* para usar *${usedPrefix + command}* nuevamente.`);
    }
    if (apuesta < 100) {
      return msg.reply(`ꕥ El mínimo para apostar es de 100 *${currency}*.`);
    }
    if (user.coins < apuesta) {
      return msg.reply(`ꕥ Tus *${currency}* no son suficientes para apostar esa cantidad.`);
    }
    const emojis = ['✾', '❃', '❁'];
    const getRandomEmojis = () => {
      const x = Array.from({ length: 3 }, () => pickRandom(emojis));
      const y = Array.from({ length: 3 }, () => pickRandom(emojis));
      const z = Array.from({ length: 3 }, () => pickRandom(emojis));
      return { x, y, z };
    };
    const initialText = '「✿」| *SLOTS* \n────────\n';
    let { key } = await sock.sendMessage(msg.chat, { text: initialText }, { quoted: msg });
    const animateSlots = async () => {
      for (let i = 0; i < 5; i++) {
        const { x, y, z } = getRandomEmojis();
        const animationText = `「✿」| *SLOTS*
────────
${x[0]} : ${y[0]} : ${z[0]}
${x[1]} : ${y[1]} : ${z[1]}
${x[2]} : ${y[2]} : ${z[2]}
────────`;
        await sock.sendMessage(msg.chat, { text: animationText, edit: key }, { quoted: msg });
        await delay(300);
      }
    };
    await animateSlots();
    const { x, y, z } = getRandomEmojis();
    let resultado;
    let newCoins = user.coins;
    if (x[0] === y[0] && y[0] === z[0]) {
      resultado = `❀ Ganaste! *¥${(apuesta * 2).toLocaleString()} ${currency}*.`;
      newCoins += apuesta;
    } else if (x[0] === y[0] || x[0] === z[0] || y[0] === z[0]) {
      resultado = `❀ Casi lo logras. *Toma ¥10 ${currency}* por intentarlo.`;
      newCoins += 10;
    } else {
      resultado = `❀ Perdiste *¥${apuesta.toLocaleString()} ${currency}*.`;
      newCoins -= apuesta;
    }
    db.setChatUser(msg.chat, msg.sender, 'lastslot', Date.now());
    db.setChatUser(msg.chat, msg.sender, 'coins', newCoins);
    const finalText = `「✿」| *SLOTS*
────────
${x[0]} : ${y[0]} : ${z[0]}
${x[1]} : ${y[1]} : ${z[1]}
${x[2]} : ${y[2]} : ${z[2]}
────────
${resultado}`;
    await sock.sendMessage(msg.chat, { text: finalText, edit: key }, { quoted: msg });
  }
};

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`);
  parts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`);
  return parts.join(' ');
}