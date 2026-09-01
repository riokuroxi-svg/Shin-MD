// Warns — lista de warns del usuario
import { getDatabase } from "#db";
export default {
  name: "warns", category: "group", description: "Ver warns 📋", groupOnly: true, cooldown: 5,
  async handler(sock, ctx) {
    const db=getDatabase();
    const target=ctx.mentions?.[0]||ctx.replyMsg?.key?.participant||ctx.senderId;
    const warns=db.prepare("SELECT * FROM group_warns WHERE group_jid=? AND warned_jid=? ORDER BY warned_at DESC").all(ctx.chatId,target);
    if(!warns.length) return "✅ Sin warns.";
    const txt=warns.map((w,i)=>`${i+1}. ${new Date(w.warned_at).toLocaleString()} - ${w.reason||'Sin razón'}`).join('\n');
    return `📋 *Warns de @${target.split('@')[0]}*\n${txt}`;
  }
};