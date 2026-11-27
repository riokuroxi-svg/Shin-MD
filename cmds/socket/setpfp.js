/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import * as Jimp from 'jimp';
import db from '../../src/services/ginko-db.js';

/**
 * Recorta al centro cuadrado y deja dos versiones de la foto.
 *
 * OJO CON LA API: jimp 1.x quitó `Jimp.read()`, `getWidth()`,
 * `getBufferAsync()` y `scaleToFit()`, que es lo que había aquí. Con la
 * librería actual (y con la 2.x) el camino es `Jimp.fromBuffer` / `read`
 * según versión, `.width`/`.height`, `.crop()` y `.getBuffer()`.
 *
 * Se prueban las dos formas: si la instalación trae jimp viejo (0.x) usa
 * la de siempre, y si trae 1.x/2.x usa la nueva. Así el comando no
 * depende de qué versión tenga cada quien instalada.
 */
async function resizeImage(media) {
  const JimpMod = Jimp.Jimp || Jimp.default || Jimp;
  const leer = Jimp.read || JimpMod.read || JimpMod.fromBuffer;
  if (typeof leer !== "function") throw new Error("esta versión de jimp no sabe leer imágenes");

  const img = await leer.call(Jimp.read ? Jimp : JimpMod, media);

  // Medidas: API nueva (.width) o vieja (getWidth()).
  const ancho = typeof img.getWidth === "function" ? img.getWidth() : img.width;
  const alto = typeof img.getHeight === "function" ? img.getHeight() : img.height;
  const lado = Math.min(ancho, alto);

  // Recorte al centro: quedarse con la esquina corta la cara.
  const x = Math.floor((ancho - lado) / 2);
  const y = Math.floor((alto - lado) / 2);

  // `crop` también cambió: la 0.x pedía (x, y, ancho, alto) y la 1.x/2.x
  // pide un objeto { x, y, w, h }. Se prueban las dos.
  let cuadrado;
  try {
    cuadrado = img.crop({ x, y, w: lado, h: lado });
  } catch {
    cuadrado = img.crop(x, y, lado, lado);
  }
  // Y `scaleToFit` igual: (ancho, alto) en la 0.x, { w, h } en la nueva.
  if (typeof cuadrado.scaleToFit === "function") {
    try {
      cuadrado.scaleToFit({ w: 720, h: 720 });
    } catch {
      cuadrado.scaleToFit(720, 720);
    }
  } else if (typeof cuadrado.resize === "function") {
    cuadrado.resize({ w: 720, h: 720 });
  }

  // Buffer: getBuffer() nuevo, getBufferAsync() viejo.
  const aBuffer = async (im) => {
    if (typeof im.getBuffer === "function") return im.getBuffer("image/jpeg", { quality: 90 });
    if (typeof im.getBufferAsync === "function") return im.getBufferAsync(Jimp.MIME_JPEG);
    throw new Error("esta versión de jimp no sabe exportar imágenes");
  };

  const img1 = await aBuffer(cuadrado);
  // La vista previa va normalizada (contraste y color equilibrados).
  if (typeof cuadrado.normalize === "function") cuadrado.normalize();
  const preview = await aBuffer(cuadrado);

  return { img: img1, preview };
}

export default {
  command: ['setimage', 'setpfp'],
  category: 'socket',
  description: 'Cambiar la imagen de perfil del bot.',
  run: async ({ msg, sock, args }) => {
    const idBot = botJid(sock);
    const config = db.getSettings(idBot) || {};
    const isOwner2 = [idBot, ...(config.owner ? [config.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')].includes(msg.sender);
    if (!isOwner2) return msg.reply(global.mess.socket);
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