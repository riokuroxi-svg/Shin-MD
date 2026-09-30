/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  play.js — Descarga y reproducción de música ultrarresiliente
// ═══════════════════════════════════════════════════════════════════

import { getAudioUrl } from "#downloader";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

function parseDurationSeconds(durationStr) {
  if (typeof durationStr === "number" && durationStr > 0) return Math.round(durationStr);
  if (typeof durationStr === "string" && durationStr.includes(":")) {
    const parts = durationStr.split(":").map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  return 0;
}

export default {
  name: "play",
  aliases: ["yt", "playmp3", "musica", "mp3", "playaudio", "ytaudio", "ytmp3", "music"],
  category: "downloads",
  description: "Busca, reproduce y descarga música en alta calidad 🎵",
  usage: ".play <canción o link>",
  cooldown: 8,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return "🎵 *SHIN MUSIC PLAYER*\n\n" +
        "Uso: `" + (ctx.usedPrefix || ".") + "play <canción o link>`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "play Funk Mambo Super slowed`\n\n" +
        "💡 _También puedes usar `" + (ctx.usedPrefix || ".") + "spotify <canción>` o `" + (ctx.usedPrefix || ".") + "playsc <canción>`._";
    }

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    // Si es un link de SoundCloud directo, redirigir al handler de SoundCloud
    if (/^https?:\/\/(soundcloud\.com|on\.soundcloud\.com)\//i.test(ctx.arg.trim())) {
      const scHandler = (await import("./soundcloud.js")).default;
      return scHandler.handler(sock, ctx, engine);
    }

    const waitMsg = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Buscando y procesando audio...*\n_" + ctx.arg.slice(0, 45) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    const key = waitMsg?.key;

    try {
      const result = await getAudioUrl(ctx.arg);
      const { url, provider, title, duration, author, thumbnail, views, seconds } = result;

      const trackTitle = title || "Audio Shin-MD";
      const trackAuthor = author || "Artista";
      const trackDuration = duration || "0:00";
      const trackSeconds = (typeof seconds === "number" && seconds > 0) ? seconds : parseDurationSeconds(trackDuration);
      const trackViews = views ? (typeof views === "number" ? views.toLocaleString() : String(views)) : "N/A";
      const trackThumbnail = thumbnail || null;

      let cardText = `╭┈┈⫹⫺ *SHIN MUSIC PLAYER* ⫹⫺┈┈╮\n`;
      cardText += `│ ◈ *Título* : *${trackTitle}*\n`;
      cardText += `│ ◈ *Artista* : *${trackAuthor}*\n`;
      cardText += `│ ◈ *Duración* : *${trackDuration}*\n`;
      cardText += `│ ◈ *Vistas* : *${trackViews}*\n`;
      cardText += `│ ◈ *Servidor* : \`${provider || "Multi-CDN Engine"}\`\n`;
      cardText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;
      cardText += `_⏳ Enviando archivo de audio..._`;

      if (trackThumbnail) {
        try {
          await sock.sendMessage(ctx.chatId, {
            image: { url: trackThumbnail },
            caption: cardText,
            contextInfo: channelCtx,
          }, { quoted: ctx.full });
        } catch {}
      }

      const safeFileName = `${trackAuthor} - ${trackTitle}`.replace(/[/\\?*:<>|"]/g, "").slice(0, 75) + ".mp3";

      // Intentar enviar con URL remota; si WhatsApp requiere binary buffer, descargar con timeout
      const audioPayload = {
        audio: { url },
        mimetype: "audio/mpeg",
        fileName: safeFileName,
        seconds: trackSeconds,
        ptt: false,
        contextInfo: channelCtx,
      };

      const audioMsg = await sock.sendMessage(ctx.chatId, audioPayload, { quoted: ctx.full });

      if (key) {
        try {
          await sock.sendMessage(ctx.chatId, { text: "✅ *Audio entregado con éxito!*", edit: key }, { _priority: true });
        } catch {}
      }

      return audioMsg ? null : "⚠️ No se pudo enviar el archivo de audio.";
    } catch (err) {
      const errTxt = err.message && err.message.length < 400
        ? err.message
        : "❌ Error al descargar el audio. Intenta con `.spotify <nombre>` o `.playsc <nombre>`.";
      if (key) {
        try {
          await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }, { _priority: true });
        } catch {}
        return null;
      }
      return errTxt;
    }
  },
};
