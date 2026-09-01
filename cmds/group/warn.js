import { getDatabase } from "#db";
export default {
  name: "warn", category: "group", description: "Advertir a un usuario ⚠️", groupOnly: true, adminOnly: true, cooldown: 5,
  async handler(sock, ctx) {
    if(!ctx.mentions?.length) return"⚠️ Menciona al usuario.";
    const db=getDatabase();
    const now=Date.now();
    db.prepare("INSERT INTO group_warns(group_jid,warned_jid,warner_jid,reason,warned_at) VALUES(?,?,?,?,?)").run(ctx.chatId,ctx.mentions[0],ctx.senderId,ctx.arg||'',now);
    const warns=db.prepare("SELECT COUNT(*) as c FROM group_warns WHERE group_jid=? AND warned_jid=?").get(ctx.chatId,ctx.mentions[0]);
    return `⚠️ @${ctx.mentions[0].split('@')[0]} advertido. Total: ${warns.c} warns`;
  }
};