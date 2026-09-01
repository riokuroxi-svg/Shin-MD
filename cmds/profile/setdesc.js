// Setdesc — establecer descripción de perfil
import { getDatabase } from "#db";
export default {
  name: "setdesc", aliases: ["setdescription"], category: "profile", description: "Establecer descripción 📝", cooldown: 10,
  async handler(sock, ctx) {
    if (!ctx.arg) return '📝 Uso: .setdesc <texto>';
    const db = getDatabase();
    db.prepare("UPDATE users SET description = ? WHERE jid = ?").run(ctx.arg.trim(), ctx.senderId);
    return `📝 Descripción guardada.`;
  }
};