// Instagram — temporalmente fuera de servicio (API pública inestable)
// Misma política que Ginko-MD adoptó para Pinterest

export default {
  name: "instagram",
  aliases: ["ig", "reel"],
  category: "downloads",
  description: "Descargar contenido de Instagram 📸",
  usage: ".instagram <url>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    return `📸 *Instagram Download*\n\n` +
      `⚠️ *Servicio temporalmente fuera de línea.*\n\n` +
      `Las APIs gratuitas de descarga de Instagram dejaron de funcionar ` +
      `y no hay una alternativa estable sin API key en este momento.\n\n` +
      `> *Configuración futura:* Cuando encuentre una API confiable, se añadirá ` +
      `al archivo \`.env\` como \`IG_API_URL\` y \`IG_API_KEY\`.\n\n` +
      `Mientras tanto puedes usar:\n` +
      `• \`.tiktok\` para TikTok\n` +
      `• \`.play\` para música\n` +
      `• \`.imagen\` para imágenes`;
  }
};