// AFK Time — ver tiempo AFK
import { getDatabase } from "#db";
import { isAfk } from "./afk.js";
export default {
  name: "afktime", category: "profile", description: "Ver tiempo en AFK ⏰", cooldown: 3,
  async handler(sock, ctx) {
    const target = ctx.mentions?.[0] || ctx.replyMsg?.key?.participant || ctx.senderId;
    const afk = isAfk(target);
    if (!afk) return `@${target.split('@')[0]} no está AFK.`;
    const elapsed = Math.floor((Date.now() - afk.time) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `🔇 @${target.split('@')[0]} está AFK (*${afk.reason}*) — ${mins}m ${secs}s`;
  }
};