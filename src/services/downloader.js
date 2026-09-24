/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// downloader.js — Descarga de YouTube multifuente
// Búsqueda directa sin keys (vía searchYouTube) + fallback a APIs externas configurables.

import log from "#logger";
import fs from "node:fs";
import path from "node:path";
import { searchYouTube, getYouTubeVideoId, getVideoInfoById } from "#lib/youtubeSearch";
// @distube/ytdl-core: fork mantenido de ytdl-core. El original murió en
// 2024 (YouTube le tumbó el endpoint → HTTP 410, verificado en vivo).
// Misma API (getInfo/chooseFormat), recibe cookies vía requestOptions.
import ytdl from "@distube/ytdl-core";

const FETCH_TIMEOUT = 20000;
const YT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ── B3: cookies de YouTube (Netscape cookies.txt) ──────────────────
// El owner las sube con .subircookies → ./cookies.txt (o COOKIES_FILE).
// Sirven cuando la IP del servidor está marcada como bot por YouTube:
// con sesión válida deja descargar. Solo aplican al modo YTDL_ENABLED=1.
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

const DEFAULT_PROVIDERS = [
  {
    name: "nikkatools",
    url: "https://nikkatools.serv00.net/yt/audio?url={url}",
    parse: d => d?.url || d?.download_url || null,
  },
  {
    name: "ytmp3convert",
    url: "https://ytmp3convert.cc/api/yt?url={url}&format=mp3",
    parse: d => d?.url || d?.link || null,
  },
];

export async function getAudioUrl(query) {
  const { videoUrl, metadata } = await resolveVideo(query);
  if (!videoUrl) throw new Error("No se pudo resolver el video.");

  const errors = [];
  const providers = buildProviders(videoUrl);

  for (const p of providers) {
    try {
      if (p.isYtdlDirect) {
        const cookies = loadYtCookies();
        const requestOptions = cookies
          ? { headers: { Cookie: cookies, "User-Agent": YT_UA } }
          : { headers: { "User-Agent": YT_UA } };
        const info = await ytdl.getInfo(videoUrl, { quality: "lowestaudio", requestOptions });
        const format = ytdl.chooseFormat(info.formats, { quality: "lowestaudio" });
        if (format?.url) {
          log.success("Downloader: ytdl-core direct → ok");
          return { url: format.url, provider: "ytdl-core", ...(metadata || {}) };
        }
        errors.push("ytdl-core: no audio format");
        continue;
      }
      const endpoint = p.url.replace("{url}", encodeURIComponent(videoUrl));
      const res = await fetchWithTimeout(endpoint);
      const parsed = p.parse(res);
      if (parsed && /^https?:\/\//i.test(parsed)) {
        log.success("Downloader: " + p.name + " → ok");
        return { url: parsed, provider: p.name, ...(metadata || {}) };
      }
      errors.push(p.name + ": sin URL en respuesta");
    } catch (e) {
      errors.push(p.name + ": " + (e.message || e));
    }
  }

  const msg =
    "❌ No hay fuente de descarga disponible actualmente.\n" +
    "· Configura *YT_API_URL* en .env con tu API personalizada\n" +
    "· O activa *YTDL_ENABLED=1* en .env para descarga directa\n\n" +
    "_" + errors.join(" · ") + "_";
  throw new Error(msg);
}

function buildProviders(videoUrl) {
  const list = [];

  if (process.env.YTDL_ENABLED === "1" || process.env.YTDL_ENABLED === "true") {
    list.push({ name: "ytdl-local", url: null, parse: null, isYtdlDirect: true });
  }

  const template = process.env.YT_API_URL;
  if (template && template.includes("{url}")) {
    let endpoint = template.replace("{url}", encodeURIComponent(videoUrl));
    const key = process.env.YT_API_KEY;
    if (key) endpoint = endpoint.replace("{key}", key);
    list.push({
      name: "custom",
      url: endpoint,
      parse: d => d?.url || d?.dl || d?.download_url || null,
    });
  }

  list.push(...DEFAULT_PROVIDERS);
  return list;
}

async function resolveVideo(query) {
  query = (query || "").trim();
  if (!query) throw new Error("Indica un nombre o enlace de YouTube.");

  const directId = getYouTubeVideoId(query);
  if (directId) {
    const videoUrl = `https://youtu.be/${directId}`;
    try {
      const info = await getVideoInfoById(directId);
      return {
        videoUrl,
        metadata: {
          title: info?.title || "Audio YouTube",
          duration: info?.timestamp || null,
        },
      };
    } catch {
      return { videoUrl, metadata: { title: "Audio YouTube", duration: null } };
    }
  }

  try {
    const searchRes = await searchYouTube(query, { limit: 1 });
    const video = searchRes.videos?.[0];
    if (!video || !video.url) throw new Error("No se encontraron videos para: " + query);

    return {
      videoUrl: video.url,
      metadata: {
        title: video.title || null,
        duration: video.timestamp || null,
      },
    };
  } catch (e) {
    throw new Error("Búsqueda falló: " + e.message);
  }
}

async function fetchWithTimeout(endpoint) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Respuesta no JSON (" + res.status + ")");
    }
  } finally {
    clearTimeout(timer);
  }
}

export default { getAudioUrl };
