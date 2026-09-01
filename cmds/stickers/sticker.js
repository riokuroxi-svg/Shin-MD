// Sticker — convierte imagen a sticker WebP con metadatos
// Sin sharp nativo: usa Jimp (puro JS) + node-webpmux para EXIF
// Funciona en Termux sin compilación
// El usuario puede configurar STICKER_PACK y STICKER_AUTHOR en .env

import Jimp from 'jimp';
import pkg from 'node-webpmux';

const { Image } = pkg;
const STICKER_SIZE = 512;

export default {
  name: "sticker",
  aliases: ["s", "stiker"],
  category: "utility",
  description: "Convertir imagen a sticker 🏷️",
  usage: ".sticker [Pack | Autor]",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                   ctx.full?.msg?.contextInfo?.quotedMessage;
    const mime = quoted?.imageMessage?.mimetype || quoted?.videoMessage?.mimetype || '';
    const isImg = mime.startsWith('image/');

    if (!isImg && !quoted?.videoMessage?.mimetype) {
      return `🏷️ *Sticker*\n\nResponde a una *imagen* con:\n\`.sticker\`\n\n` +
        `Para personalizar el nombre:\n\`.sticker MiPack | MiAutor\`\n\n` +
        `O configura \`STICKER_PACK\` y \`STICKER_AUTHOR\` en el .env`;
    }

    try {
      let imgBuffer;
      if (isImg) {
        imgBuffer = await sock.downloadMediaMessage({
          key: { remoteJid: ctx.chatId, id: ctx.full?.key?.id },
          message: { imageMessage: quoted.imageMessage }
        });
      } else {
        imgBuffer = await sock.downloadMediaMessage({
          key: { remoteJid: ctx.chatId, id: ctx.full?.key?.id },
          message: { videoMessage: quoted.videoMessage }
        });
      }

      if (!imgBuffer) return '❌ No se pudo obtener la imagen.';

      // Extraer packname y author de los argumentos
      const args = (ctx.arg || '').trim();
      let packName = process.env.STICKER_PACK || 'Shin-MD';
      let packAuthor = process.env.STICKER_AUTHOR || '@ShinBot';

      if (args) {
        const parts = args.split('|').map(p => p.trim());
        if (parts[0]) packName = parts[0];
        if (parts.length > 1 && parts[1]) packAuthor = parts[1];
      }

      // Procesar con Jimp: redimensionar a 512x512
      const image = await Jimp.read(imgBuffer);
      image.resize(STICKER_SIZE, STICKER_SIZE);

      // Obtener buffer WebP
      const webpBuffer = await image.getBufferAsync(Jimp.MIME_WEBP);

      // Añadir EXIF metadata de WhatsApp con node-webpmux
      const img = new Image();
      await img.load(webpBuffer);

      const exifData = JSON.stringify({
        'sticker-pack-id': 'shin.md.' + Date.now(),
        'sticker-pack-name': packName,
        'sticker-pack-publisher': packAuthor,
      });
      img.exif = Buffer.from(exifData, 'utf-8');

      const finalWebp = await img.save(null);

      // Enviar sticker
      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          sticker: finalWebp,
        }, { quoted: ctx.full }),
        { messageLength: 30 }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  }
};