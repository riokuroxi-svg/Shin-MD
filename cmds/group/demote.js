export default {
  name: "demote", aliases: ["degradar"], category: "group", description: "Degradar admin ⬇️", groupOnly: true, adminOnly: true,
  async handler(sock, ctx) {
    if(!ctx.mentions?.length) return "❌ Menciona al usuario.";
    try{ await sock.groupParticipantsUpdate(ctx.chatId,[ctx.mentions[0]],"demote"); return "✅ Degradado."; }
    catch(e){ return `❌ ${e.message}`; }
  }
};