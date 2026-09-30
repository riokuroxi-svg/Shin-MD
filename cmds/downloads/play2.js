/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Play2 — descarga y envía video de YouTube (mp4) con Vreden / Ryzen / Multi-API fallback

import axios from "axios";
import ytdl from "@distube/ytdl-core";
import { loadYtCookies } from "#downloader";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

async function fetchMp4FromApis(url) {
  // 1. Probar Vreden ytmp4
  try {
    const res = await axios.get(`https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(url)}`, { timeout: 10000 });
    const downloadUrl = res.data?.result?.download?.url || res.data?.result?.download_url || res.data?.result?.url || res.data?.download_url;
    const title = res.data?.result?.title || res.data?.title;
    if (downloadUrl && /^https?:\/\//i.test(downloadUrl)) {
      return { url: downloadUrl, title, provider: "vreden" };
    }
  } catch {}

  // 2. Probar Ryzen ytmp4
  try {
    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(url)}`, { timeout: 10000 });
    const downloadUrl = res.data?.result?.url || res.data?.url || res.data?.data?.url;
    const title = res.data?.result?.title || res.data?.title;
    if (downloadUrl && /^https?:\/\//i.test(downloadUrl)) {
      return { url: downloadUrl, title, provider: "ryzendesu" };
    }
  } catch {}

  return null;
}

export default {
  name: "play2",
  aliases: ["mp4", "playvideo", "ytvideo", "ytmp4"],
  category: "downloads",
  description: "Descargar video de YouTube en formato MP4 📹",
  usage: ".play2 <link o query>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📹 *Play2 - Video MP4*\n\nUso: \`.play2 <link o nombre>\`\nEj: \`.play2 https://youtu.be/dQw4w9WgXcQ\``;
    }

    const query = ctx.arg.trim();
    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    const sent = await sock.sendMessage(ctx.chatId, {
      text: "⏳ *Descargando video...*\n_" + query.slice(0, 45) + "_",
      contextInfo: channelCtx,
    }, { quoted: ctx.full });

    let key = sent?.key;

    try {
      // 1. Intentar APIs externas rápidas primero (Vreden / Ryzen)
      const apiResult = await fetchMp4FromApis(query);
      if (apiResult?.url) {
        const safeTitle = (apiResult.title || "video").replace(/[/\\?*:<>|"]/g, "").slice(0, 75);
        await sock.sendMessage(ctx.chatId, {
          video: { url: apiResult.url },
          caption: `📹 *${safeTitle}*\n_Servidor: ${apiResult.provider}_`,
          fileName: `${safeTitle}.mp4`,
          contextInfo: channelCtx,
        }, { quoted: ctx.full });

        if (key) {
          try { await sock.sendMessage(ctx.chatId, { text: "✅ *Video entregado!*", edit: key }, { _priority: true }); } catch {}
        }
        return null;
      }

      // 2. Fallback a ytdl-core si es URL directa
      if (ytdl.validateURL(query)) {
        const cookies = loadYtCookies();
        const requestOptions = cookies
          ? { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } }
          : undefined;

        let title = "video";
        try {
          const info = await ytdl.getBasicInfo(query, { timeout: 10000, requestOptions });
          title = info.videoDetails?.title || "video";
        } catch {}

        const infoFull = await ytdl.getInfo(query, { quality: "lowest", requestOptions });
        const format = ytdl.chooseFormat(infoFull.formats, { quality: "lowest" });

        if (format?.url) {
          const safeTitle = title.replace(/[/\\?*:<>|"]/g, "").slice(0, 75);
          await sock.sendMessage(ctx.chatId, {
            video: { url: format.url },
            caption: `📹 *${safeTitle}*\n_Servidor: ytdl-core_`,
            fileName: `${safeTitle}.mp4`,
            contextInfo: channelCtx,
          }, { quoted: ctx.full });

          if (key) {
            try { await sock.sendMessage(ctx.chatId, { text: "✅ *Video entregado!*", edit: key }, { _priority: true }); } catch {}
          }
          return null;
        }
      }

      throw new Error("No se pudo obtener el video de los servidores.");
    } catch (err) {
      const errTxt = "❌ No se pudo descargar el video: " + (err.message || "Error desconocido");
      if (key) {
        try { await sock.sendMessage(ctx.chatId, { text: errTxt, edit: key }, { _priority: true }); } catch {}
        return null;
      }
      return errTxt;
    }
  },
};
