/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  spotify.js — Búsqueda y descarga directa desde Spotify en alta calidad
// ═══════════════════════════════════════════════════════════════════

import axios from "axios";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function parseDurationSeconds(durationStr, ms) {
  if (typeof ms === "number" && ms > 0) return Math.round(ms / 1000);
  if (typeof durationStr === "number" && durationStr > 0) return Math.round(durationStr);
  if (typeof durationStr === "string" && durationStr.includes(":")) {
    const parts = durationStr.split(":").map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  return 0;
}

async function searchSpotify(query) {
  try {
    const res = await axios.get(`https://my.izuka-api.xyz/api/search/spotify-search?query=${encodeURIComponent(query)}`, {
      timeout: 10000,
      headers: { "User-Agent": UA },
    });
    if (res.data?.status && Array.isArray(res.data.result) && res.data.result.length > 0) {
      return res.data.result;
    }
  } catch {}

  try {
    const res = await axios.get(`https://api.nexray.eu.cc/search/spotify?q=${encodeURIComponent(query)}`, {
      timeout: 10000,
      headers: { "User-Agent": UA },
    });
    if (res.data?.status && Array.isArray(res.data.result) && res.data.result.length > 0) {
      return res.data.result;
    }
  } catch {}

  return [];
}

async function downloadSpotifyTrack(trackUrl) {
  try {
    const res = await axios.get(`https://my.izuka-api.xyz/api/downloader/spotify?url=${encodeURIComponent(trackUrl)}`, {
      timeout: 15000,
      headers: { "User-Agent": UA },
    });
    if (res.data?.status && res.data?.result?.download_url) {
      return {
        url: res.data.result.download_url,
        title: res.data.result.title,
        artist: res.data.result.artist,
        cover: res.data.result.cover_url,
        duration: res.data.result.duration,
        provider: "Izuka Spotify",
      };
    }
  } catch {}

  try {
    const res = await axios.get(`https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(trackUrl)}`, {
      timeout: 15000,
      headers: { "User-Agent": UA },
    });
    if (res.data?.status && res.data?.result?.url) {
      return {
        url: res.data.result.url,
        title: res.data.result.title,
        artist: res.data.result.artist,
        cover: null,
        duration: null,
        provider: "Nexray Spotify",
      };
    }
  } catch {}

  return null;
}

export default {
  name: "spotify",
  aliases: ["sp", "spot", "spotifydl", "spotplay", "spdl"],
  category: "downloads",
  description: "Busca y descarga canciones de Spotify en formato MP3 🎵",
  usage: ".spotify <canción o link>",
  cooldown: 8,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx) {
    if (!ctx.arg) {
      return "🟢 *SPOTIFY MUSIC PLAYER*\n\n" +
        "Uso: `" + (ctx.usedPrefix || ".") + "spotify <canción o link>`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "spotify bad bunny monaco`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "spotify https://open.spotify.com/track/4uqSCeVrUPyz2CJlVrglOS`";
    }

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });
    const isSpotifyUrl = /^https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/i.test(ctx.arg.trim());

    let targetUrl = ctx.arg.trim();
    let trackMeta = null;

    const waitMsg = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Procesando pista de Spotify...*\n_" + ctx.arg.slice(0, 45) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    const key = waitMsg?.key;

    if (!isSpotifyUrl) {
      try {
        const results = await searchSpotify(ctx.arg);
        if (!results || results.length === 0) {
          const errTxt = "❌ No se encontraron pistas en Spotify para: *" + ctx.arg + "*";
          if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
          return null;
        }
        trackMeta = results[0];
        targetUrl = trackMeta.url;
      } catch (e) {
        const errTxt = "❌ Error al buscar en Spotify: " + e.message;
        if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
        return null;
      }
    }

    try {
      const dl = await downloadSpotifyTrack(targetUrl);
      if (!dl?.url) {
        const errTxt = "❌ No se pudo descargar la pista de Spotify. Intenta con `.play <nombre>`.";
        if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
        return null;
      }

      const title = dl.title || trackMeta?.title || "Pista Spotify";
      const artist = dl.artist || trackMeta?.artist || "Spotify";
      const duration = trackMeta?.duration || (dl.duration ? `${Math.floor(dl.duration / 60)}:${String(dl.duration % 60).padStart(2, "0")}` : "N/A");
      const cover = dl.cover || trackMeta?.thumb || trackMeta?.thumbnail;
      const trackSeconds = parseDurationSeconds(duration, (dl.duration || 0) * 1000);

      let cardText = `╭┈┈⫹⫺ *SPOTIFY DOWNLOADER* ⫹⫺┈┈╮\n`;
      cardText += `│ ◈ *Título* : *${title}*\n`;
      cardText += `│ ◈ *Artista* : *${artist}*\n`;
      cardText += `│ ◈ *Duración* : *${duration}*\n`;
      cardText += `│ ◈ *Origen* : \`Spotify High Quality\`\n`;
      cardText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;
      cardText += `_⏳ Enviando archivo de audio..._`;

      if (cover) {
        try {
          await sock.sendMessage(ctx.chatId, {
            image: { url: cover },
            caption: cardText,
            contextInfo: channelCtx,
          }, { quoted: ctx.full });
        } catch {}
      }

      const safeFileName = `${artist} - ${title}`.replace(/[/\\?*:<>|"]/g, "").slice(0, 75) + ".mp3";

      const audioMsg = await sock.sendMessage(ctx.chatId, {
        audio: { url: dl.url },
        mimetype: "audio/mpeg",
        fileName: safeFileName,
        seconds: trackSeconds,
        ptt: false,
        contextInfo: channelCtx,
      }, { quoted: ctx.full });

      if (key) {
        try {
          await sock.sendMessage(ctx.chatId, { text: "✅ *Audio entregado con éxito!*", edit: key }, { _priority: true });
        } catch {}
      }

      return audioMsg ? null : "⚠️ No se pudo enviar el archivo de audio.";
    } catch (err) {
      const errTxt = "❌ Error al descargar de Spotify: " + err.message;
      if (key) {
        try { await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }); } catch {}
        return null;
      }
      return errTxt;
    }
  },
};
