/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import { state } from '#lib/theme';
export default {
  command: ['setgpname'],
  category: 'group',
  description: 'Cambiar el nombre del grupo.',
  isAdmin: true,
  botAdmin: true,
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const newName = args.join(' ').trim();
    if (!newName) {
      return msg.reply('《✧》 Por favor, ingrese el nuevo nombre que desea ponerle al grupo.');
    }
    try {
      await sock.groupUpdateSubject(msg.chat, newName);
      await msg.reply(`✿ El nombre del grupo se modificó correctamente.`);
    } catch (e) {
      return msg.reply(state('error', { detail: e.message }));
    }
  },
};