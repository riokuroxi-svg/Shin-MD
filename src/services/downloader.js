/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// downloader.js — Descarga de audio/música multifuente ultrarresiliente
// Resuelve metadatos y audio mediante cascada: Custom API -> Spotify -> SoundCloud -> YouTube Scrapers -> ytdl-core.

import log from "#logger";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { searchYouTube, getYouTubeVideoId, getVideoInfoById } from "#lib/youtubeSearch";
import ytdl from "@distube/ytdl-core";

const FETCH_TIMEOUT = 12000;
const YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SC_CLIENT_ID = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";

let cookiesWarned = false;
export function loadYtCookies() {
  try {
    const file = process.env.COOKIES_FILE || path.resolve("cookies.txt");
    if (!fs.existsSync(file)) return "";
    const raw = fs.readFileSync(file, "utf8");
    const pairs = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const f = t.split("\t");
      if (f.length < 7) continue;
      const domain = f[0], name = f[5], value = f[6];
      if (!/youtube\.com|google\.com|googlevideo\.com/i.test(domain)) continue;
      if (name) pairs.push(name + "=" + value);
    }
    if (pairs.length && !cookiesWarned) {
      cookiesWarned = true;
      log.info("Cookies de YouTube cargadas (" + pairs.length + " entradas)");
    }
    return pairs.join("; ");
  } catch { return ""; }
}

/**
 * Resuelve una canción desde Spotify (Izuka / Nexray APIs)
 */
async function resolveFromSpotify(query) {
  // 1. Izuka Spotify Search & Downloader
  try {
    const sRes = await axios.get(`https://my.izuka-api.xyz/api/search/spotify-search?query=${encodeURIComponent(query)}`, {
      timeout: 8000,
      headers: { "User-Agent": YT_UA }
    });
    if (sRes.data?.status && Array.isArray(sRes.data.result) && sRes.data.result.length > 0) {
      const track = sRes.data.result[0];
      const dlRes = await axios.get(`https://my.izuka-api.xyz/api/downloader/spotify?url=${encodeURIComponent(track.url)}`, {
        timeout: 12000,
        headers: { "User-Agent": YT_UA }
      });
      if (dlRes.data?.status && dlRes.data?.result?.download_url) {
        return {
          url: dlRes.data.result.download_url,
          title: track.title || dlRes.data.result.title,
          author: track.artist || dlRes.data.result.artist || "Spotify Artist",
          duration: track.duration || null,
          thumbnail: track.thumb || dlRes.data.result.cover_url || null,
          provider: "Spotify Izuka",
        };
      }
    }
  } catch {}

  // 2. Nexray Spotify Search & Downloader
  try {
    const nRes = await axios.get(`https://api.nexray.eu.cc/search/spotify?q=${encodeURIComponent(query)}`, {
      timeout: 8000,
      headers: { "User-Agent": YT_UA }
    });
    if (nRes.data?.status && Array.isArray(nRes.data.result) && nRes.data.result.length > 0) {
      const track = nRes.data.result[0];
      const dlRes = await axios.get(`https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(track.url)}`, {
        timeout: 12000,
        headers: { "User-Agent": YT_UA }
      });
      if (dlRes.data?.status && dlRes.data?.result?.url) {
        return {
          url: dlRes.data.result.url,
          title: track.title || dlRes.data.result.title,
          author: track.artist || dlRes.data.result.artist || "Spotify Artist",
          duration: track.duration || null,
          thumbnail: track.thumbnail || null,
          provider: "Spotify Nexray",
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Resuelve y extrae el stream de audio directo desde SoundCloud
 */
async function resolveFromSoundCloud(query) {
  try {
    const searchRes = await axios.get("https://api-mobi.soundcloud.com/search", {
      params: { q: query, client_id: SC_CLIENT_ID, limit: 5 },
      headers: { "User-Agent": YT_UA },
      timeout: 8000,
    });
    const items = (searchRes.data?.collection || []).filter(item => item.media?.transcodings?.length > 0);
    if (!items.length) return null;

    const track = items[0];
    const transcodings = track.media.transcodings;

    // Probar formatos progresivos o directos
    for (const t of transcodings) {
      try {
        const streamRes = await axios.get(`${t.url}?client_id=${SC_CLIENT_ID}`, {
          headers: { "User-Agent": YT_UA },
          timeout: 6000,
        });
        const streamUrl = streamRes.data?.url;
        if (streamUrl && /^https?:\/\//i.test(streamUrl)) {
          return {
            url: streamUrl,
            title: track.title,
            author: track.user?.username || "SoundCloud",
            duration: track.duration ? `${Math.floor(track.duration / 60000)}:${String(Math.floor((track.duration % 60000) / 1000)).padStart(2, "0")}` : null,
            thumbnail: track.artwork_url || track.user?.avatar_url || null,
            provider: "SoundCloud Engine",
          };
        }
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * Resuelve mediante APIs remotas secundarias de YouTube
 */
async function resolveFromRemoteApis(videoUrl) {
  const providers = [
    {
      name: "vreden",
      url: `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      parse: d => d?.result?.download?.url || d?.result?.download_url || d?.result?.url || d?.download_url || null,
    },
    {
      name: "ryzendesu",
      url: `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      parse: d => d?.result?.url || d?.url || d?.data?.url || d?.result?.download_url || null,
    },
    {
      name: "nikkatools",
      url: `https://nikkatools.serv00.net/yt/audio?url=${encodeURIComponent(videoUrl)}`,
      parse: d => d?.url || d?.download_url || null,
    },
    {
      name: "siputzx",
      url: `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      parse: d => d?.data?.download || d?.data?.url || d?.result?.url || null,
    },
  ];

  for (const p of providers) {
    try {
      const res = await axios.get(p.url, { timeout: 8000, headers: { "User-Agent": YT_UA } });
      const parsed = p.parse(res.data);
      if (parsed && /^https?:\/\//i.test(parsed)) {
        return { url: parsed, provider: p.name };
      }
    } catch {}
  }
  return null;
}

/**
 * Función principal para obtener URL de descarga de audio con fallback en cascada
 */
export async function getAudioUrl(query) {
  query = (query || "").trim();
  if (!query) throw new Error("Indica un nombre o enlace de audio.");

  let ytMetadata = null;
  let videoUrl = null;

  // 1. Si es link directo de YouTube, extraer ID
  const directId = getYouTubeVideoId(query);
  if (directId) {
    videoUrl = `https://youtu.be/${directId}`;
    try {
      const info = await getVideoInfoById(directId);
      ytMetadata = {
        title: info?.title || "Audio YouTube",
        author: info?.author?.name || "YouTube",
        duration: info?.timestamp || null,
        thumbnail: info?.thumbnail || info?.image || null,
        views: info?.views || null,
      };
    } catch {
      ytMetadata = { title: "Audio YouTube", author: "YouTube", duration: null, thumbnail: null };
    }
  } else if (!/^https?:\/\//i.test(query)) {
    // Es una búsqueda por texto: buscar en YouTube primero para obtener metadatos ricos
    try {
      const searchRes = await searchYouTube(query, { limit: 1 });
      const videos = searchRes?.videos || (Array.isArray(searchRes) ? searchRes : []);
      if (videos.length > 0) {
        const top = videos[0];
        videoUrl = top.url || `https://youtu.be/${top.videoId}`;
        ytMetadata = {
          title: top.title,
          author: top.author?.name || "YouTube Artist",
          duration: top.timestamp || null,
          thumbnail: top.thumbnail || top.image || null,
          views: top.views || null,
        };
      }
    } catch {}
  }

  // 2. Si hay URL personalizada en .env (YT_API_URL), probarla primero
  if (process.env.YT_API_URL && videoUrl) {
    try {
      let endpoint = process.env.YT_API_URL.replace("{url}", encodeURIComponent(videoUrl));
      if (process.env.YT_API_KEY) endpoint = endpoint.replace("{key}", process.env.YT_API_KEY);
      const res = await axios.get(endpoint, { timeout: FETCH_TIMEOUT, headers: { "User-Agent": YT_UA } });
      const dl = res.data?.url || res.data?.dl || res.data?.download_url || res.data?.result?.url;
      if (dl && /^https?:\/\//i.test(dl)) {
        log.success("Downloader: Custom API → ok");
        return {
          url: dl,
          provider: "Custom API",
          title: ytMetadata?.title || res.data?.title || query,
          author: ytMetadata?.author || res.data?.artist || "Music",
          duration: ytMetadata?.duration || res.data?.duration || null,
          thumbnail: ytMetadata?.thumbnail || res.data?.thumbnail || null,
        };
      }
    } catch {}
  }

  // 3. Cascada de resolución: Spotify -> SoundCloud -> YouTube Remotas -> ytdl-core
  const cleanSearchQuery = ytMetadata?.title || query.replace(/https?:\/\/[^\s]+/gi, "").trim() || query;

  // Intento A: Spotify Engine
  try {
    const spResult = await resolveFromSpotify(cleanSearchQuery);
    if (spResult?.url) {
      log.success("Downloader: " + spResult.provider + " → ok");
      return {
        url: spResult.url,
        provider: spResult.provider,
        title: ytMetadata?.title || spResult.title,
        author: spResult.author || ytMetadata?.author || "Music Artist",
        duration: spResult.duration || ytMetadata?.duration || null,
        thumbnail: spResult.thumbnail || ytMetadata?.thumbnail || null,
        views: ytMetadata?.views || null,
      };
    }
  } catch {}

  // Intento B: SoundCloud Engine
  try {
    const scResult = await resolveFromSoundCloud(cleanSearchQuery);
    if (scResult?.url) {
      log.success("Downloader: SoundCloud Engine → ok");
      return {
        url: scResult.url,
        provider: "SoundCloud Engine",
        title: ytMetadata?.title || scResult.title,
        author: scResult.author || ytMetadata?.author || "SoundCloud",
        duration: scResult.duration || ytMetadata?.duration || null,
        thumbnail: scResult.thumbnail || ytMetadata?.thumbnail || null,
        views: ytMetadata?.views || null,
      };
    }
  } catch {}

  // Intento C: APIs remotas de YouTube (si tenemos videoUrl)
  if (videoUrl) {
    try {
      const remoteRes = await resolveFromRemoteApis(videoUrl);
      if (remoteRes?.url) {
        log.success("Downloader: " + remoteRes.provider + " → ok");
        return {
          url: remoteRes.url,
          provider: remoteRes.provider,
          title: ytMetadata?.title || "Audio YouTube",
          author: ytMetadata?.author || "YouTube",
          duration: ytMetadata?.duration || null,
          thumbnail: ytMetadata?.thumbnail || null,
          views: ytMetadata?.views || null,
        };
      }
    } catch {}
  }

  // Intento D: ytdl-core directo si está habilitado o con cookies
  if (videoUrl && (process.env.YTDL_ENABLED === "1" || process.env.YTDL_ENABLED === "true")) {
    try {
      const cookies = loadYtCookies();
      const requestOptions = cookies
        ? { headers: { Cookie: cookies, "User-Agent": YT_UA } }
        : { headers: { "User-Agent": YT_UA } };
      const info = await ytdl.getInfo(videoUrl, { quality: "lowestaudio", requestOptions });
      const format = ytdl.chooseFormat(info.formats, { quality: "lowestaudio" });
      if (format?.url) {
        log.success("Downloader: ytdl-core direct → ok");
        return {
          url: format.url,
          provider: "ytdl-core",
          title: info.videoDetails?.title || ytMetadata?.title || "Audio",
          author: info.videoDetails?.author?.name || ytMetadata?.author || "YouTube",
          duration: info.videoDetails?.lengthSeconds ? `${Math.floor(info.videoDetails.lengthSeconds / 60)}:${String(info.videoDetails.lengthSeconds % 60).padStart(2, "0")}` : ytMetadata?.duration,
          thumbnail: ytMetadata?.thumbnail || info.videoDetails?.thumbnails?.[0]?.url || null,
        };
      }
    } catch {}
  }

  throw new Error("❌ No se pudo descargar el audio en este momento. Intenta con `.playsc <nombre>` o `.spotify <nombre>`.");
}

export default { getAudioUrl, loadYtCookies };
