/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import { esDuenoSocket } from "#permissions";
import sharp from 'sharp';
import db from '../../src/services/ginko-db.js';

async function resizeImage(media) {
  const img = await sharp(media)
    .resize(720, 720, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { img };
}

export default {
  command: ['setimage', 'setpfp'],
  category: 'socket',
  description: 'Cambiar la imagen de perfil del bot.',
  run: async ({ msg, sock, args }) => {
    const idBot = botJid(sock);
    const config = db.getSettings(idBot) || {};
    if (!esDuenoSocket(sock, msg.sender, config)) return msg.reply(global.mess.socket);
    const q = msg.quoted || msg;
    const mime = (q.msg || q).mimetype || q.mediaType || '';
    if (!/image/g.test(mime)) return msg.reply('✐ Debes enviar o citar una imagen para cambiar la foto de perfil del bot.');
    const media = await q.download();
    if (!media) return msg.reply('✎ No se pudo descargar la imagen.');
    if (args[1] === 'full') {
      const { img } = await resizeImage(media);
      // `attrs` nunca estuvo definido: esta rama lanzaba ReferenceError.
      await sock.query({
        tag: 'iq',
        attrs: { to: idBot, type: 'set', xmlns: 'w:profile:picture' },
        content: [{ tag: 'picture', attrs: { type: 'image' }, content: img }],
      });
    } else {
      await sock.updateProfilePicture(idBot, media);
    }
    return msg.reply(`✿ Se ha actualizado la foto de perfil de *${config.namebot || 'Bot'}*!`);
  },
};