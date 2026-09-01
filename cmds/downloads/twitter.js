// Twitter/X — descargar videos de Twitter/X
// Usa fxtwitter API pública (sin key) o FastSaver si está configurado

import { downloadSocial } from "#fastsaver";

export default {
  name: "twitter",
  aliases: ["x"],
  category: "downloads",
  description: "Descargar video de Twitter/X 🐦",
  usage: ".twitter <url>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `🐦 *Twitter/X Download*\n\nUso: \`.twitter <url>\`\nEj: \`.twitter https://x.com/user/status/12345\``;
    }

    const url = ctx.arg.trim();
    if (!/(twitter|x)\.com\/\w+\/status\//i.test(url)) {
      return "❌ Eso no parece un enlace válido de Twitter/X.";
    }

    // Sin FastSaver key, intentar con fxtwitter (público)
    if (!process.env.FASTSAVER_KEY) {
      try {
        const match = url.match(/status\/(\d+)/);
        if (!match) return "❌ URL no válida.";
        const res = await fetch(`https://api.fxtwitter.com/status/${match[1]}`, {
          headers: { "User-Agent": "Shin-MD/1.0", "Accept": "application/json" }
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!data.tweet?.media?.videos?.length) {
          return "❌ No se encontró video en ese tweet (puede ser una imagen).";
        }
        const video = data.tweet.media.videos[0];
        const caption = `🐦 *Twitter/X*${data.tweet.text ? `\n📌 ${data.tweet.text.slice(0, 100)}` : ''}${data.tweet.author?.screen_name ? `\n👤 @${data.tweet.author.screen_name}` : ''}`;

        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(ctx.chatId, {
            video: { url: video.url },
            caption,
            mimetype: 'video/mp4'
          }, { quoted: ctx.full }),
          { messageLength: 50 }
        );
        return null;
      } catch (e) {
        return `❌ Error: ${e.message}\n\n💡 *Sugerencia:* Configura FASTSAVER_KEY en .env para mejor soporte (gratis en api.fastsaver.io)`;
      }
    }

    // Con FastSaver key
    try {
      const result = await downloadSocial("twitter", url);
      const caption = `🐦 *Twitter/X*${result.title ? `\n📌 ${result.title}` : ''}${result.author ? `\n👤 ${result.author}` : ''}`;

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