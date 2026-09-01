// ToImg — convertir sticker WebP a imagen PNG
// Usa Jimp (puro JS, funciona en Termux sin compilación nativa)
import Jimp from 'jimp';

export default {
  name: "toimg", aliases: ["toimage"], category: "utility",
  description: "Convertir sticker a imagen 🖼️",
  usage: ".toimg (responde a un sticker)", cooldown: 10,
  async handler(sock, ctx, engine) {
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                   ctx.full?.msg?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) return "🖼️ *ToImg*\n\nResponde a un *sticker* con `.toimg`";
    try {
      const buf = await sock.downloadMediaMessage({
        key: { remoteJid: ctx.chatId, id: ctx.full?.key?.id },
        message: { stickerMessage: quoted.stickerMessage }
      });
      if (!buf) return '❌ No se pudo descargar el sticker.';
      const image = await Jimp.read(buf);
      const pngBuf = await image.getBufferAsync(Jimp.MIME_PNG);
      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, { image: pngBuf }, { quoted: ctx.full }),
        { messageLength: 10 }
      );
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};