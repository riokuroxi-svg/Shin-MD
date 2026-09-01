export default {
  name: "groupinfo", aliases: ["gp"], category: "group", description: "Información del grupo ℹ️", groupOnly: true, cooldown: 5,
  async handler(sock, ctx) {
    try{ const m=await sock.groupMetadata(ctx.chatId);
      return `ℹ️ *${m.subject}*
🆔 ${ctx.chatId}
👥 ${m.participants?.length||0} miembros
📅 Creado: ${m.creation||'?'}
👑 ${m.owner||'?'}`; }
    catch(e){ return `❌ ${e.message}`; }
  }
};