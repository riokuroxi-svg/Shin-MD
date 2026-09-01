import { getUserCoins } from "#economy"; import { getDatabase } from "#db";
export default {
  name: "deposit", aliases: ["dep","d","depositar"], category: "economy", description: "Depositar monedas 🏦", cooldown: 3,
  async handler(sock, ctx) {
    if(!ctx.arg)return"🏦 .deposit <cant>|all";
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const u=getUserCoins(ctx.senderId); let a=ctx.arg.trim();
    if(a==='all')a=u.coins||0; else{a=parseInt(a); if(isNaN(a)||a<=0)return'❌';}
    if(a>(u.coins||0))return `❌ Tienes ${(u.coins||0).toLocaleString()} ${currency}`;
    db.prepare("UPDATE users SET coins=coins-?,bank=bank+? WHERE jid=?").run(a,a,ctx.senderId);
    return `🏦 +${a.toLocaleString()} ${currency}`;
  }
};