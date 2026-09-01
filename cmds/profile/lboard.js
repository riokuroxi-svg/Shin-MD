// Leaderboard — ranking de nivel/coins
import { getDatabase } from "#db";
export default {
  name: "lboard", aliases: ["lb", "leaderboard", "top"], category: "profile", description: "Ranking de usuarios 🏆", cooldown: 10,
  async handler(sock, ctx) {
    const db = getDatabase();
    const type = ctx.arg?.trim().toLowerCase() === 'coins' ? 'coins' : 'exp';
    const users = db.prepare(`SELECT jid, ${type}, level, name FROM users WHERE ${type} > 0 ORDER BY ${type} DESC LIMIT 10`).all();
    if (!users.length) return '🏆 Sin datos aún.';
    let txt = `🏆 *Top por ${type === 'coins' ? '🪙 Monedas' : '⭐ Experiencia'}*\n\n`;
    users.forEach((u, i) => {
      const name = u.name || u.jid.split('@')[0];
      txt += `${i + 1}. ${name} — ${(u[type] || 0).toLocaleString()}${type === 'exp' ? ` (lvl ${u.level || 0})` : ''}\n`;
    });
    return txt;
  }
};