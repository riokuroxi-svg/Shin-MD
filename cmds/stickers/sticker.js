// Sticker — convierte imagen a sticker WebP con metadatos
// Sin ffmpeg: usa sharp (puro Node.js nativo) + node-webpmux para EXIF
// El usuario puede configurar STICKER_PACK y STICKER_AUTHOR en .env

import sharp from 'sharp';
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

      // Procesar con Sharp: redimensionar a 512x512 y convertir a WebP
      const webpBuffer = await sharp(imgBuffer)
        .resize(STICKER_SIZE, STICKER_SIZE, {
          fit: 'cover',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();

      // Añadir EXIF metadata de WhatsApp con node-webpmux
      const img = new Image();
      await img.load(webpBuffer);

      const exifData = JSON.stringify({
        'sticker-pack-id': 'shin.md.' + Date.now(),
        'sticker-pack-name': packName,
        'sticker-pack-publisher': packAuthor,
      });
      img.exif = Buffer.from(exifData, 'utf-8');

      const finalWebp = await img.save(null); // devuelve buffer

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