/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { esDuenoSocket } from "#permissions";
import db from '../../src/services/ginko-db.js';
export default {
  command: ['setbotname', 'setname'],
  category: 'socket',
  description: 'Cambiar el nombre del bot.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const idBot = botJid(sock);
    const config = db.getSettings(idBot) || {};
    if (!esDuenoSocket(sock, msg.sender, config)) return msg.reply(global.mess.socket);
    const value = args.join(' ').trim();
    if (!value) return msg.reply(`✐ Debes escribir un nombre corto y un nombre largo valido.\n> Ejemplo: *Shin / Shin-MD*`);
    const formatted = value.replace(/\s*\/\s*/g, '/');
    const [short, long] = formatted.includes('/') ? formatted.split('/') : [value, value];
    if (!short || !long) return msg.reply('✎ Usa el formato: Nombre Corto / Nombre Largo');
    if (/\s/.test(short)) return msg.reply('❖ El nombre corto no puede contener espacios.');
    db.setSettings(idBot, 'namebot', short.trim());
    db.setSettings(idBot, 'botname', long.trim());
    return msg.reply(`✿ El nombre del bot ha sido actualizado!\n\n❒ Nombre corto: *${short.trim()}*\n❒ Nombre largo: *${long.trim()}*`);
  },
};