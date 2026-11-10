/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { mismaPersona } from "#lib/lid";
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';

export default {
  command: ['buyc', 'buycharacter', 'buychar'],
  category: 'gacha',
  description: 'Comprar un personaje en venta.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const chatId = msg.chat;
    const userId = msg.sender;
    db.setCreate('chats', chatId, 'sales', {});
    const chat = db.getChat(chatId);
    if (chat?.adminonly || !chat?.gacha) {
      return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
    }
    if (chat.sales && typeof chat.sales === 'string') {
      try { chat.sales = JSON.parse(chat.sales); } catch { chat.sales = {}; }
    }
    try {
      if (!args.length) {
        return msg.reply(`❀ Debes especificar un personaje para comprar.\n> Ejemplo » *${usedPrefix + command} Rem*`);
      }
      const queryBuy = args.join(' ').toLowerCase();
      const idBuy = Object.keys(chat.sales || {}).find(id => (chat.sales[id]?.name || '').toLowerCase() === queryBuy);
      if (!idBuy) return msg.reply(`ꕥ No se ha encontrado al personaje *${args.join(' ')}* en venta.`);
      const venta = chat.sales[idBuy];
      if (mismaPersona(venta.user, userId)) return msg.reply(`ꕥ No puedes comprar tu propio personaje.`);
      const ahora = Date.now();
      if (ahora - venta.time >= 3 * 864e5) {
        delete chat.sales[idBuy];
        db.setChat(chatId, 'sales', chat.sales);
        return msg.reply(`ꕥ La venta de *${venta.name}* ha expirado.`);
      }
      const buyer = db.getChatUser(chatId, userId) || {};
      const saldo = buyer.coins || 0;
      const botId = botJid(sock);
      const settings = db.getSettings(botId);
      const currency = settings?.currency || 'Coins';
      if (saldo < venta.price) {
        return msg.reply(`ꕥ No tienes suficientes *${currency}* para comprar a *${venta.name}*.\n> Necesitas *¥${venta.price.toLocaleString()} ${currency}*`);
      }
      db.setCreate('chat_users', [chatId, venta.user], 'favorite', '');
      const seller = db.getChatUser(chatId, venta.user) || {};
      buyer.coins = saldo - venta.price;
      seller.coins = (seller.coins || 0) + venta.price;
      db.setChatUser(chatId, userId, 'coins', buyer.coins);
      db.setChatUser(chatId, venta.user, 'coins', seller.coins);
      const buyKey = chatId + '__' + idBuy;
      db.setCreate('characters', buyKey, 'name', venta.name);
      let character = db.getCharacter(buyKey);
      if (!character) character = { name: venta.name, value: 0, votes: 0 };
      character.user = userId;
      character.claimedAt = ahora;
      db.setCharacter(buyKey, character);
      if (!Array.isArray(buyer.characters)) buyer.characters = [];
      if (!buyer.characters.includes(idBuy)) {
        buyer.characters.push(idBuy);
        db.setChatUser(chatId, userId, 'characters', buyer.characters);
      }
      if (!Array.isArray(seller.characters)) seller.characters = [];
      seller.characters = seller.characters.filter(id => id !== idBuy);
      db.setChatUser(chatId, venta.user, 'characters', seller.characters);
      if (seller.favorite === idBuy) {
        db.setChatUser(chatId, venta.user, 'favorite', '');
        db.setUser(venta.user, 'favorite', '');
      }
      delete chat.sales[idBuy];
      db.setChat(chatId, 'sales', chat.sales);
      const vendedorGlobal = db.getUser(venta.user);
      const compradorGlobal = db.getUser(userId);
      const vendedorNombre = vendedorGlobal?.name?.trim() || venta.user.split('@')[0];
      const compradorNombre = compradorGlobal?.name?.trim() || userId.split('@')[0];
      await msg.reply(`❀ *${venta.name}* ha sido comprado por *${compradorNombre}*!\n> Se han transferido *¥${venta.price.toLocaleString()} ${currency}* a *${vendedorNombre}*`);
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};
