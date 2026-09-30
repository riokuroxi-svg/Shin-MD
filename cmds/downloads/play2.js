/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  play2.js — Descarga y reproducción de video (YouTube MP4 multifuente)
// ═══════════════════════════════════════════════════════════════════

import axios from "axios";
import ytdl from "@distube/ytdl-core";
import { loadYtCookies } from "#downloader";
import { searchYouTube, getYouTubeVideoId, getVideoInfoById } from "#lib/youtubeSearch";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchMp4FromApis(videoUrl) {
  // 1. Probar Izuka ytmp4
  try {
    const res = await axios.get(`https://my.izuka-api.xyz/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 12000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.download_url || res.data?.result?.url || res.data?.data?.download;
    const title = res.data?.result?.title || res.data?.title;
    if (dl && /^https?:\/\//i.test(dl)) {
      return { url: dl, title, provider: "Izuka ytmp4" };
    }
  } catch {}

  // 2. Probar Nexray ytmp4
  try {
    const res = await axios.get(`https://api.nexray.eu.cc/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 12000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.url || res.data?.result?.download_url || res.data?.data?.url;
    const title = res.data?.result?.title || res.data?.title;
    if (dl && /^https?:\/\//i.test(dl)) {
      return { url: dl, title, provider: "Nexray ytmp4" };
    }
  } catch {}

  // 3. Probar Vreden ytmp4
  try {
    const res = await axios.get(`https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 10000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.download?.url || res.data?.result?.download_url || res.data?.result?.url;
    const title = res.data?.result?.title || res.data?.title;
    if (dl && /^https?:\/\//i.test(dl)) {
      return { url: dl, title, provider: "Vreden ytmp4" };
    }
  } catch {}

  // 4. Probar Ryzen ytmp4
  try {
    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 10000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.url || res.data?.url || res.data?.data?.url;
    const title = res.data?.result?.title || res.data?.title;
    if (dl && /^https?:\/\//i.test(dl)) {
      return { url: dl, title, provider: "Ryzendesu ytmp4" };
    }
  } catch {}

  return null;
}

export default {
  name: "play2",
  aliases: ["mp4", "playvideo", "ytvideo", "ytmp4", "video"],
  category: "downloads",
  description: "Busca y descarga videos de YouTube en formato MP4 📹",
  usage: ".play2 <link o query>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx) {
    if (!ctx.arg) {
      return "📹 *SHIN VIDEO PLAYER*\n\n" +
        "Uso: `" + (ctx.usedPrefix || ".") + "play2 <link o nombre>`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "play2 bad bunny monaco`\n" +
        "Ej: `" + (ctx.usedPrefix || ".") + "play2 https://youtu.be/dQw4w9WgXcQ`";
    }

    const query = ctx.arg.trim();
    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    let targetVideoUrl = query;
    let videoTitle = "Video Shin-MD";
    let videoThumb = null;

    const directId = getYouTubeVideoId(query);
    if (directId) {
      targetVideoUrl = `https://youtu.be/${directId}`;
      try {
        const info = await getVideoInfoById(directId);
        videoTitle = info?.title || "Video YouTube";
        videoThumb = info?.thumbnail || info?.image;
      } catch {}
    } else if (!/^https?:\/\//i.test(query)) {
      try {
        const s = await searchYouTube(query, { limit: 1 });
        const list = s?.videos || (Array.isArray(s) ? s : []);
        if (list.length > 0) {
          targetVideoUrl = list[0].url || `https://youtu.be/${list[0].videoId}`;
          videoTitle = list[0].title;
          videoThumb = list[0].thumbnail || list[0].image;
        }
      } catch {}
    }

    const waitMsg = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Buscando y descargando video...*\n_" + videoTitle.slice(0, 45) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    let key = waitMsg?.key;

    try {
      // 1. Intentar APIs remotas rápidas
      const apiResult = await fetchMp4FromApis(targetVideoUrl);
      if (apiResult?.url) {
        const safeTitle = (apiResult.title || videoTitle).replace(/[/\\?*:<>|"]/g, "").slice(0, 75);
        let caption = `╭┈┈⫹⫺ *SHIN VIDEO PLAYER* ⫹⫺┈┈╮\n`;
        caption += `│ ◈ *Título* : *${safeTitle}*\n`;
        caption += `│ ◈ *Servidor* : \`${apiResult.provider}\`\n`;
        caption += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯`;

        await sock.sendMessage(ctx.chatId, {
          video: { url: apiResult.url },
          caption,
          fileName: `${safeTitle}.mp4`,
          contextInfo: channelCtx,
        }, { quoted: ctx.full });

        if (key) {
          try { await sock.sendMessage(ctx.chatId, { text: "✅ *Video entregado con éxito!*", edit: key }, { _priority: true }); } catch {}
        }
        return null;
      }

      // 2. Fallback a ytdl-core si está configurado
      if (process.env.YTDL_ENABLED === "1" || process.env.YTDL_ENABLED === "true") {
        const cookies = loadYtCookies();
        const requestOptions = cookies
          ? { headers: { Cookie: cookies, "User-Agent": UA } }
          : undefined;

        const infoFull = await ytdl.getInfo(targetVideoUrl, { quality: "lowest", requestOptions });
        const format = ytdl.chooseFormat(infoFull.formats, { quality: "lowest" });

        if (format?.url) {
          const safeTitle = (infoFull.videoDetails?.title || videoTitle).replace(/[/\\?*:<>|"]/g, "").slice(0, 75);
          let caption = `╭┈┈⫹⫺ *SHIN VIDEO PLAYER* ⫹⫺┈┈╮\n`;
          caption += `│ ◈ *Título* : *${safeTitle}*\n`;
          caption += `│ ◈ *Servidor* : \`ytdl-core direct\`\n`;
          caption += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯`;

          await sock.sendMessage(ctx.chatId, {
            video: { url: format.url },
            caption,
            fileName: `${safeTitle}.mp4`,
            contextInfo: channelCtx,
          }, { quoted: ctx.full });

          if (key) {
            try { await sock.sendMessage(ctx.chatId, { text: "✅ *Video entregado!*", edit: key }, { _priority: true }); } catch {}
          }
          return null;
        }
      }

      const errMsg = "❌ No se pudo descargar el video en este momento. Intenta con `.play <nombre>` para audio.";
      if (key) await sock.sendMessage(ctx.chatId, { text: errMsg, edit: key });
      return null;
    } catch (err) {
      const errTxt = "❌ Error al descargar video: " + err.message;
      if (key) {
        try { await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }); } catch {}
        return null;
      }
      return errTxt;
    }
  },
};
