// Owner — muestra contacto del dueño

export default {
  name: "owner",
  aliases: ["creator", "creador", "dueño", "dev"],
  category: "info",
  description: "Contacto del dueño del bot",
  usage: ".owner",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const ownerJid = engine.getOwnerJid() || "";
    const num = ownerJid.split("@")[0] || "";
    const name = process.env.OWNER_NAME || "反魂";

    return "👑 *Owner* · 反魂 Shin-MD\n" +
      "╭───────────────────\n" +
      "│  🧑‍💻 *Nombre:* " + name + "\n" +
      "│  📱 *Número:* +" + num + "\n" +
      "│  🏷️ *Bot:* Shin-MD (AGPL-3.0)\n" +
      "╰────「 反魂 」────\n\n" +
      "_Bot construido desde cero, anti-ban nativo._";
  },
};
