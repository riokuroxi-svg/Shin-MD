export default {
  name: "kick", aliases: ["ban","bang"], category: "group", description: "Eliminar usuario 👢", groupOnly: true, adminOnly: true,
  async handler(sock, ctx) {
    if(!ctx.mentions?.length) return "❌ Menciona al usuario.";
    try{ await sock.groupParticipantsUpdate(ctx.chatId,[ctx.mentions[0]],"remove"); return "✅ Eliminado."; }
    catch(e){ return `❌ ${e.message}`; }
  }
};