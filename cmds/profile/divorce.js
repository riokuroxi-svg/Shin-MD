// Divorce — divorciarse
import { getDatabase } from "#db";
export default {
  name: "divorce", category: "profile", description: "Divorciarse 💔", cooldown: 10,
  async handler(sock, ctx) {
    const db = getDatabase();
    const me = db.prepare("SELECT marry FROM users WHERE jid = ?").get(ctx.senderId);
    if (!me?.marry) return '❌ No estás casad@.';
    const ex = me.marry;
    db.prepare("UPDATE users SET marry = NULL WHERE jid = ?").run(ctx.senderId);
    db.prepare("UPDATE users SET marry = NULL WHERE jid = ?").run(ex);
    return `💔 *Divorcio*\n\n@${ctx.senderId.split('@')[0]} se ha divorciado de @${ex.split('@')[0]}.\n\n_El amor terminó... 😢_`;
  }
};