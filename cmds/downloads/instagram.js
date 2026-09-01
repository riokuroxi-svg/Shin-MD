// Instagram — descargar contenido de Instagram
// Usa FastSaver API (configurable con FASTSAVER_KEY en .env)
// Sin key: muestra mensaje instructivo

import { downloadSocial } from "#fastsaver";

export default {
  name: "instagram",
  aliases: ["ig", "reel"],
  category: "downloads",
  description: "Descargar contenido de Instagram 📸",
  usage: ".instagram <url>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📸 *Instagram Download*\n\nUso: \`.instagram <url>\`\nEj: \`.instagram https://www.instagram.com/reel/xxxx\``;
    }

    const url = ctx.arg.trim();
    if (!/instagram\.com\/(p|reel|tv|stories)/i.test(url)) {
      return "❌ Eso no parece un enlace válido de Instagram.";
    }

    if (!process.env.FASTSAVER_KEY) {
      return `📸 *Instagram Download*\n\n⚠️ *Requiere configurar FASTSAVER_KEY*\n\n` +
        `Instagram bloquea los scrapers públicos. Para usar este comando:\n\n` +
        `1. Ve a *api.fastsaver.io* y regístrate (gratis, 1,000 créditos/mes)\n` +
        `2. Agrega al .env: \`FASTSAVER_KEY=tu_key_aqui\`\n\n` +
        `_Con la key también funcionan Twitter, Pinterest y más._`;
    }

    try {
      const result = await downloadSocial("instagram", url);
      const caption = `📸 *Instagram*${result.title ? `\n📌 ${result.title.slice(0, 100)}` : ''}${result.author ? `\n👤 ${result.author}` : ''}`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          video: { url: result.url },
          caption,
          mimetype: 'video/mp4'
        }, { quoted: ctx.full }),
        { messageLength: 50 }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  }
};