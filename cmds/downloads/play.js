/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
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

    // sock.sendMessage encola SOLO en la cola anti-ban del socket
    // (encolar manualmente y lladar a sock.sendMessage dentro DEADLOCKEA
    // la cola serial: la tarea exterior espera a la interior, que nunca
    // se procesa mientras la exterior está "en uso").
    const sent = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Buscando y descargando...*\n_" + ctx.arg.slice(0, 40) + "_"
    }, { quoted: ctx.full });

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
      const audioMsg = await sock.sendMessage(ctx.chatId, {
        document: { url },
        mimetype: "audio/mpeg",
        fileName: fileName,
      }, { quoted: ctx.full });

      // Editar mensaje de "buscando" a éxito
      if (key) {
        let successText = "✅ *Listo!*";
        if (title) successText += "\n📌 " + title.slice(0, 60);
        if (provider) successText += "\n⚡ " + provider;
        try {
          await sock.sendMessage(ctx.chatId, { text: successText, edit: key }, {});
        } catch {}
      }
      return audioMsg ? null : "⚠️ No se pudo enviar el audio.";
    } catch (err) {
      const errTxt = err.message && err.message.length < 400
        ? err.message
        : "❌ Error al descargar. Prueba otro enlace o inténtalo más tarde.";
      if (key) {
        try {
          await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }, {});
        } catch {}
        return null;
      }
      return errTxt;
    }
  },
};