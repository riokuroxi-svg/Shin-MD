/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { esDuenoSocket } from "#permissions";
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';
export default {
  command: ['leave', 'salir'],
  category: 'socket',
  description: 'Salir de un grupo.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const botId = botJid(sock);
    const config = db.getSettings(botId) || {};
    if (!esDuenoSocket(sock, msg.sender, config)) return msg.reply(global.mess.socket);
    const groupId = args[0] || msg.chat;
    try {
      await sock.groupLeave(groupId);
    } catch (e) {
      return msg.reply(state('error', { detail: e.message }));
    }
  },
};