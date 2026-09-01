// TikTok — descarga videos sin marca de agua via tikwm.com
// Sin binarios, pura API externa


export default {
  name: "tiktok",
  aliases: ["tt"],
  category: "downloads",
  description: "Descargar video de TikTok sin marca de agua 🎵",
  usage: ".tiktok <url>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `🎵 *TikTok Download*\n\nUso: \`.tiktok <url>\`\nEj: \`.tiktok https://vm.tiktok.com/xxxxx\``;
    }

    const url = ctx.arg.trim();
    if (!/tiktok\.com/.test(url)) {
      return "❌ Ese enlace no parece ser de TikTok.";
    }

    try {
      // Llamar a tikwm.com
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.tikwm.com/'
        }
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (data.code !== 0 || !data.data) {
        throw new Error(data.msg || 'Error al obtener video de TikTok');
      }

      const { title, play, playHd, wmplay, region, digg, share_count } = data.data;
      const videoUrl = playHd || play || wmplay;
      if (!videoUrl) throw new Error('No se encontró el video');

      const caption = `🎵 *TikTok Download*${title ? `\n📌 *${title.slice(0, 200)}*` : ''}\n🌎 *Región:* ${region || '?'}\n👍 *Likes:* ${digg || 0}\n🔗 *Compartidos:* ${share_count || 0}`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          video: { url: videoUrl },
          caption,
          mimetype: 'video/mp4'
        }, { quoted: ctx.full }),
        { messageLength: 100, isNewContact: false }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}. Intenta con otro enlace o mas tarde.`;
    }
  }
};