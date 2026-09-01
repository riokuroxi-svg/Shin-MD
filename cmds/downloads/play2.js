// Play2 — descarga y envía video de YouTube (mp4)
// Misma lógica que .play pero para video. Usa ytdl-core o APIs externas.

import { getAudioUrl } from "#downloader";
import ytdl from "ytdl-core";

export default {
  name: "play2",
  aliases: ["mp4", "playvideo", "ytvideo", "ytmp4"],
  category: "downloads",
  description: "Descargar video de YouTube 📹",
  usage: ".play2 <link>",
  cooldown: 20,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📹 *Play2 - Video*\n\nUso: \`.play2 <link de YouTube>\`\nEj: \`.play2 https://youtu.be/dQw4w9WgXcQ\``;
    }

    const query = ctx.arg.trim();
    if (!ytdl.validateURL(query)) {
      return "❌ Por favor ingresa un enlace válido de YouTube.";
    }

    const sent = await engine.getSendQueue().enqueue(
      () => sock.sendMessage(ctx.chatId, {
        text: "⏳ *Descargando video...*\n_" + query.slice(0, 40) + "_"
      }, { quoted: ctx.full }),
      { messageLength: 30 }
    );

    let key;
    if (sent && sent.key) key = sent.key;

    try {
      // Obtener info del video para metadata
      let info = null;
      let title = null;
      try {
        info = await ytdl.getBasicInfo(query, { timeout: 10000 });
        title = info.videoDetails?.title || null;
      } catch {}

      // Elegir formato de video (mp4, calidad media)
      const infoFull = await ytdl.getInfo(query, { quality: "lowest" });
      const format = ytdl.chooseFormat(infoFull.formats, { quality: "lowest" });

      if (!format?.url) throw new Error("No se encontró formato de video.");

      const fileName = title ? title.replace(/[/\\?*:<>|"]/g, '').slice(0, 80) + ".mp4" : "video.mp4";

      // Enviar video
      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          video: { url: format.url },
          mimetype: 'video/mp4',
          fileName,
        }, { quoted: ctx.full }),
        { messageLength: 20, isNewContact: false }
      );

      if (key) {
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, {
              text: `✅ *Video listo!*${title ? `\n📌 ${title.slice(0, 60)}` : ''}`,
              edit: key,
            }, {}),
            { messageLength: 50, isPriority: true }
          );
        } catch {}
      }
      return null;
    } catch (err) {
      const errTxt = err.message?.length < 400 ? err.message : "❌ Error al descargar el video.";
      if (key) {
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }, {}),
            { messageLength: errTxt.length, isPriority: true }
          );
        } catch {}
        return null;
      }
      return errTxt;
    }
  }
};