// ═══════════════════════════════════════════════════════════════════
//  cache.js — Caché en memoria con TTL
//  Simple, eficiente, sin dependencias externas.
// ═══════════════════════════════════════════════════════════════════

export class TtlCache {
  #map = new Map();
  #defaultTtl;

  constructor(defaultTtlMs = 300_000) {
    this.#defaultTtl = defaultTtlMs;
  }

  #isExpired(entry) {
    return Date.now() - entry.ts > entry.ttl;
  }

  get(key) {
    const e = this.#map.get(key);
    if (!e) return undefined;
    if (this.#isExpired(e)) {
      this.#map.delete(key);
      return undefined;
    }
    return e.data;
  }

  set(key, data, ttl) {
    this.#map.set(key, { data, ts: Date.now(), ttl: ttl || this.#defaultTtl });
  }

  delete(key) {
    return this.#map.delete(key);
  }

  clear() {
    this.#map.clear();
  }

  get size() {
    return this.#map.size;
  }

  /** Elimina entradas cuya key empiece por el prefijo */
  deletePrefix(prefix) {
    let count = 0;
    for (const k of this.#map.keys()) {
      if (k.startsWith(prefix)) {
        this.#map.delete(k);
        count++;
      }
    }
    return count;
  }

  /** Recolector de basura manual */
  gc() {
    const now = Date.now();
    let count = 0;
    for (const [k, v] of this.#map) {
      if (now - v.ts > v.ttl) {
        this.#map.delete(k);
        count++;
      }
    }
    return count;
  }

  /** Inicia GC automático en intervalo */
  startAutoGc(intervalMs = 120_000) {
    const id = setInterval(() => this.gc(), intervalMs);
    if (id.unref) id.unref();
    return id;
  }
}

// Singleton global
const globalCache = new TtlCache();
globalCache.startAutoGc();

/** Devuelve una caché nueva (o la global) según uso */
export function getCache(defaultTtlMs) {
  return new TtlCache(defaultTtlMs || 300_000);
}

export default globalCache;