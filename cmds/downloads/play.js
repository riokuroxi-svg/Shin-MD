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
import { searchYouTube } from "#lib/youtubeSearch";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

export default {
  name: "play",
  aliases: ["yt", "playmp3", "musica", "mp3", "playaudio", "ytaudio", "ytmp3", "music"],
  category: "downloads",
  description: "Busca, reproduce y descarga música en alta calidad 🎵",
  usage: ".play <canción o link>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return "🎵 *SHIN MUSIC PLAYER*\n\n" +
        "Uso: `" + (ctx.usedPrefix || ".") + "play <canción o link>`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "play bad bunny monaco`\n\n" +
        "💡 _También puedes usar `" + (ctx.usedPrefix || ".") + "spotify <canción>` o `" + (ctx.usedPrefix || ".") + "playsc <canción>`._";
    }

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    // Si es un link de SoundCloud, redirigir al handler de SoundCloud
    if (/^https?:\/\/(soundcloud\.com|on\.soundcloud\.com)\//i.test(ctx.arg.trim())) {
      const scHandler = (await import("./soundcloud.js")).default;
      return scHandler.handler(sock, ctx, engine);
    }

    // Buscar metadata visual antes de descargar
    let searchMeta = null;
    try {
      const s = await searchYouTube(ctx.arg);
      const list = s?.videos || (Array.isArray(s) ? s : []);
      if (list.length > 0) searchMeta = list[0];
    } catch {}

    const waitMsg = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Buscando y procesando audio...*\n_" + ctx.arg.slice(0, 45) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    let key = waitMsg?.key;

    try {
      const result = await getAudioUrl(ctx.arg);
      const { url, provider, title, duration, author, thumbnail, views } = result;

      const trackTitle = title || searchMeta?.title || "Audio Shin-MD";
      const trackAuthor = author || searchMeta?.author?.name || "YouTube Music";
      const trackDuration = duration || searchMeta?.timestamp || "0:00";
      const trackViews = views ? views.toLocaleString() : (searchMeta?.views ? searchMeta.views.toLocaleString() : "N/A");
      const trackThumbnail = thumbnail || searchMeta?.thumbnail || searchMeta?.image;

      let cardText = `╭┈┈⫹⫺ *SHIN MUSIC PLAYER* ⫹⫺┈┈╮\n`;
      cardText += `│ ◈ *Título* : *${trackTitle}*\n`;
      cardText += `│ ◈ *Artista* : *${trackAuthor}*\n`;
      cardText += `│ ◈ *Duración* : *${trackDuration}*\n`;
      cardText += `│ ◈ *Vistas* : *${trackViews}*\n`;
      cardText += `│ ◈ *Servidor* : \`${provider || "Multi-API Engine"}\`\n`;
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

      const audioMsg = await sock.sendMessage(ctx.chatId, {
        audio: { url },
        mimetype: "audio/mpeg",
        fileName: safeFileName,
        contextInfo: channelCtx,
      }, { quoted: ctx.full });

      if (key) {
        try {
          await sock.sendMessage(ctx.chatId, { text: "✅ *Audio entregado con éxito!*", edit: key }, { _priority: true });
        } catch {}
      }

      return audioMsg ? null : "⚠️ No se pudo enviar el archivo de audio.";
    } catch (err) {
      const errTxt = err.message && err.message.length < 400
        ? err.message
        : "❌ Error al descargar el audio. Intenta con `.playsc <nombre>` o prueba otra canción.";
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
