// ginko-stubs.js — Stubs minimos para imports de Ginko en Shin-MD
import { getCachedMeta, setCachedMeta, deleteCachedMeta } from "#metaCache";

export function normalizeJid(raw) {
  if (!raw) return null;
  if (typeof raw !== "string") raw = String(raw);
  raw = raw.trim();
  if (raw.includes("@")) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length >= 4 && d.length <= 15) return d + "@s.whatsapp.net";
  return raw;
}
export function resolveParticipantJid(p) { return p ? (p.id || p.jid || p.phoneNumber || null) : null; }
export function resolveJidSync(r) { return normalizeJid(r); }
export { getCachedMeta, setCachedMeta, deleteCachedMeta };
export class BoundedMap extends Map {
  constructor(m, t) { super(); this.max = m; this.ttl = t || 0; }
  set(k, v) { if (this.size >= this.max) this.delete(this.keys().next().value); return super.set(k, v); }
}
export async function getBuffer(url) {
  const r = await fetch(url); return Buffer.from(await r.arrayBuffer());
}

export async function fastFetch(url, o) {
  const a = await import("axios");
  const r = await a.default.get(url, { responseType: "arraybuffer", timeout: (o && o.timeout) || 15000 });
  return { ok: r.status < 400, status: r.status, arrayBuffer: () => r.data };
}
export function getBreakerStatus() { return { isOpen: false }; }
export function resetBreaker() {}
export function runGuarded(fn) { return fn(); }
export function isYtdlpAvailable() { return false; }
export function resolveYtdlpBinary() { return null; }

export function bodyMenu() { return "Menu no disponible"; }
export const menuObject = [];
export function getSelectedResponse() { return null; }
export async function geminiGenerate() { return "No disponible"; }
export async function downloadAudioSourceYtdlp() { return null; }
export async function processMp3ForWhatsApp(b) { return b; }
export function isMp3Valid() { return true; }
export function getMp3Duration() { return 0; }
export async function yts(query) {
  try { const m = await import("ytsr"); const r = await m.default(query, { limit: 5 }); return r.items || []; } catch { return []; }
}
export const imageToWebp = async (b) => b;
export const videoToWebp = async (b) => b;
export const writeExifImg = async (b, o) => b;
export const writeExifVid = async (b, o) => b;

export default { normalizeJid, getBuffer, fastFetch, bodyMenu };
export function withLimit(key, max, ttl, fn) { return fn(); }
export async function downloadAudioYtdlp() { return null; }
export const globalFetchCache = new Map();
export async function synthesize(text) { return null; }

// ─── Diagnostics (salud del bot) ───────────────────────────────
const _botErrors = new Map(); // id -> {scope, message, time}
let _botErrSeq = 0;
export function installPassiveErrorRecorder() {
  if (installPassiveErrorRecorder._installed) return;
  installPassiveErrorRecorder._installed = true;
  const push = (scope, err) => {
    try {
      const id = ++_botErrSeq;
      _botErrors.set(id, { scope, message: String(err?.message || err || 'error').slice(0, 500), time: Date.now() });
      if (_botErrors.size > 50) _botErrors.delete(_botErrors.keys().next().value);
    } catch { /* nunca romper el flujo */ }
  };
  process.on('uncaughtException', (e) => push('uncaught', e));
  process.on('unhandledRejection', (e) => push('unhandledRejection', e));
}
export function logBotError(scope, err) {
  const id = ++_botErrSeq;
  _botErrors.set(id, { scope, message: String(err?.message || err || 'error').slice(0, 500), time: Date.now() });
  if (_botErrors.size > 50) _botErrors.delete(_botErrors.keys().next().value);
}
export { logBotError as recordBotError };

// Multi-cuenta (.subs/.reload): re-export del auth SQLite propio de Shin-MD (#auth).
// Misma firma que la de Ginko: (sessionDir) -> { state: { creds, keys }, saveCreds }.
export { useSQLiteAuthState } from "#auth";
export function getBotErrors(n = 5) {
  return [..._botErrors.values()].sort((a, b) => b.time - a.time).slice(0, n);
}
export function getBotErrorCount() { return _botErrors.size; }
export function clearBotErrors() { _botErrors.clear(); }
export function formatUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return (d ? `${d}d ` : '') + (h ? `${h}h ` : '') + (m ? `${m}m ` : '') + `${s}s`;
}
export function truncateError(msg, len = 100) {
  const s = String(msg || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

// ─── Gestión de caché (./tmp + yt-dlp) ─────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const CACHE_DIRS = [
  { name: 'temp', dir: path.resolve('tmp') },
  { name: 'yt-dlp', dir: path.join(os.tmpdir(), 'yt-dlp') },
  { name: 'ginko-fetch', dir: path.resolve('cache') },
];
function _dirInfo(name, dir) {
  let size = 0, files = 0;
  const walk = (p) => {
    let ents = [];
    try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else { files++; try { size += fs.statSync(full).size; } catch {} }
    }
  };
  walk(dir);
  return { name, dir, size, files, exists: fs.existsSync(dir) };
}
export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export function scanCaches() {
  const items = CACHE_DIRS.map(c => _dirInfo(c.name, c.dir));
  return { items, totalSize: items.reduce((a, b) => a + b.size, 0), totalFiles: items.reduce((a, b) => a + b.files, 0) };
}
export function clearCacheDir(which) {
  const target = CACHE_DIRS.find(c => c.name === which) || CACHE_DIRS[0];
  const info = _dirInfo(target.name, target.dir);
  const rm = (p) => {
    let ents = [];
    try { ents = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(p, e.name);
      try { e.isDirectory() ? rm(full) : fs.unlinkSync(full); } catch {}
    }
  };
  if (fs.existsSync(target.dir)) rm(target.dir);
  const after = _dirInfo(target.name, target.dir);
  return info.size - after.size;
}
export function clearAllCaches() {
  let freed = 0;
  for (const c of CACHE_DIRS) freed += clearCacheDir(c.name);
  return freed;
}

// ─── Quick reply nativo (botones) ──────────────────────────────
export async function sendNativeQuickReply({ sock, jid, body, footer, title, quoted, buttons, imageBuffer }) {
  try {
    const b = await import('baileys');
    const proto = b.default?.proto || b.proto;
    const btns = (buttons || []).slice(0, 4).map((x, i) => ({
      button: {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: String(x.text || x.label || `Opción ${i + 1}`).slice(0, 20),
          id: String(x.id ?? `opt-${i + 1}`),
        }),
      },
    }));
    if (!btns.length) return { sent: false };
    const tpl = {
      hydratedContentText: String(body || title || '').slice(0, 1024),
      hydratedButtons: btns,
    };
    if (footer) tpl.hydratedFooterText = String(footer).slice(0, 60);
    if (title) tpl.hydratedTitleText = String(title).slice(0, 24);
    if (imageBuffer) tpl.imageMessage = { url: imageBuffer };
    const wmsg = b.default?.generateWAMessageFromContent ?? b.generateWAMessageFromContent;
    const quotedOpt = quoted?.key ? { quoted: quoted } : {};
    const m = wmsg(jid, proto.Message.fromObject({ templateMessage: { hydratedTemplate: tpl } }), quotedOpt);
    const r = await sock.sendMessage(jid, m);
    return { sent: !!r?.key?.id, key: r?.key };
  } catch {
    return { sent: false };
  }
}
