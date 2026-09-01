// YouTube Search — busca videos en YouTube usando ytsr (puro JS, sin API key)

import ytsr from 'ytsr';

export default {
  name: "ytsearch",
  aliases: ["search", "ys"],
  category: "downloads",
  description: "Buscar videos en YouTube 🔍",
  usage: ".ytsearch <término>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `🔍 *YouTube Search*\n\nUso: \`.ytsearch <término>\`\nEj: \`.ytsearch never gonna give you up\``;
    }

    try {
      const results = await ytsr(ctx.arg, { limit: 6 });
      const videos = results.items.filter(i => i.type === 'video').slice(0, 5);
      
      if (!videos.length) return '❌ No encontré resultados.';

      let text = `🔍 *YouTube Search:* ${ctx.arg}\n\n`;
      videos.forEach((v, i) => {
        text += `${i + 1}. *${v.title}*\n`;
        text += `   ⏱ ${v.duration} | 👁 ${v.views || 'N/A'} | 📅 ${v.uploadedAt || '?'}\n`;
        text += `   🔗 ${v.url}\n\n`;
      });
      text += `_Usa .play <link> para descargar el audio._`;

      // Intentar enviar thumbnail del primer video
      if (videos[0].bestThumbnail?.url) {
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, {
              image: { url: videos[0].bestThumbnail.url },
              caption: text
            }, { quoted: ctx.full }),
            { messageLength: text.length }
          );
          return null;
        } catch {}
      }

      return text;
    } catch (err) {
      return `❌ Error en búsqueda: ${err.message}`;
    }
  }
};