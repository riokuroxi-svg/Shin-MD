// ═══════════════════════════════════════════════════════════════════
//  metaCache.js — Caché de metadatos de grupos (sin dependencias)
//  Módulo ligero e independiente para que no arrastre baileys/sqlite.
//  socket.js la llena; serialize.js la consulta para permisos de admin.
// ═══════════════════════════════════════════════════════════════════

const groupMetaCache = new Map();
const META_TTL = 300000;
const gcTimer = setInterval(() => {
  const n = Date.now();
  for (const [k, v] of groupMetaCache) if (n - v.ts > META_TTL) groupMetaCache.delete(k);
}, 600000);
if (gcTimer.unref) gcTimer.unref();

export function getCachedMeta(jid) {
  if (!jid) return null;
  const c = groupMetaCache.get(jid);
  return c && Date.now() - c.ts <= META_TTL ? c.metadata : null;
}

export function setCachedMeta(jid, metadata) {
  if (!jid) return;
  groupMetaCache.set(jid, { metadata, ts: Date.now() });
}

export function deleteCachedMeta(jid) {
  groupMetaCache.delete(jid);
}

export default { getCachedMeta, setCachedMeta, deleteCachedMeta };
