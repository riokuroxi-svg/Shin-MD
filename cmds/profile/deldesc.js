// Deldesc — eliminar descripción
import { getDatabase } from "#db";
export default {
  name: "deldesc", aliases: ["deldescription"], category: "profile", description: "Eliminar descripción 🗑️", cooldown: 5,
  async handler(sock, ctx) {
    const db = getDatabase();
    db.prepare("UPDATE users SET description = ? WHERE jid = ?").run('', ctx.senderId);
    return '🗑️ Descripción eliminada.';
  }
};