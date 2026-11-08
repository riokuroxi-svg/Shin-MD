/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  soundcloud.js — Búsqueda y descarga directa desde SoundCloud
// ═══════════════════════════════════════════════════════════════════

import axios from "axios";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

const SC_SEARCH_API = "https://api-mobi.soundcloud.com/search";
const SC_CLIENT_ID = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function formatDuration(ms) {
  if (!ms) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function searchSoundCloud(query) {
  const res = await axios.get(SC_SEARCH_API, {
    params: { q: query, client_id: SC_CLIENT_ID, limit: 5 },
    headers: { "User-Agent": UA },
    timeout: 10000,
  });
  return res.data?.collection || [];
}

async function getSoundCloudDirectProgressive(track) {
  if (!track?.media?.transcodings?.length) return null;
  const progressive = track.media.transcodings.find(
    t => t.format?.protocol === "progressive" && (t.format?.mime_type?.includes("mpeg") || t.preset?.includes("mp3"))
  );
  if (progressive?.url) {
    const res = await axios.get(`${progressive.url}?client_id=${SC_CLIENT_ID}`, {
      headers: { "User-Agent": UA },
      timeout: 8000,
    });
    if (res.data?.url && /^https?:\/\//i.test(res.data.url) && !res.data.url.includes(".m3u8")) {
      return res.data.url;
    }
  }
  return null;
}

async function getSoundCloudDownload(url, track = null) {
  // 1. Probar extracción progresiva directa
  if (track) {
    try {
      const direct = await getSoundCloudDirectProgressive(track);
      if (direct) return direct;
    } catch {}
  }

  // 2. Probar API Vreden SoundCloud
  try {
    const vRes = await axios.get(`https://api.vreden.my.id/api/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 8000 });
    const vUrl = vRes.data?.result?.download_url || vRes.data?.result?.url || vRes.data?.result?.download;
    if (vUrl && /^https?:\/\//i.test(vUrl)) return vUrl;
  } catch {}

  // 3. Probar API Siputzx
  try {
    const sRes = await axios.get(`https://api.siputzx.my.id/api/d/soundcloud?url=${encodeURIComponent(url)}`, { timeout: 8000 });
    const sUrl = sRes.data?.data?.download || sRes.data?.data?.url;
    if (sUrl && /^https?:\/\//i.test(sUrl)) return sUrl;
  } catch {}

  return null;
}

export default {
  name: "playsoundcloud",
  aliases: ["playsc", "scplay", "soundcloud", "scdl"],
  category: "downloads",
  description: "Busca y descarga canciones desde SoundCloud ☁️",
  usage: ".playsc <nombre o link>",
  cooldown: 8,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return "☁️ *Play SoundCloud*\n\n" +
        "Uso: `" + (ctx.usedPrefix || ".") + "playsc <canción o link>`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "playsc Alan Walker Faded`";
    }

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });
    const isUrl = /^https?:\/\/(soundcloud\.com|on\.soundcloud\.com)\//i.test(ctx.arg.trim());

    let targetUrl = ctx.arg.trim();
    let trackInfo = null;

    const waitMsg = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Buscando en SoundCloud...*\n_" + ctx.arg.slice(0, 40) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    const key = waitMsg?.key;

    if (!isUrl) {
      try {
        const results = await searchSoundCloud(ctx.arg);
        if (!results || results.length === 0) {
          const errTxt = "❌ No se encontraron resultados en SoundCloud para: *" + ctx.arg + "*";
          if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
          return null;
        }
        trackInfo = results[0];
        targetUrl = trackInfo.permalink_url;
      } catch (err) {
        const errTxt = "❌ Error al buscar en SoundCloud: " + (err.message || err);
        if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
        return null;
      }
    }

    try {
      const audioUrl = await getSoundCloudDownload(targetUrl, trackInfo);
      if (!audioUrl) {
        const errTxt = "❌ No se pudo extraer el audio de SoundCloud. Intenta con `.play <nombre>`.";
        if (key) await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key });
        return null;
      }

      const title = trackInfo?.title || "SoundCloud Audio";
      const uploader = trackInfo?.user?.username || trackInfo?.artist || "SoundCloud";
      const duration = trackInfo ? formatDuration(trackInfo.duration) : "0:00";
      const trackSeconds = trackInfo?.duration ? Math.round(trackInfo.duration / 1000) : 0;

      let caption = `╭┈┈⫹⫺ *SOUNDCLOUD MUSIC* ⫹⫺┈┈╮\n`;
      caption += `│ ◈ *Título* : *${title}*\n`;
      caption += `│ ◈ *Artista* : *${uploader}*\n`;
      caption += `│ ◈ *Duración* : *${duration}*\n`;
      caption += `│ ◈ *Enlace* : ${targetUrl}\n`;
      caption += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;
      caption += `_⏳ Enviando audio MP3..._`;

      const thumbnail = trackInfo?.artwork_url || trackInfo?.user?.avatar_url;
      if (thumbnail) {
        try {
          await sock.sendMessage(ctx.chatId, {
            image: { url: thumbnail },
            caption,
            contextInfo: channelCtx,
          }, { quoted: ctx.full });
        } catch {}
      }

      const safeFileName = title.replace(/[/\\?*:<>|"]/g, "").slice(0, 70) + ".mp3";

      const audioMsg = await sock.sendMessage(ctx.chatId, {
        audio: { url: audioUrl },
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
      const errTxt = "❌ Error al descargar de SoundCloud: " + (err.message || err);
      if (key) {
        try { await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }); } catch {}
        return null;
      }
      return errTxt;
    }
  },
};
