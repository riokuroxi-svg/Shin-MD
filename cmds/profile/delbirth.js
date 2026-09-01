// Delbirth — eliminar cumpleaños
import { getDatabase } from "#db";
export default {
  name: "delbirth", category: "profile", description: "Eliminar tu cumpleaños 🗑️", cooldown: 5,
  async handler(sock, ctx) {
    const db = getDatabase();
    db.prepare("UPDATE users SET birth = ? WHERE jid = ?").run('', ctx.senderId);
    return '🗑️ Cumpleaños eliminado.';
  }
};