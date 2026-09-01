// Waifu/Neko — imágenes waifu con waifu.pics API pública
export default {
  name: "waifu", aliases: ["neko"], category: "anime", description: "Imagen aleatoria waifu/neko 🎴", cooldown: 5,
  async handler(sock, ctx, engine) {
    const cmd = ctx.text.startsWith('.neko') || ctx.text.startsWith('!neko') ? 'neko' : 'waifu';
    try {
      const r = await fetch(`https://api.waifu.pics/sfw/${cmd}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!d?.url) return '❌ No se pudo obtener imagen.';
      await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: { url: d.url }, caption: `🎴 *${cmd}*` }, { quoted: ctx.full }), { messageLength: 10 });
      return null;
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};