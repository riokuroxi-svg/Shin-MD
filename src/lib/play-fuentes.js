/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  play-fuentes.js — De dónde sale el audio y el video de `.play`.
//
//  Salió de cmds/downloads/play.js (que tenía 753 líneas): aquí vive
//  todo lo que consigue los bytes — búsqueda de metadata, yt-dlp local,
//  CDN de audio, APIs de video — y las dos cachés (RAM y disco) que
//  evitan bajar dos veces la misma canción.
//
//  Lo que NO está aquí: la tarjeta, los botones, las reacciones y el
//  flujo con el usuario. Eso se quedó en el comando.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import { getAudioUrl } from "#downloader";
import { searchYouTube, getVideoInfoById } from "#lib/youtubeSearch";
import { fastFetch, globalFetchCache, isYtdlpAvailable, resolveYtdlpBinary } from "#lib/fastFetch";
import { downloadAudioSourceYtdlp, processMp3ForWhatsApp, isMp3Valid } from "#lib/mp3Utils";
import log from "#logger";

// ── Red y archivos ──────────────────────────────────────────
export async function descargarBuffer(url, timeoutMs = 5000) {
  if (!url || typeof url !== "string") return null;
  try {
    const res = await fastFetch(url, { timeout: timeoutMs });
    if (!res?.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf && buf.length ? buf : null;
  } catch { return null; }
}


// ── Caché de audio: RAM y disco ─────────────────────────────
const MAX_MB_AUDIO = 50 * 1024 * 1024;

const MB = 1024 * 1024;

const AUDIO_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_AUDIO_CACHE_ENTRIES = 10;
const DISK_AUDIO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISK_AUDIO_CACHE_BYTES = 350 * MB;
const DISK_AUDIO_CACHE_DIR = path.join(process.cwd(), "cache", "play-audio");


// ── yt-dlp local (se detecta una vez) ────────────────────────
let YTDLP = process.env.YTDLP_PATH || "yt-dlp";
let ytdlpDisponible = null;


// ── Nombres, duraciones y validaciones ──────────────────────
export function sanitizeFilename(name = "audio") {
  return String(name)
    .replace(/\.(mp3|mp4|mkv|webm|mov|avi|m4a)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "audio";
}

export function parseDurationSeconds(label = "") {
  if (typeof label === "number" && label > 0) return Math.round(label);
  const parts = String(label || "").trim().split(":").map(Number);
  if (!parts.length || parts.some(p => !Number.isFinite(p))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function esMp4Valido(buf) {
  if (!buf || buf.length < 12) return false;
  try { return buf.slice(4, 8).toString("latin1") === "ftyp"; } catch { return false; }
}


// ── Identificador de YouTube ─────────────────────────────────
export const getVideoId = (text = "") => {
  const raw = String(text || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
};



// ── Metadata de YouTube ──────────────────────────────────────
async function getVideoInfoFast(videoId) {
  const cacheKey = `ytmeta:${videoId}`;
  const cached = globalFetchCache.get(cacheKey);
  if (cached) return cached;
  try {
    const res = await fastFetch(`https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`, { timeout: 4000 });
    if (!res.ok) return null;
    const json = await res.json();
    const info = {
      videoId,
      url: `https://youtu.be/${videoId}`,
      title: json.title || "Audio",
      thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      author: { name: json.author_name || "Desconocido" },
      timestamp: "0:00",
      ago: "",
      views: 0,
    };
    globalFetchCache.set(cacheKey, info, 60 * 60 * 1000);
    return info;
  } catch {
    return null;
  }
}

export async function getVideoInfo(input, video_id) {
  if (video_id) {
    const fast = await getVideoInfoFast(video_id);
    if (fast) return fast;
    try {
      const info = await getVideoInfoById(video_id);
      if (info) return { ...info, url: `https://youtu.be/${video_id}`, thumbnail: info.thumbnail || info.image };
    } catch {}
  }
  try {
    const s = await searchYouTube(input, { limit: 1 });
    const list = s?.videos || (Array.isArray(s) ? s : []);
    if (list.length > 0) return list[0];
  } catch {}
  return null;
}

// ── Caché RAM + Disco de Audio Procesado ─────────────────────


// ── Caché RAM + Disco de Audio Procesado ─────────────────────
const audioProcesadoCache = new Map();

function limpiarAudioCache() {
  const now = Date.now();
  for (const [key, entry] of audioProcesadoCache) {
    if (entry.expires <= now) audioProcesadoCache.delete(key);
  }
  while (audioProcesadoCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    audioProcesadoCache.delete(audioProcesadoCache.keys().next().value);
  }
}

function audioCacheKey(job = {}) {
  return job.videoId || getVideoId(job.url) || job.url || job.title;
}

function audioDiskCachePaths(job = {}) {
  const rawKey = audioCacheKey(job);
  if (!rawKey) return null;
  const key = crypto.createHash("sha1").update(String(rawKey)).digest("hex");
  return {
    audio: path.join(DISK_AUDIO_CACHE_DIR, `${key}.mp3`),
    meta: path.join(DISK_AUDIO_CACHE_DIR, `${key}.json`),
  };
}

function leerAudioDiskCache(job = {}) {
  try {
    const paths = audioDiskCachePaths(job);
    if (!paths || !fs.existsSync(paths.audio) || !fs.existsSync(paths.meta)) return null;
    const meta = JSON.parse(fs.readFileSync(paths.meta, "utf8"));
    if (!meta?.createdAt || Date.now() - meta.createdAt > DISK_AUDIO_CACHE_TTL_MS) return null;
    const stat = fs.statSync(paths.audio);
    if (!stat.size || stat.size > MAX_MB_AUDIO) return null;
    const buffer = fs.readFileSync(paths.audio);
    if (!isMp3Valid(buffer)) return null;
    fs.utimesSync(paths.audio, new Date(), new Date());
    return { buffer, seconds: Number(meta.seconds || 0), cached: "disk" };
  } catch {
    return null;
  }
}

function guardarAudioDiskCache(job = {}, result = {}) {
  try {
    if (!result?.buffer?.length || result.buffer.length > MAX_MB_AUDIO) return;
    const paths = audioDiskCachePaths(job);
    if (!paths) return;
    fs.mkdirSync(DISK_AUDIO_CACHE_DIR, { recursive: true });
    fs.writeFileSync(paths.audio, result.buffer);
    fs.writeFileSync(paths.meta, JSON.stringify({ createdAt: Date.now(), seconds: result.seconds || 0, title: job.title || "Audio" }));
  } catch {}
}

async function descargarAudioFuenteYtdlp(url) {
  const src = await downloadAudioSourceYtdlp(url, YTDLP);
  return { buffer: src.buffer, origen: "raw-local", ext: src.ext };
}

async function descargarAudioSmart(job) {
  // 1. Probar yt-dlp local si está disponible
  if (ytdlpDisponible && job.url) {
    try {
      const src = await descargarAudioFuenteYtdlp(job.url);
      if (src?.buffer?.length) return src;
    } catch {}
  }

  // 2. Probar Turbo Downloader CDN (Spotify Izuka, Nexray, SoundCloud Progressive)
  const query = job.title ? `${job.title} ${job.channel || ""}` : (job.url || "");
  const audioData = await getAudioUrl(query);
  if (audioData?.url) {
    const res = await fastFetch(audioData.url, { timeout: 20000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar stream`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 20 * 1024) throw new Error("Audio corrupto o muy pequeño");
    return { buffer, origen: audioData.provider || "turbo-cdn", seconds: audioData.seconds || 0 };
  }

  throw new Error("No se pudo obtener el audio de ninguna fuente");
}

async function prepararAudioProcesado(job) {
  const title = sanitizeFilename(job.title || "Audio");
  const cached = leerAudioDiskCache(job);
  if (cached) return cached;

  const audioDescargado = await descargarAudioSmart(job);
  const buffer = audioDescargado.buffer;
  if (buffer.length > MAX_MB_AUDIO) throw new Error("Archivo muy grande (>50MB)");

  let procesadoBuffer = buffer;
  let durSegundos = audioDescargado.seconds || parseDurationSeconds(job.duration);

  try {
    const p = await processMp3ForWhatsApp(
      buffer,
      title,
      // Artista real del ID3: el canal de YouTube suele ser el artista.
      // Sin canal (ej. `.mp3 <nombre>`), cae al nombre por defecto.
      sanitizeFilename(job.channel || "").slice(0, 60) || undefined,
      128,
      audioDescargado.origen || "local",
      durSegundos,
    );
    if (p?.buffer) {
      procesadoBuffer = p.buffer;
      if (p.seconds) durSegundos = p.seconds;
    }
  } catch {}

  const result = { buffer: procesadoBuffer, seconds: durSegundos };
  guardarAudioDiskCache(job, result);
  return result;
}

export function obtenerAudioProcesado(job) {
  limpiarAudioCache();
  const key = audioCacheKey(job);
  const cached = key ? audioProcesadoCache.get(key) : null;
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = prepararAudioProcesado(job).catch(e => {
    if (key) audioProcesadoCache.delete(key);
    throw e;
  });
  if (key) audioProcesadoCache.set(key, { promise, expires: Date.now() + AUDIO_CACHE_TTL_MS });
  return promise;
}

/**
 * ⚡ PRECALENTANDO: Inicia la descarga y procesamiento del audio en background
 * apenas se envía la tarjeta visual, eliminando la espera del usuario.
 */
export function precalentarAudio(job) {
  obtenerAudioProcesado(job).catch(() => {});
}


// ── Video por APIs externas ──────────────────────────────────
export async function descargarVideoApis(videoUrl) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  // 1. Izuka ytmp4
  try {
    const res = await axios.get(`https://my.izuka-api.xyz/api/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 12000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.download_url || res.data?.result?.url || res.data?.data?.download;
    if (dl && /^https?:\/\//i.test(dl)) {
      const vRes = await fastFetch(dl, { timeout: 60000 });
      if (vRes.ok) {
        const buffer = Buffer.from(await vRes.arrayBuffer());
        if (buffer.length > 50 * 1024) return { buffer, calidad: "720p" };
      }
    }
  } catch {}

  // 2. Nexray ytmp4
  try {
    const res = await axios.get(`https://api.nexray.eu.cc/downloader/ytmp4?url=${encodeURIComponent(videoUrl)}`, {
      timeout: 12000,
      headers: { "User-Agent": UA },
    });
    const dl = res.data?.result?.url || res.data?.result?.download_url;
    if (dl && /^https?:\/\//i.test(dl)) {
      const vRes = await fastFetch(dl, { timeout: 60000 });
      if (vRes.ok) {
        const buffer = Buffer.from(await vRes.arrayBuffer());
        if (buffer.length > 50 * 1024) return { buffer, calidad: "360p" };
      }
    }
  } catch {}

  throw new Error("No se pudo obtener el video");
}

// ── Listener de Botones, Citas y Reacciones ─────────────────

/**
 * Detecta yt-dlp una sola vez y dice si está disponible.
 * Antes vivía dentro del comando; ahora el módulo es quien lo sabe.
 * Se guarda la promesa (no solo el resultado) para que dos llamadas a la
 * vez compartan la misma detección en lugar de lanzar dos.
 * @returns {Promise<boolean>}
 */
export function prepararYtdlp() {
  if (!deteccionYtdlp) deteccionYtdlp = detectarYtdlp();
  return deteccionYtdlp;
}

let deteccionYtdlp = null;
async function detectarYtdlp() {
  ytdlpDisponible = await isYtdlpAvailable();
  if (ytdlpDisponible) {
    const bin = await resolveYtdlpBinary();
    if (bin) YTDLP = bin;
    log.info(`[play] ⚡ yt-dlp detectado (${YTDLP}): descargas locales rápidas`);
  }
  return !!ytdlpDisponible;
}
