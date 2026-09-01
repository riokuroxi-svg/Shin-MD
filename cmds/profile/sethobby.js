// Sethobby — establecer pasatiempo
import { getDatabase } from "#db";
export default {
  name: "sethobby", aliases: ["setpasatiempo"], category: "profile", description: "Establecer pasatiempo 🎯", cooldown: 10,
  async handler(sock, ctx) {
    if (!ctx.arg) return '🎯 Uso: .sethobby <pasatiempo>';
    const db = getDatabase();
    db.prepare("UPDATE users SET pasatiempo = ? WHERE jid = ?").run(ctx.arg.trim(), ctx.senderId);
    return `🎯 Pasatiempo guardado.`;
  }
};