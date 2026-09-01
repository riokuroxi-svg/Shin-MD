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