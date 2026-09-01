// Tourl — sube archivos a Catbox (alojamiento temporal 24h)
export default {
  name: "tourl", aliases: [], category: "utility",
  description: "Subir archivo a internet y obtener URL 📤",
  usage: ".tourl (responde a imagen/archivo)", cooldown: 10,
  async handler(sock, ctx, engine) {
    const quoted = ctx.full?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                   ctx.full?.msg?.contextInfo?.quotedMessage;
    const media = quoted?.imageMessage || quoted?.videoMessage || quoted?.documentMessage || quoted?.stickerMessage;
    if (!media) return "📤 *Tourl*\n\nResponde a una *imagen*, *video*, *sticker* o *documento* con `.tourl`";
    try {
      const msgType = media === quoted?.imageMessage ? 'imageMessage' :
                      media === quoted?.videoMessage ? 'videoMessage' :
                      media === quoted?.documentMessage ? 'documentMessage' : 'stickerMessage';
      const buf = await sock.downloadMediaMessage({
        key: { remoteJid: ctx.chatId, id: ctx.full?.key?.id },
        message: { [msgType]: media }
      });
      if (!buf) return '❌ No se pudo descargar el archivo.';
      const ext = (media?.mimetype || '').split('/')[1] || 'bin';
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('time', '24h');
      form.append('fileToUpload', Buffer.from(buf), { filename: `shin_${Date.now()}.${ext}` });
      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: form });
      const url = (await res.text()).trim();
      if (!url.startsWith('https://')) return '❌ Error al subir el archivo.';
      return `📤 *URL:*\n${url}\n\n_Expira en 24 horas_`;
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};