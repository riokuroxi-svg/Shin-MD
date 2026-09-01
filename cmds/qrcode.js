// QR Code — genera QR desde texto
export default {
  name: "qrcode", aliases: ["qrgen", "makeqr"], category: "utility",
  description: "Generar código QR 📱",
  usage: ".qrcode <texto>", cooldown: 5,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "📱 *QR Code*\n\nUso: `.qrcode <texto>`\nEj: `.qrcode https://github.com`";
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(ctx.arg.trim())}`;
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{image:{url},caption:`📱 *QR:* ${ctx.arg.slice(0,50)}`},{quoted:ctx.full}),{messageLength:20});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};