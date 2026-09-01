// Delhobby — eliminar pasatiempo
import { getDatabase } from "#db";
export default {
  name: "delhobby", aliases: ["removehobby"], category: "profile", description: "Eliminar pasatiempo 🗑️", cooldown: 5,
  async handler(sock, ctx) {
    const db = getDatabase();
    db.prepare("UPDATE users SET pasatiempo = '' WHERE jid = ?").run(ctx.senderId);
    return '🗑️ Pasatiempo eliminado.';
  }
};