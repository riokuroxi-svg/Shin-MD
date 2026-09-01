// Level — ver nivel y experiencia
import { getDatabase } from "#db";
export default {
  name: "level", aliases: ["lvl", "nivel"], category: "profile", description: "Ver tu nivel y experiencia ⭐", cooldown: 3,
  async handler(sock, ctx) {
    const db = getDatabase();
    const target = ctx.mentions?.[0] || ctx.replyMsg?.key?.participant || ctx.senderId;
    const user = db.prepare("SELECT * FROM users WHERE jid = ?").get(target);
    if (!user) return '❌ Usuario no registrado.';
    const exp = user.exp || 0;
    const level = user.level || 0;
    const nextExp = (level + 1) * 100;
    const progress = exp > 0 ? Math.floor((exp / nextExp) * 100) : 0;
    const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
    return `⭐ *Nivel de @${target.split('@')[0]}*\n\nNivel: ${level}\nExp: ${exp}/${nextExp}\n[${bar}] ${progress}%\n\n_Los admins pueden dar exp con .addexp @user cantidad_`;
  }
};