/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";
import { botJid } from "#serialize";
import { esDuenoSocket } from "#permissions";
import fs from 'fs';
import path from 'path';
import { jidDecode } from 'baileys';
import db from '../../src/services/ginko-db.js';
import { state } from '#lib/theme';

export default {
  command: ['logout'],
  category: 'socket',
  description: 'Cerrar sesión del bot.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const idBot = botJid(sock);
    const config = db.getSettings(idBot) || {};
    if (!esDuenoSocket(sock, msg.sender, config)) return sock.reply(msg.chat, global.mess.socket, msg);
    const rawId = sock.user?.id || '';
    const decoded = jidDecode(rawId);
    const cleanId = decoded?.user || rawId.split('@')[0];
    const basePath = 'Sessions';
    const sessionPath = path.join(basePath, 'Subs', cleanId);
    if (!fs.existsSync(sessionPath)) return msg.reply('《✧》 Este comando solo puede ser usado desde una instancia de Sub-Bot.');
    try {
      await msg.reply(`《✧》 Cerrando sesión del Socket...\nPuedes reconectarte usando *${usedPrefix}code*`);
      if (Array.isArray(global.conns)) {
        const idx = global.conns.indexOf(sock);
        if (idx !== -1) global.conns.splice(idx, 1);
      }
      await sock.logout();
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        log.info(`《✧》 Sesión de ${cleanId} eliminada de ${sessionPath}`);
      }
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};