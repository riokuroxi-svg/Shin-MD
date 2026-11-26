/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";
// ============================================================
//  ytdlp.js (v2.1 · turbo + AUTO-UPDATE) — Plugin para Ginko-MD-Lab
//  Descarga video/canciones con yt-dlp LOCAL
//
//  NOVEDADES v2.1 (cero mantenimiento):
//   · 🚀 AUTO-UPDATE: el bot actualiza yt-dlp solo cada 24 h
//     (pip → canal nightly por defecto; binario → yt-dlp -U).
//     Funciona en cualquier host: VPS, Railway, Render... sin cron.
//   · Auto-update del PROPIO plugin desde tu repo (opcional,
//     .env: YTDLP_PLUGIN_URL=https://raw.githubusercontent.com/.../ytdlp.js)
//     → subes la versión nueva a GitHub y el bot se reemplaza solo (hot-reload).
//
//  VARIABLES .env (todas opcionales):
//   YTDLP_PATH=/usr/local/bin/yt-dlp     → ruta del binario si no está en PATH
//   YTDLP_CHANNEL=nightly|stable         → canal de actualización (default: nightly)
//   YTDLP_AUTO_UPDATE=off                → desactivar el auto-update
//   YTDLP_PLUGIN_URL=<url raw de github> → auto-update del propio plugin
//
//  INSTALACIÓN:
//    1) Copiar a:  cmds/downloads/ytdlp.js   (el bot lo carga solo)
//    2) En el VPS: pip install -U --pre "yt-dlp[default]"  ·  apt install ffmpeg
//
//  USO:
//    .ytdlp <enlace>          → video (≤720p)
//    .ytdlp <enlace> audio    → canción m4a nativo (⚡ sin conversión)
//    .ytdlp <enlace> mp3      → mp3 320k (usa ffmpeg)
//    .ytdlp <enlace> fast     → m4a ~96k, máxima velocidad
// ============================================================
import fs from 'fs'
import path from 'path'
import {
  ARGS_VELOCIDAD,
  CACHE_DIR,
  LIMITE_VIDEO_DIRECTO,
  MAX_MB_VIDEO,
  MB,
  YTDLP,
  esMp4,
  exec,
  hashUrl,
  limpiarCache,
  limpiarNombre,
  runYtdlp,
} from "#lib/ytdlp-turbo";
import { downloadAudioYtdlp, processMp3ForWhatsApp, getMp3Duration } from "#lib/mp3Utils";
// ════════════════════════════════════════════════════════════
export default {
  command: ['ytdlp', 'ytdl'],
  category: 'downloads',
  description: 'Descarga video/canciones con yt-dlp local (turbo + auto-update).',
  run: async ({ msg, sock, args, usedPrefix }) => {
    if (!args.length) {
      return msg.reply(
        `《✧》 *yt-dlp turbo* — motor local, sin APIs públicas.\n\n` +
        `Uso:\n` +
        `*${usedPrefix}ytdlp* <enlace>          → video (≤720p)\n` +
        `*${usedPrefix}ytdlp* <enlace> audio    → canción MP3 con portada personalizada ⚡\n` +
        `*${usedPrefix}ytdlp* <enlace> mp3      → mp3 320k con portada\n` +
        `*${usedPrefix}ytdlp* <enlace> fast     → mp3 96k ligero, máxima velocidad\n\n` +
        `Ejemplo: *${usedPrefix}ytdlp* https://youtu.be/xxxx audio`
      )
    }

    const url = String(args[0] || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      return msg.reply('《✧》 Ingresa un enlace *válido* (http/https).')
    }
    const modo = String(args[1] || '').toLowerCase()
    const esAudio = /^(audio|a|m4a|cancion|canciones|song|musica)$/.test(modo)
    const esMp3 = /^mp3$/.test(modo)
    const esFast = /^(fast|rapido|ligero|lite)$/.test(modo)

    try {
      await msg.react('🕒')

      // 1) Metadatos (rápido, no descarga nada)
      const rawJson = await runYtdlp(
        ['--dump-single-json', '--no-warnings', '--no-playlist', '--', url],
        { maxBuffer: 16 * MB, timeout: 90 * 1000 }
      )
      let info
      try { info = JSON.parse(rawJson) } catch { throw new Error('yt-dlp no devolvió metadatos válidos') }

      const titulo = String(info.title || 'video').slice(0, 120)
      const duracion = info.duration
        ? `${Math.floor(info.duration / 60)}:${String(info.duration % 60).padStart(2, '0')}`
        : 'N/A'
      const id = info.id || hashUrl(url)

      // 2) Estrategia según el modo
      let argsDesc, ext, esVideo = false, etiquetaModo, bitrate = 128, modoTag = ''
      if (!esAudio && !esMp3 && !esFast) {
        esVideo = true
        ext = 'mp4'
        etiquetaModo = 'VIDEO 720p'
        argsDesc = [
          '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4', ...ARGS_VELOCIDAD
        ]
      } else {
        // TODOS los modos de audio devuelven MP3 para que funcione la portada y no salga nombre raro
        esVideo = false
        ext = 'mp3'
        if (esMp3) {
          etiquetaModo = 'MP3 320k'
          bitrate = 320
          modoTag = 'mp3'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', ...ARGS_VELOCIDAD]
        } else if (esFast) {
          etiquetaModo = 'MP3 96k LIGERO ⚡'
          bitrate = 96
          modoTag = 'fast'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '9', ...ARGS_VELOCIDAD]
        } else {
          etiquetaModo = 'MP3 128k'
          bitrate = 128
          modoTag = 'normal'
          argsDesc = ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '2', ...ARGS_VELOCIDAD]
        }
      }

      // 3) Caché (los audios se guardan YA procesados, con etiqueta de modo)
      const rutaCache = path.join(CACHE_DIR, `${id}${esVideo ? '' : '-' + modoTag}.${ext}`)
      limpiarCache()
      let buf = null
      let desdeCache = false
      if (fs.existsSync(rutaCache)) {
        try {
          buf = fs.readFileSync(rutaCache)
          desdeCache = buf && buf.length > 1024
        } catch { buf = null }
      }

      // 4) Descargar si no estaba en caché
      if (!desdeCache) {
        global.__ytdlpBusy = true
        try {
          if (esVideo) {
            // Para video seguimos usando el método anterior, pero con archivo temporal para no corromper
            const os = await import('os');
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginko-vid-'));
            const outTemplate = path.join(tmpDir, 'video.%(ext)s');
            const maxBuf = MAX_MB_VIDEO * MB;
            try {
              let argsVid = [...argsDesc, '-o', outTemplate, '--', url];
              try {
                await exec(YTDLP, argsVid, { timeout: 12 * 60 * 1000, windowsHide: true, cwd: tmpDir });
              } catch (e) {
                // Fallback video
                await exec(YTDLP, ['-f', 'best', ...ARGS_VELOCIDAD, '-o', outTemplate, '--', url], { timeout: 12 * 60 * 1000, windowsHide: true });
              }
              const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm'));
              if (files.length === 0) throw new Error('No se pudo descargar el video');
              buf = fs.readFileSync(path.join(tmpDir, files[0]));
              try { fs.writeFileSync(rutaCache, buf); } catch {}
              try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
            } catch (e) {
              try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
              throw e;
            }
          } else {
            // Audio: descargar a archivo temporal (sin corrupción).
            // La caché se escribe DESPUÉS de procesar, ya con el MP3 final.
            buf = await downloadAudioYtdlp(url, esFast ? 'fast' : esMp3 ? 'mp3' : 'normal', YTDLP)
          }
          if (!buf || buf.length < 1024) throw new Error('El archivo descargado está vacío')
        } finally {
          global.__ytdlpBusy = false
        }
      }

      // 5) Enviar
      const caption =
        `ㅤ۟∩　ׅ　★ ໌　ׅ　🅨🅣-🅓🅛🅟　ׄᰙ\n\n` +
        `𖣣ֶㅤ֯⌗ ✎  ⬭ *Título:* ${titulo}\n` +
        `𖣣ֶㅤ֯⌗ ❖  ⬭ *Duración:* ${duracion}\n` +
        `𖣣ֶㅤ֯⌗ ✦  ⬭ *Formato:* ${etiquetaModo}\n` +
        `𖣣ֶㅤ֯⌗ ❒  ⬭ *Tamaño:* ${(buf.length / MB).toFixed(1)} MB` +
        (desdeCache ? `\n𖣣ֶㅤ֯⌗ ⚡  ⬭ *Desde caché (instantáneo)*` : '')

      if (!esVideo) {
        // Procesar MP3 para que WhatsApp lo acepte con portada y nombre correcto.
        // Si viene de caché ya está procesado → solo medimos duración (instantáneo).
        let audioFinal = buf
        let segundos = 0
        if (!desdeCache) {
          try {
            await msg.react('🖼️')
            const procesado = await processMp3ForWhatsApp(buf, titulo, undefined, bitrate)
            audioFinal = procesado.buffer
            segundos = procesado.seconds || 0
            if (audioFinal && audioFinal.length > 1024) {
              try { fs.writeFileSync(rutaCache, audioFinal) } catch { /* sin caché, no pasa nada */ }
            }
          } catch (e) {
            log.info('[ytdlp] Error procesando MP3:', e.message)
          }
        } else {
          segundos = await getMp3Duration(rutaCache)
        }
        const nombre = `${limpiarNombre(titulo)}.mp3`;
        const payload = {
          audio: audioFinal,
          mimetype: 'audio/mpeg',
          fileName: nombre,
          ptt: false
        };
        if (segundos > 0) payload.seconds = segundos;
        await sock.sendMessage(msg.chat, payload, { quoted: msg })
        await sock.sendMessage(msg.chat, { text: caption }, { quoted: msg })
      } else if (buf.length <= LIMITE_VIDEO_DIRECTO && esMp4(buf)) {
        await sock.sendMessage(msg.chat, {
          video: buf,
          mimetype: 'video/mp4',
          caption,
          fileName: `${limpiarNombre(titulo)}.mp4`
        }, { quoted: msg })
      } else {
        await sock.sendMessage(msg.chat, {
          document: buf,
          mimetype: esMp4(buf) ? 'video/mp4' : 'application/octet-stream',
          fileName: `${limpiarNombre(titulo)}.mp4`,
          caption
        }, { quoted: msg })
      }

      await msg.react('✅')
    } catch (e) {
      await msg.react('❌')
      log.info(`[ytdlp] error: ${e.message}`)
      await msg.reply(
        `《✧》 Falló la descarga con yt-dlp.\n> ${e.message}\n\n` +
        `*Tips:* ¿yt-dlp está instalado? ¿ffmpeg (solo necesario para mp3)? ` +
        `Comprueba con \`yt-dlp --version\` y \`ffmpeg -version\`.`
      )
    }
  }
}
