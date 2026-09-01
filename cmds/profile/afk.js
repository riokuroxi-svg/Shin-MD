// AFK — Away From Keyboard
import { getDatabase } from "#db";
const afkUsers = new Map();
export default {
  name: "afk", category: "profile", description: "Modo ausente 🔇", cooldown: 5,
  async handler(sock, ctx) {
    const reason = ctx.arg?.trim() || 'Sin razón';
    afkUsers.set(ctx.senderId, { reason, time: Date.now() });
    return `🔇 *AFK Activado*\n\nRazón: ${reason}\n\n_Cuando te mencionen, avisaré que estás ausente._`;
  }
};
// Export for router to check AFK on mentions
export function isAfk(jid) { return afkUsers.get(jid) || null; }
export function removeAfk(jid) { afkUsers.delete(jid); }