// Sistema de fetch rápido con caché en memoria
// Usa el fetch NATIVO de Node.js (18+) que ya trae keep-alive por defecto
// para reutilizar conexiones HTTP y ahorrar 100-300ms por petición.

const fetch = globalThis.fetch;

// Cache simple en memoria con TTL (limpieza automática cada minuto)
class FastCache {
  constructor(defaultTTL = 10 * 60 * 1000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    setInterval(() => this.cleanup(), 60 * 1000).unref();
  }

  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, { value, expires: Date.now() + ttl });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) { this.cache.delete(key); return undefined; }
    return entry.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [k, v] of this.cache) if (now > v.expires) this.cache.delete(k);
  }
}

export const globalFetchCache = new FastCache(15 * 60 * 1000);

// Fast fetch con timeout y caché opcional
export async function fastFetch(url, options = {}) {
  const { cache = false, cacheKey, cacheTTL, timeout = 15000, headers = {}, ...rest } = options;
  const key = cacheKey || (cache ? (typeof url === 'string' ? url : url?.href || url?.url) : null);
  
  // Devolver de caché si existe
  if (key) {
    const cached = globalFetchCache.get(key);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: cached.headers
      });
    }
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      },
      signal: ctrl.signal,
    });

    // Guardar en caché si lo piden y la respuesta es exitosa
    if (key && res.ok && res.status === 200) {
      const ct = res.headers.get('content-type') || '';
      let bodyToCache;
      if (ct.includes('application/json')) {
        const json = await res.json();
        bodyToCache = Buffer.from(JSON.stringify(json));
        // Devolvemos una nueva respuesta que ya tiene el JSON listo
        const retRes = new Response(bodyToCache, { status: res.status, headers: res.headers });
        retRes.cachedJson = json;
        retRes.json = async () => json;
        globalFetchCache.set(key, {
          body: bodyToCache,
          status: res.status,
          headers: Object.fromEntries(res.headers)
        }, cacheTTL);
        clearTimeout(to);
        return retRes;
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        globalFetchCache.set(key, {
          body: buf,
          status: res.status,
          headers: Object.fromEntries(res.headers)
        }, cacheTTL);
        clearTimeout(to);
        return new Response(buf, { status: res.status, headers: res.headers });
      }
    }

    clearTimeout(to);
    return res;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

// ── yt-dlp: la lógica de auto-descarga/auto-reparación vive en core/lib/ytdlp.js ─
// (validación de ELF + arquitectura, extracción PyInstaller en disco, smoke-test
// con --version y auto-reparación si falla con PYI-*). Aquí solo se re-exportan
// las funciones que ya usaba el resto del bot, para no duplicar código.
export { resolveYtdlpBinary, isYtdlpAvailable } from './ytdlp.js';

export default fastFetch;
