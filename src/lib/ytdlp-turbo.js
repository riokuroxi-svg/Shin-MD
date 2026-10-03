/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ytdlp-turbo.js — El motor yt-dlp: binario, caché y auto-actualización.
//
//  Salió de cmds/downloads/ytdlp.js (426 líneas) para que el comando se
//  quede con lo suyo: leer el mensaje, decidir el modo y contestar.
//  Aquí vive lo pesado: resolver el binario (PATH, bin/ local, descarga
//  automática), ejecutarlo con límites, la caché de disco de 24 h y la
//  actualización diaria de yt-dlp (pip o -U) y del propio plugin.
//
//  Se movió tal cual: ni una línea de lógica reescrita.
// ═══════════════════════════════════════════════════════════════════

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import log from "#logger";
import { downloadAudioYtdlp, processMp3ForWhatsApp, getMp3Duration, isMp3Valid } from "#lib/mp3Utils";
import { resolveYtdlpBinary } from "#lib/fastFetch";

// `exec` se exporta porque el comando lanza yt-dlp directamente en dos casos.
export const exec = promisify(execFile);

export const fetch = globalThis.fetch

// Ruta del binario de yt-dlp (se resuelve bajo demanda para soportar bin/ local
// o rutas fuera del PATH). Se cachea; se resetea si se cambia YTDLP_PATH en .env.
export let YTDLP = process.env.YTDLP_PATH || 'yt-dlp'
export let _ytdlpResuelto = false
export async function ensureYtdlpResolved() {
  if (_ytdlpResuelto) return
  const bin = await resolveYtdlpBinary()
  if (bin) YTDLP = bin
  _ytdlpResuelto = true
}
export const VERSION = '2.4.0'
export const __filename = fileURLToPath(import.meta.url)

export const MB = 1024 * 1024
export const MAX_MB_VIDEO = 100
export const LIMITE_VIDEO_DIRECTO = 16 * MB

export const CACHE_DIR = path.join(process.cwd(), 'media', 'cache-ytdlp')
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
export const CACHE_MAX_MB = 250

// ── utilidades ──────────────────────────────────────────────
export function limpiarNombre(texto = 'descarga') {
  return String(texto)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'descarga'
}

export function hashUrl(u) {
  return Buffer.from(String(u)).toString('base64url').slice(0, 32)
}

export function tipoAudio(buf) {
  if (!buf || buf.length < 12) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return { mimetype: 'audio/mp4', ext: 'm4a' }
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return { mimetype: 'audio/mpeg', ext: 'mp3' }
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return { mimetype: 'audio/ogg; codecs=opus', ext: 'ogg' }
  return { mimetype: 'audio/mpeg', ext: 'mp3' }
}

export function esMp4(b) {
  return b && b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp'
}

export async function runYtdlp(args, { maxBuffer = 32 * MB, timeout = 5 * 60 * 1000 } = {}) {
  await ensureYtdlpResolved()
  try {
    // encoding: 'buffer' para obtener datos binarios correctamente, no como string
    const { stdout } = await exec(YTDLP, args, { maxBuffer, timeout, windowsHide: true, encoding: 'buffer' })
    return stdout
  } catch (e) {
    const errText = e.stderr ? String(e.stderr) : String(e.message || 'error desconocido')
    const cola = errText
      .split('\n').map(l => l.trim()).filter(Boolean).slice(-3)
    throw new Error(cola.join(' | '))
  }
}

export function limpiarCache() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const archivos = fs.readdirSync(CACHE_DIR).map(f => {
      const p = path.join(CACHE_DIR, f)
      const st = fs.statSync(p)
      return { p, mtime: st.mtimeMs, size: st.size }
    }).sort((a, b) => a.mtime - b.mtime)
    let total = archivos.reduce((s, f) => s + f.size, 0)
    for (const f of archivos) {
      if (Date.now() - f.mtime > CACHE_TTL_MS || total > CACHE_MAX_MB * MB) {
        fs.unlinkSync(f.p)
        total -= f.size
      }
    }
  } catch { /* la caché nunca debe tumbar el comando */ }
}

export const ARGS_VELOCIDAD = ['-N', '8', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web,web_embedded']

// ════════════════════════════════════════════════════════════
//  AUTO-UPDATE (cero mantenimiento)
// ════════════════════════════════════════════════════════════
export const UPDATER_INTERVAL_MS = 24 * 60 * 60 * 1000
export const canal = (process.env.YTDLP_CHANNEL || 'nightly').toLowerCase() // nightly | stable

export async function versionYtdlp() {
  await ensureYtdlpResolved()
  try {
    const { stdout } = await exec(YTDLP, ['--version'], { timeout: 30 * 1000 })
    return String(stdout).trim()
  } catch { return '?' }
}

// Actualiza yt-dlp. Orden: 1) pip (instalación más común, con canal nightly
// por defecto → fixes del mismo día)  2) yt-dlp -U (si es binario suelto).
// Si hay una descarga en curso se pospone (evita lock de archivos en Windows
// y contención de disco en VPS de 1 core); reintenta en el siguiente ciclo.
export async function actualizarYtdlp() {
  if (global.__ytdlpBusy) {
    log.info('[ytdlp] ⏭️ auto-update pospuesto (hay una descarga en curso)')
    return { ok: false, pospuesto: true }
  }
  const antes = await versionYtdlp()

  // 1) Intento pip
  try {
    const args = ['-m', 'pip', 'install', '-U']
    if (canal === 'nightly') args.push('--pre')
    args.push('yt-dlp[default]')
    await exec('python3', args, { timeout: 300 * 1000 })
    const despues = await versionYtdlp()
    if (despues !== antes && despues !== '?') {
      log.info(`[ytdlp] 🔄 auto-update (pip/${canal}): ${antes} → ${despues}`)
      return { ok: true, antes, despues }
    }
    log.info(`[ytdlp] ✅ yt-dlp al día (${despues}, canal pip/${canal})`)
    return { ok: true, antes, despues }
  } catch (e) {
    log.info(`[ytdlp] update por pip no disponible (${e.message?.slice(0, 80)}), probando binario…`)
  }

  // 2) Binario suelto: yt-dlp -U (o --update-to nightly para cambiar de canal)
  try {
    const cmdUpd = canal === 'nightly' ? ['--update-to', 'nightly'] : ['-U']
    await exec(YTDLP, cmdUpd, { timeout: 300 * 1000 })
    const despues = await versionYtdlp()
    log.info(`[ytdlp] 🔄 auto-update (binario/${canal}): ${antes} → ${despues}`)
    return { ok: true, antes, despues }
  } catch (e) {
    log.info(`[ytdlp] ⚠️ no se pudo auto-actualizar: ${e.message?.slice(0, 120)}`)
    return { ok: false, error: String(e.message || e).slice(0, 200) }
  }
}

export function compararVersiones(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

// Auto-update del PROPIO plugin: descarga la versión del repo, compara VERSION,
// y si es más nueva se sobreescribe a sí mismo (el loader del bot lo recarga solo).
export async function actualizarPlugin() {
  const url = process.env.YTDLP_PLUGIN_URL
  if (!url) return
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const texto = await res.text()
    const m = texto.match(/const VERSION\s*=\s*'([\d.]+)'/)
    if (!m) return
    if (compararVersiones(m[1], VERSION) > 0) {
      fs.writeFileSync(__filename, texto)
      log.info(`[ytdlp] 🚀 plugin auto-actualizado ${VERSION} → ${m[1]} (hot-reload del bot)`)
    }
  } catch (e) {
    log.info(`[ytdlp] plugin: no se pudo auto-actualizar (${e.message?.slice(0, 100)})`)
  }
}

// Arranque único: el guard global evita duplicar timers cuando el
// hot-reload del bot re-importa este archivo.
if (!global.__ytdlpUpdater) {
  global.__ytdlpUpdater = true
  if ((process.env.YTDLP_AUTO_UPDATE || '').toLowerCase() !== 'off') {
    // .unref(): mantenimiento en segundo plano — no debe impedir la salida
    // limpia del proceso (tests, shutdown). En prod, el socket Baileys ya
    // mantiene el proceso vivo.
    setTimeout(() => actualizarYtdlp().catch(() => {}), 60 * 1000).unref?.() // 1ª comprobación al minuto
    setInterval(() => actualizarYtdlp().catch(() => {}), UPDATER_INTERVAL_MS).unref?.()
    if (process.env.YTDLP_PLUGIN_URL) {
      setTimeout(() => actualizarPlugin().catch(() => {}), 2 * 60 * 1000).unref?.()
      setInterval(() => actualizarPlugin().catch(() => {}), UPDATER_INTERVAL_MS).unref?.()
    }
  }
}



// ════════════════════════════════════════════════════════════
//  COMANDO
