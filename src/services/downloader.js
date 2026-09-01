// downloader.js — Descarga de YouTube multifuente
// Metadata via ytsr + ytdl-core (puro JS). Descarga via API configurable.

import log from "#logger";
import ytsr from "ytsr";
import ytdl from "ytdl-core";

const FETCH_TIMEOUT = 20000;

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
        const info = await ytdl.getInfo(videoUrl, { quality: "lowestaudio" });
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
    "❌ No hay fuente de descarga disponible.\n" +
    "· Configura *YT_API_URL* en .env con tu API\n" +
    "· O activa *YTDL_ENABLED=1* para usar ytdl-core\n\n" +
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

  if (ytdl.validateURL(query)) {
    let title = null;
    let duration = null;
    try {
      const info = await ytdl.getBasicInfo(query, { timeout: 10000 });
      title = info.videoDetails?.title || null;
      duration = info.videoDetails?.lengthSeconds || null;
    } catch {}
    return { videoUrl: query, metadata: { title, duration } };
  }

  try {
    const results = await ytsr(query, { limit: 1 });
    const video = results.items.find(i => i.type === "video");
    if (!video || !video.url) throw new Error("No se encontraron videos para: " + query);

    return {
      videoUrl: video.url,
      metadata: {
        title: video.title || null,
        duration: video.duration || null,
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