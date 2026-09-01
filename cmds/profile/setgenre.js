// Setgenre — establecer género
import { getDatabase } from "#db";
export default {
  name: "setgenre", aliases: [], category: "profile", description: "Establecer tu género ⚥", cooldown: 10,
  async handler(sock, ctx) {
    if (!ctx.arg) return '⚥ Uso: .setgenre Hombre | Mujer | Otro';
    const db = getDatabase();
    db.prepare("UPDATE users SET genre = ? WHERE jid = ?").run(ctx.arg.trim(), ctx.senderId);
    return `⚥ Género guardado: ${ctx.arg.trim()}`;
  }
};