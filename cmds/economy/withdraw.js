import { getUserCoins } from "#economy"; import { getDatabase } from "#db";
export default {
  name: "withdraw", aliases: ["with","retirar"], category: "economy", description: "Retirar monedas 💳", cooldown: 3,
  async handler(sock, ctx) {
    if(!ctx.arg)return"💳 .withdraw <cant>|all";
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const u=getUserCoins(ctx.senderId); let a=ctx.arg.trim();
    if(a==='all')a=u.bank||0; else{a=parseInt(a); if(isNaN(a)||a<=0)return'❌';}
    if(a>(u.bank||0))return `❌ Tienes ${(u.bank||0).toLocaleString()} ${currency} en banco`;
    db.prepare("UPDATE users SET coins=coins+?,bank=bank-? WHERE jid=?").run(a,a,ctx.senderId);
    return `💳 +${a.toLocaleString()} ${currency}`;
  }
};