/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  play.js — Reproductor y descargador interactivo estilo Ginko-MD
//  · Tarjeta interactiva con botones nativos (Audio MP3 / Video MP4)
//  · Precalentado en segundo plano (Background Audio Preheating)
//  · Caché RAM + Disco para entrega instantánea (0ms)
//  · Soporte de respuestas por botones, citas (1/2/3/4) y reacciones (👍/❤️)
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import axios from "axios";
import { getAudioUrl } from "#downloader";
import { searchYouTube, getYouTubeVideoId, getVideoInfoById } from "#lib/youtubeSearch";
import { fastFetch, globalFetchCache, isYtdlpAvailable, resolveYtdlpBinary } from "#lib/fastFetch";
import { downloadAudioSourceYtdlp, processMp3ForWhatsApp, isMp3Valid } from "#lib/mp3Utils";
import { getSelectedResponse } from "#lib/interactive-response";
import { sendNativeQuickReply } from "#lib/native-reply";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import log from "#logger";

const exec = promisify(execFile);
let YTDLP = process.env.YTDLP_PATH || "yt-dlp";

function dormir(ms) { return new Promise(r => setTimeout(r, ms)); }

async function descargarBuffer(url, timeoutMs = 5000) {
  if (!url || typeof url !== "string") return null;
  try {
    const res = await fastFetch(url, { timeout: timeoutMs });
    if (!res?.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf && buf.length ? buf : null;
  } catch { return null; }
}

const descargasActivas = new Map();
async function adquirir(clave, max) {
  const actual = descargasActivas.get(clave) || 0;
  if (actual >= max) {
    const err = new Error("Semáforo lleno");
    err.semaforo = true;
    throw err;
  }
  descargasActivas.set(clave, actual + 1);
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    const resta = (descargasActivas.get(clave) || 1) - 1;
    if (resta <= 0) descargasActivas.delete(clave);
    else descargasActivas.set(clave, resta);
  };
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_MB_AUDIO = 50 * 1024 * 1024;
const MAX_MB_VIDEO = 100 * 1024 * 1024;
const MB = 1024 * 1024;
const AUDIO_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_AUDIO_CACHE_ENTRIES = 10;
const DISK_AUDIO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISK_AUDIO_CACHE_BYTES = 350 * MB;
const DISK_AUDIO_CACHE_DIR = path.join(process.cwd(), "cache", "play-audio");

const ALIAS_MENU = ["play", "yt", "musica", "music"];
const ALIAS_AUDIO_DIRECTO = ["mp3", "ytmp3", "ytaudio", "playaudio", "playmp3"];

let ytdlpDisponible = null;

function getPendingMap(sock) {
  if (!sock._shinPlayPending) sock._shinPlayPending = new Map();
  return sock._shinPlayPending;
}

function esIphone(m) {
  return /^3A.{18}$/.test(String(m?.key?.id || ""));
}

function conTiempo(promesa, ms, etiqueta) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tiempo de espera agotado (${Math.round(ms / 1000)}s): ${etiqueta}`)),
      ms
    );
  });
  return Promise.race([promesa, timeout]).finally(() => clearTimeout(timer));
}

function sanitizeFilename(name = "audio") {
  return String(name)
    .replace(/\.(mp3|mp4|mkv|webm|mov|avi|m4a)$/i, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "audio";
}

function parseDurationSeconds(label = "") {
  if (typeof label === "number" && label > 0) return Math.round(label);
  const parts = String(label || "").trim().split(":").map(Number);
  if (!parts.length || parts.some(p => !Number.isFinite(p))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function esMp4Valido(buf) {
  if (!buf || buf.length < 12) return false;
  try { return buf.slice(4, 8).toString("latin1") === "ftyp"; } catch { return false; }
}

const getVideoId = (text = "") => {
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

// ── Metadata rápida oEmbed (60ms) ───────────────────────────
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

async function getVideoInfo(input, video_id) {
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
      "Shin Bot",
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

function obtenerAudioProcesado(job) {
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
function precalentarAudio(job) {
  obtenerAudioProcesado(job).catch(() => {});
}

async function descargarVideoApis(videoUrl) {
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
function registrarListener(sock) {
  if (sock._shinPlayListener) return;
  sock._shinPlayListener = true;
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages || []) {
      if (!m?.message || !m?.key?.id) continue;
      if (m.key.fromMe) continue;
      try { await procesarRespuesta(sock, m); } catch {}
    }
  });
}

async function procesarRespuesta(sock, m) {
  const pending = getPendingMap(sock);
  if (pending.size === 0) return;

  const reaction = m.message?.reactionMessage;
  if (reaction?.key?.id) {
    const emoji = String(reaction.text || "").trim();
    const job = pending.get(reaction.key.id);
    if (job && !job._procesando && !job._completado) {
      const mapeo = { "👍": "audio", "❤️": "video", "📄": "audiodoc", "📁": "videodoc" };
      if (mapeo[emoji]) await ejecutarDescarga(sock, job, mapeo[emoji], m);
    }
    return;
  }

  const selectedResponse = getSelectedResponse(m);
  const selectedId = String(selectedResponse?.id || "");
  const ctxStanzaId = String(selectedResponse?.stanzaId || "");

  if (selectedId) {
    const token = selectedId.match(/^(sn_[a-z0-9]+)_(?:pa|pv|pad|pvd)$/i)?.[1]
      || selectedId.match(/^playaudio:(.+)$/i)?.[1]
      || selectedId.match(/^playvideo:(.+)$/i)?.[1];

    if (token) {
      const jobId = sock._shinPlayTokens?.get(token) || token;
      const job = pending.get(jobId);
      if (job && !job._procesando && !job._completado) {
        await ejecutarDescarga(sock, job, selectedId, m);
        return;
      }
    }

    const job = ctxStanzaId ? pending.get(ctxStanzaId) : null;
    if (job && !job._procesando && !job._completado) {
      await ejecutarDescarga(sock, job, selectedId, m);
      return;
    }

    if (!ctxStanzaId) {
      const chat = m.key.remoteJid;
      for (const [, j] of Array.from(pending.entries()).reverse()) {
        if (j.chat === chat && !j._procesando && !j._completado) {
          await ejecutarDescarga(sock, j, selectedId, m);
          return;
        }
      }
    }
    return;
  }

  const ext = m.message?.extendedTextMessage;
  const texto = String(m.message?.conversation || ext?.text || "").trim().toLowerCase();
  const citado = ext?.contextInfo?.stanzaId;

  if (citado && texto) {
    const job = pending.get(citado);
    if (job && !job._procesando && !job._completado) {
      const primera = texto.split(/\s+/)[0];
      if (["1", "audio", "mp3"].includes(primera)) await ejecutarDescarga(sock, job, "audio", m);
      else if (["2", "video", "mp4"].includes(primera)) await ejecutarDescarga(sock, job, "video", m);
      else if (["3", "videodoc"].includes(primera)) await ejecutarDescarga(sock, job, "videodoc", m);
      else if (["4", "audiodoc"].includes(primera)) await ejecutarDescarga(sock, job, "audiodoc", m);
    }
  }
}

async function ejecutarDescarga(sock, job, modo, m) {
  job._procesando = true;
  let liberar = null;
  const chat = job.chat;
  const id = String(modo || "").toLowerCase();
  let tipo = "audio", comoDoc = false;

  if (id.endsWith("_pad") || id === "audiodoc" || id === "4" || id === "📄") { tipo = "audio"; comoDoc = true; }
  else if (id.endsWith("_pa") || id.startsWith("playaudio") || id === "audio" || id === "1" || id === "mp3" || id === "👍" || id === "🎵") { tipo = "audio"; comoDoc = false; }
  else if (id.endsWith("_pvd") || id === "videodoc" || id === "3" || id === "📁") { tipo = "video"; comoDoc = true; }
  else if (id.endsWith("_pv") || id.startsWith("playvideo") || id === "video" || id === "2" || id === "mp4" || id === "❤️" || id === "🎬") { tipo = "video"; comoDoc = false; }

  const emoji = tipo === "audio" ? (comoDoc ? "📄" : "🎵") : (comoDoc ? "📁" : "🎬");
  try { await sock.sendMessage(chat, { react: { text: emoji, key: m.key } }); } catch {}
  const estadoMsg = await sock.sendMessage(chat, { text: `⏳ *Descargando ${tipo}...*\n> *${job.title}*` }, { quoted: m }).catch(() => null);

  try {
    liberar = await adquirir("descargas", 2);
    let buffer;
    if (tipo === "audio") {
      await sock.sendMessage(chat, { react: { text: "🖼️", key: m.key } }).catch(() => {});
      const procesado = await obtenerAudioProcesado(job);
      buffer = procesado.buffer;
      if (estadoMsg?.key) try { await sock.sendMessage(chat, { delete: estadoMsg.key }); } catch {}
      const segundos = procesado.seconds || 0;
      const nombre = `${sanitizeFilename(job.title)}.mp3`;
      const audioPayload = {
        audio: buffer,
        mimetype: "audio/mpeg",
        fileName: nombre,
        ptt: false,
      };
      if (segundos > 0) audioPayload.seconds = segundos;
      await sock.sendMessage(chat, comoDoc ? {
        document: buffer, mimetype: "audio/mpeg", fileName: nombre,
      } : audioPayload, { quoted: m });
    } else {
      const r = await descargarVideoApis(job.url);
      buffer = r.buffer;
      if (buffer.length > MAX_MB_VIDEO) throw new Error("Video muy grande (>100MB)");
      if (!esMp4Valido(buffer)) comoDoc = true;
      if (estadoMsg?.key) try { await sock.sendMessage(chat, { delete: estadoMsg.key }); } catch {}
      await sock.sendMessage(chat, {
        [comoDoc ? "document" : "video"]: buffer,
        mimetype: "video/mp4",
        fileName: `${sanitizeFilename(job.title)}.mp4`,
        caption: `乂 *Video*\n> ❒ Título › *${job.title}*${r.calidad ? `\n> ❒ Calidad › *${r.calidad}*` : ""}`,
      }, { quoted: m });
    }
    job._completado = true;
    try { await sock.sendMessage(chat, { react: { text: "✅", key: job._commandKey || m.key } }); } catch {}
    setTimeout(() => {
      const p = getPendingMap(sock);
      p.delete(job.cardId);
      try { sock._shinPlayTokens?.delete(job._token); } catch {}
    }, 60000);
  } catch (e) {
    job._procesando = false;
    if (e?.semaforo) {
      if (estadoMsg?.key) try { await sock.sendMessage(chat, { delete: estadoMsg.key }); } catch {}
      await sock.sendMessage(chat, { text: "⏳ Ya hay 2 descargas en curso, espera un momento e inténtalo de nuevo." }, { quoted: m });
      return;
    }
    if (estadoMsg?.key) try { await sock.sendMessage(chat, { delete: estadoMsg.key }); } catch {}
    await sock.sendMessage(chat, { text: `❌ *Error:* ${e?.message || e}\n\n> Prueba con otro enlace o canción.` }, { quoted: m });
    try { await sock.sendMessage(chat, { react: { text: "❌", key: job._commandKey || m.key } }); } catch {}
  } finally {
    if (liberar) liberar();
  }
}

export default {
  name: "play",
  aliases: [...ALIAS_MENU.filter(a => a !== "play"), ...ALIAS_AUDIO_DIRECTO],
  category: "downloads",
  description: "Busca, reproduce y descarga música/videos con botones interactivos y precalentado 🎵",
  usage: ".play <canción o link>",
  cooldown: 8,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    try {
      if (ytdlpDisponible === null) {
        ytdlpDisponible = await isYtdlpAvailable();
        if (ytdlpDisponible) {
          const bin = await resolveYtdlpBinary();
          if (bin) YTDLP = bin;
          log.info(`[play] ⚡ yt-dlp detectado (${YTDLP}): descargas locales rápidas`);
        }
      }

      if (!ctx.arg) {
        return "🎵 *SHIN MUSIC PLAYER*\n\n" +
          "Uso: `" + (ctx.usedPrefix || ".") + "play <canción o link>`\n" +
          "Ej: `" + (ctx.usedPrefix || ".") + "play Funk Mambo Super slowed`\n\n" +
          "💡 _Opciones directas: `" + (ctx.usedPrefix || ".") + "mp3 <canción>`, `" + (ctx.usedPrefix || ".") + "play2 <canción>`_";
      }

      const input = ctx.arg.trim();
      const videoId = getVideoId(input);
      const isDirectAudio = ALIAS_AUDIO_DIRECTO.includes(ctx.command);

      // Si es comando de audio directo (.mp3, .ytmp3, .ytaudio)
      if (isDirectAudio) {
        const estado = await sock.sendMessage(ctx.chatId, { text: `⏳ *Descargando audio...*` }, { quoted: ctx.full }).catch(() => null);
        try {
          const job = {
            url: videoId ? `https://youtu.be/${videoId}` : input,
            videoId,
            title: input,
          };
          const procesado = await obtenerAudioProcesado(job);
          if (estado?.key) try { await sock.sendMessage(ctx.chatId, { delete: estado.key }); } catch {}
          const safeName = `${sanitizeFilename(input)}.mp3`;
          const audioPayload = {
            audio: procesado.buffer,
            mimetype: "audio/mpeg",
            fileName: safeName,
            ptt: false,
          };
          if (procesado.seconds > 0) audioPayload.seconds = procesado.seconds;
          await sock.sendMessage(ctx.chatId, audioPayload, { quoted: ctx.full });
          return null;
        } catch (e) {
          if (estado?.key) try { await sock.sendMessage(ctx.chatId, { delete: estado.key }); } catch {}
          return `❌ *Error:* ${e?.message || e}`;
        }
      }

      // Si es un link de SoundCloud directo, delegar a soundcloud
      if (/^https?:\/\/(soundcloud\.com|on\.soundcloud\.com)\//i.test(input)) {
        const scHandler = (await import("./soundcloud.js")).default;
        return scHandler.handler(sock, ctx, engine);
      }

      try { await sock.sendMessage(ctx.chatId, { react: { text: "🔍", key: ctx.full.key } }); } catch {}

      const info = await getVideoInfo(input, videoId);
      if (!info) {
        try { await sock.sendMessage(ctx.chatId, { react: { text: "❌", key: ctx.full.key } }); } catch {}
        return "❌ No se encontró la canción o video. Prueba con otro nombre.";
      }

      const url = info.url || `https://youtu.be/${videoId || info.videoId}`;
      const foundVid = videoId || getVideoId(url) || info.videoId;
      const title = info.title || "Audio Shin-MD";
      const channel = info.author?.name || info.author || "YouTube Music";
      const duration = info.timestamp || info.duration || "0:00";
      const views = Number(info.views || 0).toLocaleString("es-MX");
      const ago = info.ago || "";
      const thumbnail = info.thumbnail || info.image || (foundVid ? `https://i.ytimg.com/vi/${foundVid}/hqdefault.jpg` : null);

      registrarListener(sock);
      const usarBotones = !esIphone(ctx.full);

      const infoTxt = `🎬 *RESULTADO*\n\n` +
        `> ❖ Título › *${title}*\n` +
        `> ❖ Canal › *${channel}*\n` +
        `> ⴵ Duración › *${duration}*\n` +
        (views && views !== "0" ? `> ❀ Vistas › *${views}*\n` : "") +
        (ago ? `> ✩ Publicado › *${ago}*\n` : "") +
        `> ❒ Enlace › ${url}\n\n`;

      const caption = usarBotones
        ? infoTxt + `🟢 *Toca un botón:*\n\n🔵 *Si no funciona, cita el mensaje y escribe:*\n*1* = audio 🎵\n*2* = video 🎬\n*3* = video como doc 📁\n*4* = audio como doc 📄`
        : infoTxt + `🟡 *Reacciona:* 👍 = audio 🎵, ❤️ = video 🎬`;

      const cardToken = `sn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const botones = usarBotones ? [
        { buttonId: `${cardToken}_pa`, buttonText: { displayText: ytdlpDisponible ? "🎵 Audio ⚡" : "🎵 Audio MP3" }, type: 1 },
        { buttonId: `${cardToken}_pv`, buttonText: { displayText: "🎬 Video MP4" }, type: 1 },
      ] : [];

      const job = {
        cardId: null,
        cardKey: null,
        chat: ctx.chatId,
        url,
        videoId: foundVid,
        title,
        channel,
        duration,
        views,
        ago,
        thumbnail,
        _commandKey: ctx.full.key,
        _createdAt: Date.now(),
        _procesando: false,
        _completado: false,
        _token: cardToken,
      };

      // ⚡ PRECALENTANDO: Iniciar descarga en background INMEDIATAMENTE
      precalentarAudio(job);

      let card;
      if (usarBotones) {
        const imgBuf = thumbnail ? await descargarBuffer(thumbnail, 5000) : null;
        const r = await sendNativeQuickReply({
          sock,
          jid: ctx.chatId,
          body: caption,
          footer: "❦ Shin-MD",
          title: "❦ Shin-MD",
          quoted: ctx.full,
          buttons: botones.map(b => ({ text: b.buttonText.displayText, id: b.buttonId })),
          imageBuffer: imgBuf,
        });
        card = r?.sent ? { key: r.key } : null;
        if (!card) {
          card = await sock.sendMessage(ctx.chatId, { text: caption }, { quoted: ctx.full }).catch(() => null);
        }
      } else {
        card = await sock.sendMessage(ctx.chatId, thumbnail ? { image: { url: thumbnail }, caption } : { text: caption }, { quoted: ctx.full })
          .catch(async () => await sock.sendMessage(ctx.chatId, { text: caption }, { quoted: ctx.full }).catch(() => null));
      }

      if (!card?.key?.id) return "❌ No se pudo enviar la tarjeta.";

      job.cardId = card.key.id;
      job.cardKey = card.key;
      getPendingMap(sock).set(card.key.id, job);
      (sock._shinPlayTokens ??= new Map()).set(cardToken, card.key.id);

      setTimeout(() => {
        const p = getPendingMap(sock);
        const j = p.get(card.key.id);
        if (j && !j._procesando && !j._completado) {
          p.delete(card.key.id);
          try { sock._shinPlayTokens?.delete(j._token); } catch {}
        }
      }, PENDING_TTL_MS);

      try { await sock.sendMessage(ctx.chatId, { react: { text: "✅", key: ctx.full.key } }); } catch {}
      return null;
    } catch (e) {
      try { await sock.sendMessage(ctx.chatId, { react: { text: "❌", key: ctx.full.key } }); } catch {}
      return `❌ *Error:* ${e?.message || e}`;
    }
  },
};

export { procesarRespuesta };
