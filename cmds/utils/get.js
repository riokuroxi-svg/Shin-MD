// Get — obtiene contenido de una URL y lo muestra
export default {
  name: "get", aliases: ["fetch"], category: "utility",
  description: "Obtener contenido de una URL 🌐",
  usage: ".get <url>", cooldown: 10, ownerOnly: true,
  async handler(sock, ctx) {
    if (!ctx.arg) return "🌐 *Get*\n\nUso: `.get <url>`";
    const url = ctx.arg.trim();
    try {
      const res = await fetch(url, {headers:{'User-Agent':'Shin-MD/1.0'}});
      const text = await res.text();
      return `📡 *HTTP ${res.status}*\n\n${text.slice(0, 3500)}${text.length>3500?'\n\n_...truncado_':''}`;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};