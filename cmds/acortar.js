// Acortar — acorta URLs con TinyURL
export default {
  name: "acortar", aliases: ["shorturl", "shorten", "acorta"], category: "utility",
  description: "Acortar un enlace con TinyURL 🔗",
  usage: ".acortar <url>", cooldown: 5,
  async handler(sock, ctx) {
    if (!ctx.arg) return "🔗 *Acortar*\n\nUso: `.acortar <url>`\nEj: `.acortar https://github.com/riokuroxi-svg/Shin-MD`";
    const url = ctx.arg.trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(url)) return "❌ El enlace debe empezar con http:// o https://";
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      const short = (await res.text()).trim();
      if (!short.startsWith('http')) return "❌ No se pudo acortar.";
      return `🔗 *Acortado:*\n${short}\n\n_Original:_ ${url}`;
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};