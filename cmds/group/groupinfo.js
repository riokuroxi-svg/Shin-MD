/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { mismaPersona } from "#lib/lid";
import { loadCharacters } from "#lib/gacha-shared";
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';

export default {
  command: ['gp', 'groupinfo'],
  category: 'group',
  description: 'Ver la información del grupo.',
  groupOnly: true,
  run: async ({ msg, sock, groupMetadata, participants }) => {
    const lista = participants || [];
    const groupName = groupMetadata?.subject || 'Grupo';
    const groupCreator = groupMetadata?.owner ? '@' + groupMetadata.owner.split('@')[0] : 'Desconocido';
    const groupAdmins = lista.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const totalParticipants = lista.length;
    const chat = db.getChat(msg.chat) || {};
    const allChatUsers = db.getChatUsers(msg.chat);
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId) || {};
    const botname = botSettings.botname || global.botname || 'Shin-MD';
    const monedas = botSettings.currency || global.currency || 'Coins';
    let totalCoins = 0;
    let registeredUsersInGroup = 0;
    for (const participant of lista) {
      const fullId = participant.id;
      const user = fullId ? allChatUsers.find(u => mismaPersona(u.user_id, fullId)) : null;
      if (user) {
        registeredUsersInGroup++;
        totalCoins += Number(user.coins || 0) + Number(user.bank || 0);
      }
    }
    const structure = await loadCharacters().catch(() => ({}));
    const allCharacters = Object.values(structure).flatMap(s => Array.isArray(s.characters) ? s.characters : []);
    const totalCharacters = allCharacters.length;
    let claimedCount = 0;
    for (const user of allChatUsers) {
      let chars = user.characters;
      if (typeof chars === 'string') {
        try { chars = JSON.parse(chars); } catch { chars = []; }
      }
      if (Array.isArray(chars)) claimedCount += chars.length;
    }
    const claimRate = totalCharacters > 0 ? ((claimedCount / totalCharacters) * 100).toFixed(2) : '0.00';
    const rawPrimary = typeof chat.primaryBot === 'string' ? chat.primaryBot : '';
    const botprimary = rawPrimary ? `@${rawPrimary.split('@')[0]}` : 'Aleatorio';
    const settings = {
      bot: chat.isBanned ? '✘ Desactivado' : '✓ Activado',
      antilinks: chat.antilinks ? '✓ Activado' : '✘ Desactivado',
      antistatus: chat.antistatus ? '✓ Activado' : '✘ Desactivado',
      welcome: chat.welcome ? '✓ Activado' : '✘ Desactivado',
      goodbye: chat.goodbye ? '✓ Activado' : '✘ Desactivado',
      alerts: chat.alerts ? '✓ Activado' : '✘ Desactivado',
      gacha: chat.gacha ? '✓ Activado' : '✘ Desactivado',
      economy: chat.economy ? '✓ Activado' : '✘ Desactivado',
      nsfw: chat.nsfw ? '✓ Activado' : '✘ Desactivado',
      adminmode: chat.adminonly ? '✓ Activado' : '✘ Desactivado',
      botprimary: botprimary,
    };
    try {
      let message = `*「✿」Grupo ◢ ${groupName} ◤*\n\n`;
      message += `➪ *Creador ›* ${groupCreator}\n`;
      message += `❖ Bot Principal › *${settings.botprimary}*\n`;
      message += `♤ Admins › *${groupAdmins.length}*\n`;
      message += `❒ Usuarios › *${totalParticipants}*\n`;
      message += `ꕥ Registrados › *${registeredUsersInGroup}*\n`;
      message += `✿ Claims › *${claimedCount} (${claimRate}%)*\n`;
      message += `♡ Personajes › *${totalCharacters}*\n`;
      message += `⛁ Dinero › *${totalCoins.toLocaleString()} ${monedas}*\n\n`;
      message += `➪ *Configuraciones:*\n`;
      message += `✐ ${botname} › *${settings.bot}*\n`;
      message += `✐ AntiLinks › *${settings.antilinks}*\n`;
      message += `✐ AntiStatus › *${settings.antistatus}*\n`;
      message += `✐ Bienvenida › *${settings.welcome}*\n`;
      message += `✐ Despedida › *${settings.goodbye}*\n`;
      message += `✐ Alertas › *${settings.alerts}*\n`;
      message += `✐ Gacha › *${settings.gacha}*\n`;
      message += `✐ Economía › *${settings.economy}*\n`;
      message += `✐ Nsfw › *${settings.nsfw}*\n`;
      message += `✐ ModoAdmin › *${settings.adminmode}*`;
      const mentionOw = groupMetadata?.owner ? groupMetadata.owner : '';
      const mentions = [rawPrimary, mentionOw].filter(Boolean);
      await sock.sendMessage(msg.chat, { text: message.trim(), mentions }, { quoted: msg });
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  }
};
