// Marry — casarse con otro usuario
import { getDatabase } from "#db";
export default {
  name: "marry", aliases: ["casarse"], category: "profile", description: "Casarse con otro usuario 💍", cooldown: 10,
  async handler(sock, ctx) {
    if (!ctx.mentions?.length) return '💍 Menciona a tu pareja: .marry @user';
    const db = getDatabase();
    const target = ctx.mentions[0];
    const me = db.prepare("SELECT marry FROM users WHERE jid = ?").get(ctx.senderId);
    if (me?.marry) return '❌ Ya estás casad@. Divórciate con .divorce primero.';
    const them = db.prepare("SELECT marry FROM users WHERE jid = ?").get(target);
    if (them?.marry) return '❌ Esa persona ya está casada.';
    db.prepare("UPDATE users SET marry = ? WHERE jid = ?").run(target, ctx.senderId);
    db.prepare("UPDATE users SET marry = ? WHERE jid = ?").run(ctx.senderId, target);
    return `💍 *¡Felicidades!*\n\n@${ctx.senderId.split('@')[0]} ❤️ @${target.split('@')[0]}\n\n_Se han casado con éxito. Que sean muy felices._`;
  }
};