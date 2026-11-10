/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { esDuenoSocket } from "#permissions";
import { startSubBot } from './subs.js';
import fs from 'fs';
import path from 'path';
import { jidDecode } from 'baileys';
import db from '../../src/services/ginko-db.js';

export default {
  command: ['reload'],
  category: 'socket',
  description: 'Recargar la sesión del bot.',
  run: async ({ msg, sock, args }) => {
    const botId = botJid(sock);
    const botSettings = db.getSettings(botId) || {};
    if (!esDuenoSocket(sock, msg.sender, botSettings)) {
      return sock.reply(msg.chat, '《✧》 Este comando solo puede ser ejecutado por un Socket.', msg);
    }
    const rawId = sock.user?.id || '';
    const decoded = jidDecode(rawId);
    const cleanId = decoded?.user || rawId.split('@')[0];
    const sessionPath = path.join('Sessions', 'Subs', cleanId);
    if (!fs.existsSync(sessionPath)) {
      return msg.reply('《✧》 Este comando solo puede ser usado desde una instancia de Sub-Bot.');
    }
    const caption = '✿ *Sesión del bot reiniciada correctamente!*.';
    const phone = args[0] ? args[0].replace(/\D/g, '') : msg.sender.split('@')[0];
    await startSubBot(msg, sock, caption, false, phone, msg.chat, true);
    await sock.reply(msg.chat, caption, msg);
  },
};
