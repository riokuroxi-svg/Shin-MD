// Play — descarga y envía audio de YouTube (mp3)
// Solución sin binarios: usa el downloader configurable por .env
// con múltiples fallbacks (ideal para BoxMine donde no hay ffmpeg).

import { getAudioUrl } from "#downloader";

export default {
  name: "play",
  aliases: ["yt", "playmp3", "musica"],
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
        "_Descarga sin ffmpeg ni binarios — servidor ligero._";
    }

    const sent = await engine.getSendQueue().enqueue(
      () => sock.sendMessage(ctx.chatId, { text: "⏳ *Buscando y descargando...*\n_" + ctx.arg.slice(0, 40) + "_" }, { quoted: ctx.full }),
      { messageLength: 30, isPriority: false }
    );

    let key;
    if (sent && sent.key) key = sent.key;

    try {
      const { url, provider } = await getAudioUrl(ctx.arg);

      // Enviar el audio (streaming desde la URL directa)
      const audioMsg = await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          audio: { url },
          mimetype: "audio/mpeg",
          ptt: false,
        }, { quoted: ctx.full }),
        { messageLength: 20, isNewContact: false }
      );

      // Editar el "buscando" a éxito (sin spam de mensajes)
      if (key) {
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, {
              text: "✅ *Listo!* · vía *" + provider + "*",
              edit: key,
            }, {}),
            { messageLength: 20, isPriority: true }
          );
        } catch {}
      }
      return audioMsg ? null : "⚠️ No se pudo enviar el audio.";
    } catch (err) {
      // Editar el "buscando" al error
      const errText = err.message && err.message.length < 400
        ? err.message
        : "❌ Error al descargar. Prueba otro enlace o inténtalo más tarde.";
      if (key) {
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, { text: errText, edit: key }, {}),
            { messageLength: errText.length, isPriority: true }
          );
        } catch {}
        return null;
      }
      return errText;
    }
  },
};
