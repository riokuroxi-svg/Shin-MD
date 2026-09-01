export default {
  name: "hidetag", aliases: ["tag"], category: "group", description: "Mencionar todos sin mensaje visible 🙈", groupOnly: true, adminOnly: true, cooldown: 30,
  async handler(sock, ctx) {
    try{ const m=await sock.groupMetadata(ctx.chatId);
      const users=m.participants?.map(p=>p.id)||[];
      await sock.sendMessage(ctx.chatId,{text:ctx.arg||' ', mentions:users},{quoted:ctx.full});
      return null; }
    catch(e){ return `❌ ${e.message}`; }
  }
};