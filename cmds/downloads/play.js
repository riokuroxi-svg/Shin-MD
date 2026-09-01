// Play — descarga y envía audio de YouTube con nombre personalizado
// Sin binarios: downloader configurable por .env con metadata vía ytsr + ytdl-core

import { getAudioUrl } from "#downloader";

export default {
  name: "play",
  aliases: ["yt", "playmp3", "musica", "mp3", "playaudio", "ytaudio", "ytmp3"],
  category: "utility",
  description: "Descarga y envía audio de YouTube 🎵",
  usage: ".play <link o canción>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return "🎵 *Play*\n\nUso: `" + ctx.text.split(/\s+/)[0] + " <link o nombre>`\n" +
        "Ej: `" + ctx.text.split(/\s+/)[0] + " never gonna give you up`\n\n" +
        "_Descarga sin ffmpeg ni binarios._\n" +
        "_Configura YT_API_URL en .env para tu propia API._";
    }

    const sent = await engine.getSendQueue().enqueue(
      () => sock.sendMessage(ctx.chatId, {
        text: "⏳ *Buscando y descargando...*\n_" + ctx.arg.slice(0, 40) + "_"
      }, { quoted: ctx.full }),
      { messageLength: 30, isPriority: false }
    );

    let key;
    if (sent && sent.key) key = sent.key;

    try {
      const result = await getAudioUrl(ctx.arg);
      const { url, provider, title, duration } = result;

      // Construir nombre de archivo desde el título
      let fileName = "audio.mp3";
      if (title) {
        fileName = title.replace(/[/\\?*:<>|"]/g, '').slice(0, 80) + ".mp3";
      }

      // Enviar el audio como documento con nombre personalizado (para que se vea el título)
      const audioMsg = await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          document: { url },
          mimetype: "audio/mpeg",
          fileName: fileName,
        }, { quoted: ctx.full }),
        { messageLength: 20, isNewContact: false }
      );

      // Editar mensaje de "buscando" a éxito
      if (key) {
        let successText = "✅ *Listo!*";
        if (title) successText += "\n📌 " + title.slice(0, 60);
        if (provider) successText += "\n⚡ " + provider;
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, { text: successText, edit: key }, {}),
            { messageLength: successText.length, isPriority: true }
          );
        } catch {}
      }
      return audioMsg ? null : "⚠️ No se pudo enviar el audio.";
    } catch (err) {
      const errTxt = err.message && err.message.length < 400
        ? err.message
        : "❌ Error al descargar. Prueba otro enlace o inténtalo más tarde.";
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
  },
};