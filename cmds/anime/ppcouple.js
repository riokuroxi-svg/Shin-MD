// PPCouple — imágenes de pareja anime
export default {
  name: "ppcouple", aliases: ["ppcp"], category: "anime", description: "Imágenes para pareja 👫", cooldown: 8,
  async handler(sock, ctx, engine) {
    try {
      const r = await fetch('https://raw.githubusercontent.com/ShirokamiRyzen/WAbot-DB/main/fitur_db/ppcp.json');
      const data = await r.json();
      const cita = data[Math.floor(Math.random() * data.length)];
      const m = await fetch(cita.cowo);
      const cowi = Buffer.from(await m.arrayBuffer());
      await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: cowi, caption: '♂ *Masculino*' }, { quoted: ctx.full }), { messageLength: 10 });
      const f = await fetch(cita.cewe);
      const ciwi = Buffer.from(await f.arrayBuffer());
      await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: ciwi, caption: '♀ *Femenino*' }, { quoted: ctx.full }), { messageLength: 10 });
      return null;
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};