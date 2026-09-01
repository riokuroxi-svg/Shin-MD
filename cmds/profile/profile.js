// Profile — ver perfil de usuario con nivel, coins, etc
import { getDatabase } from "#db";

export default {
  name: "profile", aliases: ["perfil"], category: "profile", description: "Ver tu perfil o el de alguien 👤", cooldown: 5,
  async handler(sock, ctx, engine) {
    const db = getDatabase();
    const target = ctx.mentions?.[0] || ctx.replyMsg?.key?.participant || ctx.senderId;
    const user = db.prepare("SELECT * FROM users WHERE jid = ?").get(target);
    if (!user) return '❌ Usuario no registrado.';
    const name = user.name || target.split('@')[0];
    const coins = user.coins || 0;
    const bank = user.bank || 0;
    const exp = user.exp || 0;
    const level = user.level || 0;
    const birth = user.birth || '—';
    const genre = user.genre || '—';
    const desc = user.description || '';
    const hobby = user.pasatiempo || '—';
    const marry = user.marry || null;
    let marryName = '';
    if (marry) { const p = db.prepare("SELECT name FROM users WHERE jid = ?").get(marry); marryName = p?.name || 'Alguien'; }
    const nextExp = (level + 1) * 100;
    const progress = exp > 0 ? Math.floor((exp / nextExp) * 100) : 0;

    const txt = `👤 *${name}*\n${desc ? `📝 ${desc}\n` : ''}\n` +
      `🎂 ${birth} | ⚥ ${genre} | 🎯 ${hobby}\n` +
      (marry ? `💞 Casado con: ${marryName}\n` : '') +
      `\n⭐ Nivel: ${level}\n✨ Exp: ${exp}/${nextExp} (${progress}%)\n` +
      `🪙 Cartera: ${coins.toLocaleString()}\n🏦 Banco: ${bank.toLocaleString()}`;

    try {
      const picUrl = await sock.profilePictureUrl(target, 'image').catch(() => null);
      if (picUrl) {
        await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: { url: picUrl }, caption: txt }, { quoted: ctx.full }), { messageLength: txt.length });
        return null;
      }
    } catch {}
    return txt;
  }
};