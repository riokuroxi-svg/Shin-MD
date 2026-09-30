/**
import { state } from '#lib/theme';
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
export default {
  command: ['setgpbanner'],
  category: 'group',
  description: 'Cambiar la imagen del grupo.',
  isAdmin: true,
  botAdmin: true,
  run: async ({ msg, sock, usedPrefix, command }) => {
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mediaType || '';
    if (!/image/.test(mime)) {
      return msg.reply('《✧》 Te faltó la imagen para cambiar el perfil del grupo.');
    }
    const img = await q.download();
    if (!img) return msg.reply('《✧》 No se pudo descargar la imagen.');
    try {
      await sock.updateProfilePicture(msg.chat, img);
      await msg.reply('✿ La imagen del grupo se actualizó con éxito.');
    } catch (e) {
      return msg.reply(state('error', { detail: e.message }));
    }
  },
};