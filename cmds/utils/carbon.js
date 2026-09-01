// Carbon — convierte código a imagen bonita estilo carbon.now.sh
export default {
  name: "carbon", aliases: ["codigoimg","codeimg"], category: "utility",
  description: "Convertir código en imagen 🎨",
  usage: ".carbon <código> o responde a código", cooldown: 10,
  async handler(sock, ctx, engine) {
    let code = ctx.arg || '';
    if (!code) {
      const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      code = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    }
    if (!code) return "🎨 *Carbon*\n\n.carbon console.log('hola')\nO responde a un mensaje con código.";
    try {
      const res = await fetch('https://carbonara.solopov.dev/api/cook', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({code, backgroundColor:'#1F816D'})
      });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{image:buf,caption:'🎨 Carbon'},{quoted:ctx.full}),{messageLength:10});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};