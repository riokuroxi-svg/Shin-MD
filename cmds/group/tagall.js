export default {
  name: "tagall", aliases: ["todos","invocar"], category: "group", description: "Mencionar a todos 📢", groupOnly: true, adminOnly: true, cooldown: 30,
  async handler(sock, ctx) {
    try{ const m=await sock.groupMetadata(ctx.chatId);
      const users=m.participants?.map(p=>p.id)||[];
      await sock.sendMessage(ctx.chatId,{text:`📢 *${ctx.arg||'Atención'}*

${users.map(j=>'@'+j.split('@')[0]).join(' ')}`, mentions:users},{quoted:ctx.full});
      return null; }
    catch(e){ return `❌ ${e.message}`; }
  }
};