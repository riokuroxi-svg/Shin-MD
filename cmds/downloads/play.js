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

import { getSelectedResponse } from "#lib/interactive-response";
import { sendNativeQuickReply } from "#lib/native-reply";
import { buildBottomSheet, buildMessageParams } from "#lib/native-params";
import { createProgress } from "#lib/progress";
import {
  descargarBuffer, sanitizeFilename, esMp4Valido, getVideoId, getVideoInfo,
  obtenerAudioProcesado, precalentarAudio, descargarVideoApis, prepararYtdlp,
} from "#lib/play-fuentes";


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
const MAX_MB_VIDEO = 100 * 1024 * 1024;

const ALIAS_MENU = ["play", "yt", "musica", "music"];
const ALIAS_AUDIO_DIRECTO = ["mp3", "ytmp3", "ytaudio", "playaudio", "playmp3"];


function getPendingMap(sock) {
  if (!sock._shinPlayPending) sock._shinPlayPending = new Map();
  return sock._shinPlayPending;
}

function esIphone(m) {
  return /^3A.{18}$/.test(String(m?.key?.id || ""));
}





// ── Metadata rápida oEmbed (60ms) ───────────────────────────

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
  // Un solo mensaje que se va editando (src/lib/progress.js). Editar NO
  // gasta cuota diaria (socket.js → esEnvioLigero), así que esto cuesta
  // lo mismo que el viejo "mando aviso y luego lo borro", pero el aviso
  // se queda de recibo con el título y la duración en vez de parpadear.
  // Importante: NO se edita mientras se descarga; el único retoque va
  // DESPUÉS del audio, para no meter ni un segundo de espera antes.
  // Panel de pasos NATIVO (el mismo que enseña Meta AI mientras
  // piensa). Sigue siendo UN mensaje que se edita: mismo coste de
  // cuota que la barra de antes, pero se ve como parte de WhatsApp.
  // El texto de la barra clásica viaja dentro del propio mensaje, así
  // que quien no lo dibuje lo ve exactamente igual que siempre.
  const prog = createProgress(sock, chat, {
    quoted: m,
    descripcion: job.title,
    pasos: [
      { titulo: `Buscando el ${tipo}`, detalle: job.title },
      { titulo: comoDoc ? "Preparando el archivo" : `Descargando ${tipo}` },
      { titulo: "Enviando" },
    ],
  });
  await prog.start({
    title: `Descargando ${tipo}`,
    detail: job.title,
    pct: 20,
  });

  try {
    liberar = await adquirir("descargas", 2);
    let buffer;
    if (tipo === "audio") {
      // (Antes había aquí una reacción 🖼️ extra: un envío más en la cola,
      //  ~1.5s de retraso añadido justo antes del audio, sin valor para nadie.)
      const procesado = await obtenerAudioProcesado(job);
      buffer = procesado.buffer;
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
      await prog.finish({
        title: `Listo · ${job.title}`,
        detail: segundos > 0
          ? `${tipo} · ${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`
          : tipo,
        pct: 100,
      });
    } else {
      const r = await descargarVideoApis(job.url);
      buffer = r.buffer;
      if (buffer.length > MAX_MB_VIDEO) throw new Error("Video muy grande (>100MB)");
      if (!esMp4Valido(buffer)) comoDoc = true;
      await sock.sendMessage(chat, {
        [comoDoc ? "document" : "video"]: buffer,
        mimetype: "video/mp4",
        fileName: `${sanitizeFilename(job.title)}.mp4`,
        caption: `乂 *Video*\n> ❒ Título › *${job.title}*${r.calidad ? `\n> ❒ Calidad › *${r.calidad}*` : ""}`,
      }, { quoted: m });
      await prog.finish({
        title: `Listo · ${job.title}`,
        detail: r.calidad ? `video · ${r.calidad}` : "video",
        pct: 100,
      });
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
    // El aviso ya está en pantalla: se edita. Antes se borraba y se
    // mandaba otro mensaje, o sea un envío más del cupo diario por cada
    // descarga fallida.
    if (e?.semaforo) {
      await prog.fail("Ya hay 2 descargas en curso. Espera un momento e inténtalo de nuevo.");
      return;
    }
    await prog.fail(`${e?.message || e} · Prueba con otro enlace o canción.`);
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
      const hayYtdlp = await prepararYtdlp();

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
        // Mismo criterio que arriba: un solo mensaje que se edita.
        const prog = createProgress(sock, ctx.chatId, { quoted: ctx.full });
        await prog.start({ title: "Descargando audio", detail: input, pct: 20 });
        try {
          const job = {
            url: videoId ? `https://youtu.be/${videoId}` : input,
            videoId,
            title: input,
          };
          const procesado = await obtenerAudioProcesado(job);
          const safeName = `${sanitizeFilename(input)}.mp3`;
          const audioPayload = {
            audio: procesado.buffer,
            mimetype: "audio/mpeg",
            fileName: safeName,
            ptt: false,
          };
          if (procesado.seconds > 0) audioPayload.seconds = procesado.seconds;
          await sock.sendMessage(ctx.chatId, audioPayload, { quoted: ctx.full });
          await prog.finish({
            title: `Listo · ${input}`,
            detail: procesado.seconds > 0
              ? `audio · ${Math.floor(procesado.seconds / 60)}:${String(procesado.seconds % 60).padStart(2, "0")}`
              : "audio",
            pct: 100,
          });
          return null;
        } catch (e) {
          await prog.fail(e?.message || e);
          return null; // el aviso de error ya está editado en pantalla
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
        ? infoTxt + `_Elige abajo. Si tu WhatsApp no pinta los botones, cita este mensaje y escribe *1* (audio) o *2* (vídeo)._`
        : infoTxt + `🟡 *Reacciona:* 👍 = audio 🎵, ❤️ = video 🎬`;

      const cardToken = `sn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const botones = usarBotones ? [
        { buttonId: `${cardToken}_pa`, buttonText: { displayText: hayYtdlp ? "🎵 Audio ⚡" : "🎵 Audio MP3" }, type: 1 },
        { buttonId: `${cardToken}_pv`, buttonText: { displayText: "🎬 Video MP4" }, type: 1 },
      ] : [];

      // Los dos primeros se ven en el chat; el resto vive en la hoja
      // desplegable. Sin la hoja, WhatsApp se comería los de más.
      const botonesExtra = usarBotones ? [
        { text: "📄 Audio como documento", id: `${cardToken}_pad` },
        { text: "▶️ Abrir en YouTube", url },
        { text: "📋 Copiar enlace", copy_code: url },
      ] : [];

      const paramsTarjeta = usarBotones
        ? buildMessageParams({
            bottomSheet: buildBottomSheet({
              inThreadLimit: 2,
              dividers: [2],
              listTitle: title.slice(0, 60),
              buttonTitle: "Más opciones",
            }),
          })
        : "";

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
          buttons: [
            ...botones.map(b => ({ text: b.buttonText.displayText, id: b.buttonId })),
            ...botonesExtra,
          ],
          params: paramsTarjeta,
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
