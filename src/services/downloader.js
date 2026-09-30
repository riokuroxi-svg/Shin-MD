/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  downloader.js (TURBO V3.2) — Motor de Descarga Ultrarrápido Multifuente
//  · Caché en memoria + disco (0ms en hits repetidos)
//  · Carrera concurrente (Promise.any) entre los CDNs más rápidos
//  · Soporte yt-dlp Turbo (-N 8) local si está disponible en VPS
//  · Fallback en cascada infalible (Spotify -> SoundCloud -> YouTube)
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { searchYouTube, getYouTubeVideoId, getVideoInfoById } from "#lib/youtubeSearch";

const exec = promisify(execFile);
const FETCH_TIMEOUT = 8000;
const YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SC_CLIENT_ID = "KKzJxmw11tYpCs6T24P4uUYhqmjalG6M";

// ── Caché Turbo en Memoria y Disco ──────────────────────────
const _memoryCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashKey(str = "") {
  return Buffer.from(String(str).toLowerCase().trim()).toString("base64url").slice(0, 32);
}

function getFromCache(key) {
  const item = _memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL_MS) {
    _memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setToCache(key, data) {
  _memoryCache.set(key, { data, ts: Date.now() });
  if (_memoryCache.size > 200) {
    const firstKey = _memoryCache.keys().next().value;
    _memoryCache.delete(firstKey);
  }
}

// ── B3: Cookies de YouTube ──────────────────────────────────
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
 * ⚡ Proveedor 1: Izuka Spotify High-Speed CDN
 */
async function resolveSpotifyIzuka(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const sRes = await fetch(`https://my.izuka-api.xyz/api/search/spotify-search?query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": YT_UA },
      signal: ctrl.signal,
    });
    const sData = await sRes.json();
    if (!sData?.status || !Array.isArray(sData.result) || sData.result.length === 0) {
      throw new Error("No Spotify tracks");
    }

    const track = sData.result[0];
    const dlRes = await fetch(`https://my.izuka-api.xyz/api/downloader/spotify?url=${encodeURIComponent(track.url)}`, {
      headers: { "User-Agent": YT_UA },
      signal: ctrl.signal,
    });
    const dlData = await dlRes.json();
    if (!dlData?.status || !dlData?.result?.download_url) {
      throw new Error("No download url");
    }

    return {
      url: dlData.result.download_url,
      title: track.title || dlData.result.title,
      author: track.artist || dlData.result.artist || "Spotify Artist",
      duration: track.duration || null,
      thumbnail: track.thumb || dlData.result.cover_url || null,
      provider: "Spotify Turbo CDN",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ⚡ Proveedor 2: Nexray Spotify CDN
 */
async function resolveSpotifyNexray(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const nRes = await fetch(`https://api.nexray.eu.cc/search/spotify?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": YT_UA },
      signal: ctrl.signal,
    });
    const nData = await nRes.json();
    if (!nData?.status || !Array.isArray(nData.result) || nData.result.length === 0) {
      throw new Error("No Nexray tracks");
    }

    const track = nData.result[0];
    const dlRes = await fetch(`https://api.nexray.eu.cc/downloader/spotify?url=${encodeURIComponent(track.url)}`, {
      headers: { "User-Agent": YT_UA },
      signal: ctrl.signal,
    });
    const dlData = await dlRes.json();
    if (!dlData?.status || !dlData?.result?.url) {
      throw new Error("No Nexray download URL");
    }

    return {
      url: dlData.result.url,
      title: track.title || dlData.result.title,
      author: track.artist || dlData.result.artist || "Spotify Artist",
      duration: track.duration || null,
      thumbnail: track.thumbnail || null,
      provider: "Nexray Turbo CDN",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ⚡ Proveedor 3: SoundCloud CDN Direct Progressive Stream
 */
async function resolveSoundCloud(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const searchRes = await fetch(`https://api-mobi.soundcloud.com/search?q=${encodeURIComponent(query)}&client_id=${SC_CLIENT_ID}&limit=5`, {
      headers: { "User-Agent": YT_UA },
      signal: ctrl.signal,
    });
    const data = await searchRes.json();
    const items = (data?.collection || []).filter(item => item.media?.transcodings?.length > 0);
    if (!items.length) throw new Error("No SC collection");

    const track = items[0];
    for (const t of track.media.transcodings) {
      try {
        const streamRes = await fetch(`${t.url}?client_id=${SC_CLIENT_ID}`, {
          headers: { "User-Agent": YT_UA },
          signal: ctrl.signal,
        });
        const streamData = await streamRes.json();
        if (streamData?.url && /^https?:\/\//i.test(streamData.url)) {
          return {
            url: streamData.url,
            title: track.title,
            author: track.user?.username || "SoundCloud",
            duration: track.duration ? `${Math.floor(track.duration / 60000)}:${String(Math.floor((track.duration % 60000) / 1000)).padStart(2, "0")}` : null,
            thumbnail: track.artwork_url || track.user?.avatar_url || null,
            provider: "SoundCloud Turbo CDN",
          };
        }
      } catch {}
    }
    throw new Error("No playable SC stream");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ⚡ Proveedor 4: yt-dlp Local Turbo (-N 8) si está instalado en el VPS
 */
let ytdlpTested = null;
async function hasYtdlp() {
  if (ytdlpTested !== null) return ytdlpTested;
  try {
    await exec(process.env.YTDLP_PATH || "yt-dlp", ["--version"], { timeout: 3000 });
    ytdlpTested = true;
  } catch {
    ytdlpTested = false;
  }
  return ytdlpTested;
}

async function resolveYtdlpLocal(videoUrl) {
  if (!(await hasYtdlp())) throw new Error("yt-dlp not available");
  const bin = process.env.YTDLP_PATH || "yt-dlp";
  const args = [
    "-N", "8",
    "-f", "bestaudio[ext=m4a]/bestaudio",
    "-g",
    "--no-playlist",
    "--extractor-args", "youtube:player_client=android,web,web_embedded",
    videoUrl,
  ];
  const { stdout } = await exec(bin, args, { timeout: 15000 });
  const streamUrl = String(stdout || "").trim().split(/\r?\n/)[0];
  if (streamUrl && /^https?:\/\//i.test(streamUrl)) {
    return {
      url: streamUrl,
      provider: "yt-dlp Turbo 8x",
    };
  }
  throw new Error("yt-dlp returned no stream url");
}

/**
 * Función Principal Turbo: Resuelve audio a máxima velocidad
 */
export async function getAudioUrl(query) {
  query = (query || "").trim();
  if (!query) throw new Error("Indica un nombre o enlace de audio.");

  // 1. Revisar Caché Turbo (0ms)
  const cKey = hashKey(query);
  const cached = getFromCache(cKey);
  if (cached) {
    log.success("Downloader: Turbo Cache Hit [0ms] ⚡");
    return cached;
  }

  let ytMetadata = null;
  let videoUrl = null;

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
    try {
      const searchRes = await searchYouTube(query, { limit: 1 });
      const list = searchRes?.videos || (Array.isArray(searchRes) ? searchRes : []);
      if (list.length > 0) {
        const top = list[0];
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

  const cleanQuery = ytMetadata?.title || query.replace(/https?:\/\/[^\s]+/gi, "").trim() || query;

  // 2. Si yt-dlp local está disponible en el servidor, probarlo primero
  if (videoUrl) {
    try {
      const localRes = await resolveYtdlpLocal(videoUrl);
      if (localRes?.url) {
        const fullData = {
          url: localRes.url,
          provider: localRes.provider,
          title: ytMetadata?.title || "Audio YouTube",
          author: ytMetadata?.author || "YouTube",
          duration: ytMetadata?.duration || null,
          thumbnail: ytMetadata?.thumbnail || null,
          views: ytMetadata?.views || null,
        };
        setToCache(cKey, fullData);
        log.success(`Downloader: ${localRes.provider} → ok ⚡`);
        return fullData;
      }
    } catch {}
  }

  // 3. Carrera Concurrente Turbo (Promise.any) entre los CDNs más rápidos
  try {
    const winner = await Promise.any([
      resolveSpotifyIzuka(cleanQuery),
      resolveSpotifyNexray(cleanQuery),
      resolveSoundCloud(cleanQuery),
    ]);

    if (winner?.url) {
      const fullData = {
        url: winner.url,
        provider: winner.provider,
        title: ytMetadata?.title || winner.title,
        author: winner.author || ytMetadata?.author || "Artista",
        duration: winner.duration || ytMetadata?.duration || null,
        thumbnail: winner.thumbnail || ytMetadata?.thumbnail || null,
        views: ytMetadata?.views || null,
      };
      setToCache(cKey, fullData);
      log.success(`Downloader: ${winner.provider} → ok ⚡`);
      return fullData;
    }
  } catch {}

  throw new Error("❌ No se pudo descargar el audio en este momento. Intenta con `.spotify <nombre>` o `.playsc <nombre>`.");
}

export default { getAudioUrl, loadYtCookies };
