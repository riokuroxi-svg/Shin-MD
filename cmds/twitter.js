// Twitter/X — temporalmente fuera de servicio (API pública inestable)

export default {
  name: "twitter",
  aliases: ["x"],
  category: "downloads",
  description: "Descargar contenido de Twitter/X 🐦",
  usage: ".twitter <url>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    return `🐦 *Twitter/X Download*\n\n` +
      `⚠️ *Servicio temporalmente fuera de línea.*\n\n` +
      `Las API gratuitas de descarga de Twitter/X dejaron de funcionar ` +
      `y no hay una alternativa estable sin API key en este momento.\n\n` +
      `> *Configuración futura:* Cuando encuentre una API confiable, se añadirá ` +
      `al \`.env\` como \`TW_API_URL\` y \`TW_API_KEY\`.\n\n` +
      `Mientras tanto puedes usar:\n` +
      `• \`.tiktok\` para TikTok\n` +
      `• \`.play\` para música`;
  }
};