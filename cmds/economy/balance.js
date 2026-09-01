import { getUserCoins } from "#economy";
import { getDatabase } from "#db";
export default {
  name: "balance", aliases: ["bal","coins","bank"], category: "economy", description: "Ver tus monedas 🪙", cooldown: 3,
  async handler(sock, ctx) {
    const db=getDatabase(); const currency=db.settings.get("currency")||"🪙";
    const t=ctx.mentions?.[0]||ctx.replyMsg?.key?.participant||ctx.senderId;
    const u=getUserCoins(t); return `🪙 *Balance*
👛 ${(u.coins||0).toLocaleString()} ${currency}
🏦 ${(u.bank||0).toLocaleString()} ${currency}
💵 ${((u.coins||0)+(u.bank||0)).toLocaleString()} ${currency}`;
  }
};