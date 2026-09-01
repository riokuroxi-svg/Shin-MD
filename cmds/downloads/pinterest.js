// Pinterest — buscar y descargar imágenes de Pinterest
// Requiere FASTSAVER_KEY en .env (gratis en api.fastsaver.io)

import { downloadSocial } from "#fastsaver";

export default {
  name: "pinterest",
  aliases: ["pin"],
  category: "downloads",
  description: "Descargar imágenes de Pinterest 📌",
  usage: ".pinterest <url>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📌 *Pinterest Download*\n\nUso: \`.pinterest <url>\`\nEj: \`.pinterest https://pin.it/xxxxx\``;
    }

    if (!process.env.FASTSAVER_KEY) {
      return `📌 *Pinterest Download*\n\n⚠️ *Requiere configurar FASTSAVER_KEY*\n\n` +
        `Pinterest bloquea los scrapers públicos. Para usar este comando:\n\n` +
        `1. Ve a *api.fastsaver.io* y regístrate (gratis, 1,000 créditos/mes)\n` +
        `2. Agrega al .env: \`FASTSAVER_KEY=tu_key_aqui\`\n\n` +
        `_Sin key puedes usar \`.imagen\` para buscar imágenes._`;
    }

    const url = ctx.arg.trim();
    if (!/pinterest\.com|pin\.it/i.test(url)) {
      return "❌ Eso no parece un enlace válido de Pinterest.";
    }

    try {
      const result = await downloadSocial("pinterest", url);
      const caption = `📌 *Pinterest*${result.title ? `\n📌 ${result.title.slice(0, 100)}` : ''}`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          image: { url: result.url },
          caption,
        }, { quoted: ctx.full }),
        { messageLength: 40 }
      );
      return null;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  }
};