/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { promises as fs } from 'fs';
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';
import { flattenCharacters, loadCharacters } from "#lib/gacha-shared";
import { tiempoLargo } from "#lib/tiempo";
// El aviso de "ya está listo" es de este comando: el formateo es de #lib/tiempo.
const formatTime = (ms) => (ms <= 0 || isNaN(ms) ? "Ahora" : tiempoLargo(ms));

export default {
  command: ['gachainfo', 'ginfo', 'infogacha'],
  category: 'gacha',
  description: 'Ver tu información de gacha.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    try {
      const chat = db.getChat(msg.chat);
      if (chat.adminonly || !chat.gacha) {
        return msg.reply(`ꕥ Los comandos de *Gacha* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${usedPrefix}gacha on*`);
      }
      db.setCreate('chat_users', [msg.chat, msg.sender], 'lastRoll', 0);
      db.setCreate('chat_users', [msg.chat, msg.sender], 'lastClaim', 0);
      db.setCreate('chat_users', [msg.chat, msg.sender], 'lastrobwaifu', 0);
      db.setCreate('users', msg.sender, 'lastVote', 0);
      let user = db.getChatUser(msg.chat, msg.sender);
      const userGlobal = db.getUser(msg.sender);
      const now = Date.now();
      const rollLeft = user.lastRoll && now < user.lastRoll ? user.lastRoll - now : 0;
      const claimLeft = user.lastClaim && now < user.lastClaim ? user.lastClaim - now : 0;
      const robLeft = user.lastrobwaifu && now < user.lastrobwaifu ? user.lastrobwaifu - now : 0;
      const voteLeft = userGlobal.lastVote && now < userGlobal.lastVote ? userGlobal.lastVote - now : 0;
      const structure = await loadCharacters();
      const allCharacters = flattenCharacters(structure);
      const totalCharacters = allCharacters.length;
      const totalSeries = Object.keys(structure).length;
      if (user.characters && typeof user.characters === 'string') {
        try { user.characters = JSON.parse(user.characters); } catch { user.characters = []; }
      }
      const claimedIDs = Array.isArray(user.characters) ? user.characters : [];
      let totalValue = 0;
      for (const id of claimedIDs) {
        const character = db.getCharacter(id);
        totalValue += character?.value || 0;
      }
      const userName = userGlobal?.name || msg.sender.split('@')[0];
      const replyText = `*❀ Usuario \`<${userName}>\`*\n\nⴵ RollWaifu » *${formatTime(rollLeft)}*\nⴵ Claim » *${formatTime(claimLeft)}*\nⴵ Vote » *${formatTime(voteLeft)}*\nⴵ Robwaifu » *${formatTime(robLeft)}*\n\n♡ Personajes reclamados » *${claimedIDs.length}*\n✰ Valor total » *${totalValue.toLocaleString()}*\n❏ Personajes totales » *${totalCharacters}*\n❏ Series totales » *${totalSeries}*`;
      await sock.sendMessage(msg.chat, { text: replyText.trim() }, { quoted: msg });
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};