// Transferir monedas a otro usuario
import { getUserCoins } from "#economy"; import { getDatabase } from "#db";
export default {
  name: "transfer", aliases: ["pay","givecoins"], category: "economy", description: "Transferir monedas 💸", cooldown: 5,
  async handler(sock, ctx) {
    if(!ctx.arg||!ctx.mentions?.length) return "💸 .transfer @user <cant>";
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const parts=ctx.arg.trim().split(/\s+/); const amount=parseInt(parts[parts.length-1]);
    if(isNaN(amount)||amount<=0) return '❌ Cantidad inválida.';
    const target=ctx.mentions[0]; const u=getUserCoins(ctx.senderId);
    if((u.coins||0)<amount) return `❌ No tienes suficiente.`;
    db.prepare("UPDATE users SET coins=coins-? WHERE jid=?").run(amount,ctx.senderId);
    db.prepare("UPDATE users SET coins=coins+? WHERE jid=?").run(amount,target);
    return `💸 Transferido ¥${amount.toLocaleString()} ${currency} a @${target.split('@')[0]}`;
  }
};