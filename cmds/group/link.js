export default {
  name: "link", category: "group", description: "Obtener link del grupo 🔗", groupOnly: true, adminOnly: true,
  async handler(sock, ctx) {
    try{ const code=await sock.groupInviteCode(ctx.chatId); return `🔗 https://chat.whatsapp.com/${code}`; }
    catch(e){ return `❌ ${e.message}`; }
  }
};