export default {
  name: "promote", aliases: ["promover"], category: "group", description: "Promover a admin 👑", groupOnly: true, adminOnly: true,
  async handler(sock, ctx) {
    if(!ctx.mentions?.length) return "❌ Menciona al usuario.";
    try{ await sock.groupParticipantsUpdate(ctx.chatId,[ctx.mentions[0]],"promote"); return "✅ Promovido."; }
    catch(e){ return `❌ ${e.message}`; }
  }
};