// Delgenre — eliminar género
import { getDatabase } from "#db";
export default {
  name: "delgenre", category: "profile", description: "Eliminar tu género 🗑️", cooldown: 5,
  async handler(sock, ctx) {
    const db = getDatabase();
    db.prepare("UPDATE users SET genre = '' WHERE jid = ?").run(ctx.senderId);
    return '🗑️ Género eliminado.';
  }
};