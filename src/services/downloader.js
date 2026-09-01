// ═══════════════════════════════════════════════════════════════════
//  downloader.js — Descargas sin binarios locales (solución BoxMine)
//  · NO usa yt-dlp/ffmpeg instalados: llama a APIs HTTP públicas de
//    conversión con varios fallbacks.
//  · Configurable por .env: YT_API_URL (template con {url}) y opcional
//    YT_API_KEY. Si configuras tu propia API (o una key), es lo que se usa.
//  · Todas las APIs públicas mueren eventualmente (las de los clones ya
//    están muertas) → por eso el fallback encadenado + error claro.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

const TIMEOUT_MS = 20000;

// Proveedores por defecto (prueban en orden). Cada uno: { url, parse }
// url usa {url} como placeholder. parse(data) → URL directa del audio.
const DEFAULT_PROVIDERS = [
  {
    name: "siputzx",
    url: "https://api.siputzx.my.id/api/d/ytmp3?url={url}",
    parse: d => (d && d.data && d.data.dl) || (d && d.result && d.result.download_url) || null,
  },
  {
    name: "ryzendesu",
    url: "https://api.ryzendesu.vip/api/downloader/ytmp3?url={url}",
    parse: d => (d && d.url) || (d && d.download && d.download.url) || (d && d.data && d.data.url) || null,
  },
  {
    name: "brunosobrino",
    url: "https://api-brunosobrino.onrender.com/api/ytplay?text={url}&apikey=BrunoSobrino",
    parse: d => (d && d.data && d.data.download && d.data.download.url) ||
               (d && d.result && d.result.download_url) || null,
  },
  {
    name: "axeel",
    url: "https://axeel.my.id/api/download/audio?url={url}",
    parse: d => (d && d.downloads && d.downloads.url) || (d && d.data && d.data.url) || null,
  },
];

/**
 * Convierte una URL/canción de YouTube a URL directa de MP3.
 * @param {string} query - URL de YouTube o búsqueda de texto
 * @returns {Promise<{url: string, provider: string, title?: string}>}
 * @throws Error claro si ningún proveedor funciona
 */
export async function getAudioUrl(query) {
  const url = normalizeQuery(query);

  const customTemplate = process.env.YT_API_URL;
  const providers = [];

  if (customTemplate && customTemplate.includes("{url}")) {
    providers.push({ name: "custom", url: customTemplate, parse: parseAny });
  }
  // Si el usuario configuró una key de una API propia
  const customKey = process.env.YT_API_KEY;
  if (customKey && customTemplate) {
    providers.push({
      name: "custom-key",
      url: customTemplate.replace("{url}", url).replace("{key}", customKey),
      parse: parseAny,
    });
  }
  providers.push(...DEFAULT_PROVIDERS);

  const errors = [];
  for (const p of providers) {
    try {
      const endpoint = p.url.replace("{url}", encodeURIComponent(url));
      const res = await fetchWithTimeout(endpoint);
      const parsed = p.parse(res);
      if (parsed && /^https?:\/\//i.test(parsed)) {
        log.success("Downloader: " + p.name + " → ok");
        return { url: parsed, provider: p.name };
      }
      errors.push(p.name + ": sin URL en respuesta");
    } catch (e) {
      errors.push(p.name + ": " + (e.message || e));
    }
  }

  const msg = "❌ Ningún proveedor de descarga respondió.\n" +
    "· Configura *YT_API_URL* en .env con tu API (template con {url})\n" +
    "· O verifica conexión a internet del servidor.\n\n_" + errors.join(" · ") + "_";
  throw new Error(msg);
}

function normalizeQuery(q) {
  q = (q || "").trim();
  if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(q)) {
    if (!/^https?:\/\//i.test(q)) q = "https://" + q;
    return q;
  }
  // Búsqueda de texto: usar el propio proveedor (varios aceptan texto)
  return q;
}

function parseAny(d) {
  if (!d) return null;
  return d.url || d.dl || (d.data && (d.data.url || d.data.dl)) ||
    (d.result && (d.result.url || d.result.download_url)) ||
    (d.downloads && d.downloads.url) || null;
}

async function fetchWithTimeout(endpoint) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("respuesta no JSON (" + res.status + ")");
    }
  } finally {
    clearTimeout(timer);
  }
}

export default { getAudioUrl };
