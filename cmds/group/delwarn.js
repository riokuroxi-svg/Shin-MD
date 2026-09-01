// Delwarn — eliminar warns de un usuario
import { getDatabase } from "#db";
export default {
  name: "delwarn", category: "group", description: "Eliminar warns 🗑️", groupOnly: true, adminOnly: true, cooldown: 5,
  async handler(sock, ctx) {
    const db=getDatabase();
    const target=ctx.mentions?.[0]||ctx.replyMsg?.key?.participant||ctx.senderId;
    db.prepare("DELETE FROM group_warns WHERE group_jid=? AND warned_jid=?").run(ctx.chatId,target);
    return "✅ Warns eliminados.";
  }
};