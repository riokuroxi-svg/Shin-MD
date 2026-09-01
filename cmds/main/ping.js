// Ping — comprueba que el bot está vivo

export default {
  name: "ping",
  aliases: ["p"],
  category: "info",
  description: "Comprueba si el bot está vivo",
  usage: ".ping",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const uptime = engine.getUptime();
    const minutes = Math.floor(uptime / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    const risk = engine.getHealth().getRiskScore();
    const queue = engine.getSendQueue().length();

    return "🏓 *Pong!*\n" +
      "╰ 📶 Tiempo activo: *" + minutes + "m " + seconds + "s*\n" +
      "╰ 🛡️ Riesgo: *" + risk + "%*\n" +
      "╰ ⏳ Cola: *" + queue + "*";
  },
};
