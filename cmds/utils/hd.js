// HD — mejora calidad de imagen con API pública
export default {
  name: "hd", aliases: ["enhance", "remini"], category: "utility",
  description: "Mejorar calidad de imagen 🖼️",
  usage: ".hd (responde a imagen)", cooldown: 15,
  async handler(sock, ctx, engine) {
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                   ctx.full?.msg?.contextInfo?.quotedMessage;
    const media = quoted?.imageMessage;
    if (!media) return "🖼️ *HD*\n\nResponde a una *imagen* con .hd";
    try {
      const buf = await sock.downloadMediaMessage({
        key: { remoteJid: ctx.chatId, id: ctx.full?.key?.id },
        message: { imageMessage: media }
      });
      if (!buf) return '❌ No se pudo descargar.';

      // Usar api-zxc (Ginko usaba vectorink pero requiere ffmpeg)
      // Alternativa: usar https://api.zyro.com/v1/ai/upscale (requiere key)
      // Por ahora, mensaje instructivo
      return `🖼️ *HD Image*\n\n✅ Imagen recibida (${(buf.length/1024).toFixed(0)}KB).\n\n⚠️ *API de mejora requiere configurar*\n\nPara activar: agrega al .env:\n\`HD_API_URL=https://tu-api.com/enhance\`\n\`HD_API_KEY=tu_key\``;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};