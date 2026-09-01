// Setbirth — establecer cumpleaños
import { getDatabase } from "#db";
export default {
  name: "setbirth", aliases: [], category: "profile", description: "Establecer tu cumpleaños 🎂", cooldown: 10,
  async handler(sock, ctx) {
    if (!ctx.arg) return '🎂 Uso: .setbirth DD/MM\nEj: .setbirth 15/08';
    const db = getDatabase();
    db.prepare("UPDATE users SET birth = ? WHERE jid = ?").run(ctx.arg.trim(), ctx.senderId);
    return `🎂 Cumpleaños guardado: ${ctx.arg.trim()}`;
  }
};