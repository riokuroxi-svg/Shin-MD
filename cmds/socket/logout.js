/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
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
    const idBot = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const config = db.getSettings(idBot) || {};
    const isOwner2 = [idBot, ...(config.owner ? [config.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return sock.reply(msg.chat, global.mess.socket, msg);
    const rawId = sock.user?.id || '';
    const decoded = jidDecode(rawId);
    const cleanId = decoded?.user || rawId.split('@')[0];
    const basePath = 'Sessions';
    const sessionPath = path.join(basePath, 'Subs', cleanId);
    if (!fs.existsSync(sessionPath)) return msg.reply('《✧》 Este comando solo puede ser usado desde una instancia de Sub-Bot.');
    try {
      await msg.reply('《✧》 Cerrando sesión del Socket...');
      await sock.logout();
      setTimeout(() => {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          console.log(`《✧》 Sesión de ${cleanId} eliminada de ${sessionPath}`);
        }
      }, 2000);
      // El await va dentro de un setTimeout: la flecha tiene que ser
      // async o es un error de sintaxis (lo cazó el auditor al cargar).
      setTimeout(async () => {
        await msg.reply(`《✧》 Sesión finalizada correctamente.\nPuedes reconectarte usando *${usedPrefix}code*`);
      }, 3000);
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};