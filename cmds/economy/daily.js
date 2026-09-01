import { getUserCoins, updateUserCoins, getTimer, setTimer, formatTime } from "#economy";
import { getDatabase } from "#db";
export default {
  name: "daily", aliases: ["diario","recompensa","gratis"], category: "economy", description: "Reclama tu recompensa diaria 🎁", cooldown: 3,
  async handler(sock, ctx) {
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const t=getTimer(ctx.chatId,ctx.senderId);
    if(Date.now()<t.last_daily) return `⏳ Vuelve en ${formatTime(t.last_daily-Date.now())}`;
    const u=getUserCoins(ctx.senderId); const s=(u.streak||0)+1;
    const b=Math.min(20000+(s-1)*5000,1015000);
    updateUserCoins(ctx.senderId,b); setTimer(ctx.chatId,ctx.senderId,'last_daily');
    db.prepare("UPDATE users SET streak=?,last_daily_global=?WHERE jid=?").run(s,Date.nw(),ctx.senderId);
    return `🎁 *Diario* (día ${s})
+${b.toLocaleString()} ${currency}
🔥 Vuelve mañana!`;
  }
};