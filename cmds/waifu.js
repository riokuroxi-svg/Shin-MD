// Waifu — imágenes aleatorias de waifu/neko con nekos.life
export default {
  name: "waifu", aliases: ["neko"], category: "utility",
  description: "Imagen aleatoria de waifu/neko 🎴",
  usage: ".waifu o .neko", cooldown: 5,
  async handler(sock, ctx, engine) {
    const cmd = ctx.text.startsWith('.neko') ? 'neko' : 'waifu';
    try {
      const res = await fetch(`https://nekos.life/api/v2/img/${cmd}`,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}});
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      if (!data?.url) return '❌ No se pudo obtener imagen.';
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{image:{url:data.url},caption:`🎴 *${cmd}*`},{quoted:ctx.full}),{messageLength:10});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};