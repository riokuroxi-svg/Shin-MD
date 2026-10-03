/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { pickRandom } from "#lib/random";
import { botJid } from "#serialize";
import db from '../../src/services/ginko-db.js';
import { tiempoLargo as msToTime } from "#lib/tiempo";
export default {
  command: ['cofre', 'coffer'],
  category: 'economy',
  description: 'Reclamar tu cofre diario.',
  run: async ({ msg, sock, usedPrefix }) => {
    const { blocked, message: avisoEconomia, chat } = economyGate(msg.chat, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const bot = db.getSettings(botId);
    const currency = bot.currency;
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastcoffer', 0);
    const user = db.getChatUser(msg.chat, msg.sender);
    const now = Date.now();
    const gap = 24 * 60 * 60 * 1000;
    if (now < user.lastcoffer) {
      const restante = user.lastcoffer - now;
      return msg.reply(`ꕥ Debes esperar *${msToTime(restante)}* para volver a abrir un cofre.`);
    }
    const rand = Math.random();
    let reward = 0;
    let message = "";
    if (rand < 0.5) {
      reward = 25000;
      db.setChatUser(msg.chat, msg.sender, 'coins', (user.coins || 0) + reward);
      const normalMessages = [
        `「✿」 Has abierto un cofre normal y recibiste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre común contenía monedas brillantes, ganaste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 Dentro del cofre normal encontraste un montón de monedas, recibes *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre se abrió con facilidad y estaba lleno de monedas, obtuviste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre normal estaba escondido bajo unas piedras, dentro había *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 Abriste un cofre sencillo y estaba lleno de monedas antiguas, recibes *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre común estaba polvoriento, pero dentro guardaba *¥${reward.toLocaleString()} ${currency}*.`
      ];
      message = pickRandom(normalMessages);
    } else if (rand < 0.8) {
      reward = 40000;
      db.setChatUser(msg.chat, msg.sender, 'coins', (user.coins || 0) + reward);
      const legendaryMessages = [
        `「✿」 ¡Increíble! Abriste un cofre legendario y recibiste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre legendario brillaba con luz dorada, dentro había *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 ¡Has encontrado un cofre legendario! Estaba repleto de riquezas: *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre legendario se abrió con un destello mágico, ganaste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre legendario estaba custodiado por un dragón, dentro había *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 Abriste un cofre legendario cubierto de runas, recibiste *¥${reward.toLocaleString()} ${currency}*.`,
        `「✿」 El cofre legendario emanaba energía mística, dentro guardaba *¥${reward.toLocaleString()} ${currency}*.`
      ];
      message = pickRandom(legendaryMessages);
    } else {
      const emptyMessages = [
        "「✿」 Abriste el cofre con emoción... pero estaba vacío.",
        "「✿」 El cofre crujió al abrirse, solo contenía polvo y telarañas.",
        "「✿」 Con gran expectativa abriste el cofre, pero no había nada dentro.",
        "「✿」 El cofre estaba sellado por magia oscura y no contenía tesoros.",
        "「✿」 Tras abrir el cofre, descubriste que estaba completamente vacío.",
        "「✿」 El cofre se abrió lentamente, dentro solo había aire.",
        "「✿」 Abriste el cofre y escuchaste un eco... estaba vacío.",
        "「✿」 El cofre parecía prometedor, pero no contenía nada de valor.",
        "「✿」 Dentro del cofre solo había piedras comunes, sin tesoros."
      ];
      message = pickRandom(emptyMessages);
    }
    db.setChatUser(msg.chat, msg.sender, 'lastcoffer', now + gap);
    await msg.reply(message);
  }
};


