// Pinterest — temporalmente fuera de servicio (sin API estable)

export default {
  name: "pinterest",
  aliases: ["pin"],
  category: "downloads",
  description: "Buscar imágenes en Pinterest 📌",
  usage: ".pinterest <término>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    return `📌 *Pinterest*\n\n` +
      `⚠️ *Servicio temporalmente fuera de línea.*\n\n` +
      `Las APIs gratuitas de Pinterest dejaron de funcionar.\n` +
      `Si encuentras una API estable, se podrá añadir al .env.\n\n` +
      `Mientras tanto usa:\n` +
      `• \`.imagen\` / \`.img\` para Google Images`;
  }
};