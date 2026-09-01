import { updateUserCoins, getTimer, setTimer, formatTime, random, pickRandom } from "#economy";
import { getDatabase } from "#db";
const JOBS=["Repartidor","Diseñador","Cocinero","Profesor","Medico","Piloto","Ingeniero","Artista"];
export default {
  name: "work", aliases: ["w","trabajar","chambear"], category: "economy", description: "Gana monedas trabajando 💼", cooldown: 3,
  async handler(sock, ctx) {
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const t=getTimer(ctx.chatId,ctx.senderId);
    if(Date.now()<t.last_work) return `⏳ Espera ${formatTime(t.last_work-Date.now())}`;
    const g=random(2000,4000); updateUserCoins(ctx.senderId,g);
    setTimer(ctx.chatId,ctx.senderId,'last_work');
    return `💼 ${pickRandom(JOBS)}: +${g.toLocaleString()} ${currency}`;
  }
};