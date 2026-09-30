/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lab-experiments.js — Catálogo del laboratorio de interfaz
//
//  POR QUÉ EXISTE ESTE ARCHIVO
//  ---------------------------
//  Rebuscando en el protobuf de baileys 6.7.24 aparecieron 86 tipos
//  de mensaje. Los bots usan ocho. El resto son piezas de interfaz
//  que WhatsApp sí entiende y que nadie manda: álbumes, portadas de
//  evento, tarjetas de cobro con color, resultados de encuesta,
//  llamadas programadas, zonas pinchables dentro de una foto,
//  tipografías, tarjetas estilo Meta AI...
//
//  Que el mensaje se arme y viaje se comprueba aquí con pruebas
//  (codifica y decodifica contra el proto real). Lo que NO se puede
//  comprobar desde el servidor es si la versión de WhatsApp del
//  teléfono lo dibuja. Para eso está .lab: se manda uno por uno, se
//  mira en pantalla, y solo lo que se ve bien pasa a un comando de
//  uso diario.
//
//  Cada experimento:
//    clave    → nombre corto para invocarlo
//    titulo   → qué es
//    mira     → qué debería verse si funciona
//    construir(ctx) → contenido listo para relayMessage  [opcional]
//    ejecutar(sock, ctx) → envío completo (medios, varios pasos)
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

import { buildRichContent, texto, tabla, codigo, rejilla } from "#lib/rich-response";
import { sendAlbum, sendEventCover } from "#lib/album";
import { sendVoiceArt, hexToArgb } from "#lib/voice-art";
import { drawWaveform } from "#lib/waveform";

const COVERS = path.join(process.cwd(), "media", "covers");

/** Rutas de portadas que existan de verdad (para no mandar aire). */
export function portadasDisponibles(limite = 4) {
  try {
    return fs.readdirSync(COVERS)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .slice(0, limite)
      .map((f) => path.join(COVERS, f));
  } catch {
    return [];
  }
}

// ── Constructores puros ────────────────────────────────────────────

/** Tarjeta estilo Meta AI con una tabla de verdad. */
export function buildTabla() {
  return buildRichContent([
    texto("*Top de la semana*"),
    tabla([
      ["#", "Usuario", "Nivel", "Monedas"],
      ["1", "Rio", "42", "18 400"],
      ["2", "Kuro", "38", "15 950"],
      ["3", "Shin", "31", "11 230"],
    ], { titulo: "Ranking del grupo" }),
  ], {
    disclaimer: "Shin-MD · datos del grupo",
    sugerencias: ["Ver mi posición", "Top de monedas"],
  });
}

/** Bloque de código con resaltado nativo. */
export function buildCodigo() {
  return buildRichContent([
    texto("Así queda un bloque de código nativo:"),
    codigo('const saludo = "hola";\n// esto es un comentario\nconsole.log(saludo, 42);', "javascript"),
  ], { disclaimer: "Shin-MD · bloque de código" });
}

/** Rejilla de imágenes dentro de una sola burbuja. */
export function buildMosaico(urls = []) {
  const lista = urls.length ? urls : [
    "https://i.imgur.com/0y0y0y0.jpeg",
    "https://i.imgur.com/1y1y1y1.jpeg",
  ];
  return buildRichContent([texto("*Resultados*"), rejilla(lista)], {
    disclaimer: "Shin-MD · mosaico",
  });
}

/** Texto normal + píldoras de sugerencia + línea de aviso. */
export function buildChips({ cuerpo = "¿Qué quieres hacer?", sugerencias = ["Menú", "Mi perfil", "Jugar"] } = {}) {
  return {
    messageContextInfo: {
      botMetadata: {
        messageDisclaimerText: "Shin-MD",
        suggestedPromptMetadata: {
          suggestedPrompts: sugerencias,
          promptSuggestions: { suggestions: sugerencias.map((p, i) => ({ prompt: p, promptId: `shin_${i}` })) },
        },
      },
    },
    extendedTextMessage: { text: cuerpo },
  };
}

/** Llamada programada: tarjeta con recordatorio nativo. */
export function buildLlamada({ titulo = "Noche de anime", cuando = Date.now() + 3 * 3600 * 1000, video = true } = {}) {
  return {
    scheduledCallCreationMessage: {
      scheduledTimestampMs: Math.round(cuando),
      callType: video ? 2 : 1,
      title: String(titulo),
    },
  };
}

/** Tarjeta de cobro con fondo de color (para la economía del bot). */
export function buildPago({ nota = "Pase del torneo", monto = 50, moneda = "MXN", de = "", expira = Date.now() + 86400000 } = {}) {
  return {
    requestPaymentMessage: {
      currencyCodeIso4217: String(moneda),
      amount1000: Math.round(monto * 1000),
      ...(de ? { requestFrom: de } : {}),
      expiryTimestamp: Math.round(expira / 1000),
      noteMessage: { extendedTextMessage: { text: String(nota) } },
      background: {
        id: "shin-md",
        type: 1,
        placeholderArgb: hexToArgb("#1b1030"),
        textArgb: hexToArgb("#ffffff"),
        subtextArgb: hexToArgb("#ff4fa3"),
      },
    },
  };
}

/** Resultado de encuesta ya cerrado, como tarjeta. */
export function buildEncuesta({ nombre = "¿Qué vemos el viernes?", votos = [["Anime", 12], ["Película", 7], ["Nada", 2]] } = {}) {
  return {
    pollResultSnapshotMessage: {
      name: String(nombre),
      pollVotes: votos.map(([optionName, optionVoteCount]) => ({
        optionName: String(optionName),
        optionVoteCount: Math.round(optionVoteCount),
      })),
    },
  };
}

/** Invitación a grupo como tarjeta, no como enlace pelado. */
export function buildInvitacion({ groupJid, codigo, nombre = "Grupo", caption = "Te invito", expira = Math.floor(Date.now() / 1000) + 86400, thumbnail } = {}) {
  if (!groupJid || !codigo) throw new Error("faltan el grupo y el código");
  const m = {
    groupInviteMessage: {
      groupJid: String(groupJid),
      inviteCode: String(codigo),
      inviteExpiration: Math.round(expira),
      groupName: String(nombre),
      caption: String(caption),
      groupType: 0,
    },
  };
  if (thumbnail) m.groupInviteMessage.jpegThumbnail = thumbnail;
  return m;
}

/**
 * Zonas pinchables dentro de una foto.
 * Las coordenadas van de 0 a 1 sobre la imagen.
 */
export function anotarImagen(imageMessage, zonas = []) {
  if (!imageMessage) throw new Error("falta el imageMessage");
  imageMessage.interactiveAnnotations = zonas.map((z) => ({
    polygonVertices: z.vertices,
    location: {
      degreesLatitude: z.lat ?? 0,
      degreesLongitude: z.lon ?? 0,
      name: String(z.nombre || ""),
    },
  }));
  return imageMessage;
}

// ── Utilidad de envío para los experimentos de contenido ───────────

async function relayear(sock, jid, contenido, quoted) {
  const { generateWAMessageFromContent } = await import("baileys");
  const generado = generateWAMessageFromContent(jid, contenido, {
    userJid: sock.user?.id,
    quoted,
    timestamp: new Date(),
  });
  if (!generado?.key?.id) throw new Error("no se generó el mensaje");
  await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
  return generado.key;
}

function deContenido(clave, titulo, mira, construir) {
  return {
    clave,
    titulo,
    mira,
    construir,
    async ejecutar(sock, ctx) {
      await relayear(sock, ctx.jid, construir(ctx), ctx.quoted);
      return { ok: true };
    },
  };
}

// ── Catálogo ───────────────────────────────────────────────────────

export const EXPERIMENTOS = [
  deContenido("tabla", "Tabla nativa (estilo Meta AI)",
    "Una tabla de verdad con columnas alineadas, no texto con guiones.",
    () => buildTabla()),

  deContenido("codigo", "Bloque de código resaltado",
    "Código con colores y fondo oscuro dentro de la burbuja.",
    () => buildCodigo()),

  deContenido("mosaico", "Rejilla de imágenes en una burbuja",
    "Varias miniaturas en cuadrícula dentro de un solo mensaje.",
    (ctx) => buildMosaico(ctx.urls || [])),

  deContenido("chips", "Píldoras de sugerencia + línea de aviso",
    "Botones-pastilla debajo del texto y una línea gris encima.",
    () => buildChips()),

  deContenido("llamada", "Llamada programada",
    "Tarjeta de llamada con hora y botón de recordatorio.",
    () => buildLlamada()),

  deContenido("pago", "Tarjeta de cobro con color",
    "Tarjeta de solicitud de pago con fondo morado y texto rosa.",
    (ctx) => buildPago({ de: ctx.autor })),

  deContenido("encuesta", "Resultado de encuesta",
    "Tarjeta con los votos ya contados, sin poder votar.",
    () => buildEncuesta()),

  {
    clave: "album",
    titulo: "Álbum nativo de fotos",
    mira: "Las portadas agrupadas en UNA cuadrícula, no 4 mensajes sueltos.",
    async ejecutar(sock, ctx) {
      const fotos = portadasDisponibles(4);
      if (fotos.length < 2) return { ok: false, motivo: "no hay portadas en media/covers" };
      const r = await sendAlbum(sock, ctx.jid, fotos.map((f) => ({ image: fs.readFileSync(f) })), { quoted: ctx.quoted });
      return r.sent ? { ok: true } : { ok: false, motivo: String(r.error?.message || r.error) };
    },
  },

  {
    clave: "portada",
    titulo: "Evento con portada",
    mira: "La tarjeta de evento con una imagen de cabecera encima.",
    async ejecutar(sock, ctx) {
      const { generateWAMessageFromContent } = await import("baileys");
      const inicio = Math.floor((Date.now() + 86400000) / 1000);
      const evento = generateWAMessageFromContent(ctx.jid, {
        eventMessage: {
          name: "Prueba de portada",
          description: "Experimento del laboratorio de Shin-MD.",
          startTime: inicio,
          endTime: inicio + 7200,
          extraGuestsAllowed: true,
          isCanceled: false,
        },
      }, { userJid: sock.user?.id, timestamp: new Date() });

      await sock.relayMessage(ctx.jid, evento.message, { messageId: evento.key.id });

      const fotos = portadasDisponibles(1);
      if (!fotos.length) return { ok: true, motivo: "evento enviado sin portada (no hay imágenes)" };

      const r = await sendEventCover(sock, ctx.jid, fs.readFileSync(fotos[0]), evento.key);
      return r.sent ? { ok: true } : { ok: false, motivo: String(r.error?.message || r.error) };
    },
  },

  {
    clave: "voz",
    titulo: "Nota de voz con onda dibujada",
    mira: "La barra de sonido forma un dibujo (y la burbuja va de color).",
    necesita: "responde a un audio",
    async ejecutar(sock, ctx) {
      if (typeof ctx.descargarAudio !== "function") return { ok: false, motivo: "responde a un audio con .lab voz" };
      const audio = await ctx.descargarAudio();
      if (!audio) return { ok: false, motivo: "responde a un audio con .lab voz" };

      const r = await sendVoiceArt(sock, ctx.jid, {
        audio,
        patron: ctx.patron || "ecualizador",
        semilla: ctx.semilla || "shin-md",
        color: "#ff4fa3",
        quoted: ctx.quoted,
      });
      return r.sent ? { ok: true } : { ok: false, motivo: String(r.error?.message || r.error) };
    },
  },

  {
    clave: "fuentes",
    titulo: "Tipografías y fondo de color",
    mira: "El texto sale con otra letra y fondo de color, no en gris normal.",
    async ejecutar(sock, ctx) {
      const fuente = Number.isFinite(ctx.fuente) ? ctx.fuente : 8; // CALISTOGA
      await sock.sendMessage(
        ctx.jid,
        { text: ctx.texto || "Shin-MD · tipografía " + fuente },
        { quoted: ctx.quoted, backgroundColor: "#1b1030", font: fuente },
      );
      return { ok: true };
    },
  },

  {
    clave: "zonas",
    titulo: "Zonas pinchables dentro de una foto",
    mira: "Al tocar la mitad de arriba de la imagen salta una etiqueta.",
    async ejecutar(sock, ctx) {
      const fotos = portadasDisponibles(1);
      if (!fotos.length) return { ok: false, motivo: "no hay portadas en media/covers" };

      const { prepareWAMessageMedia, generateWAMessageFromContent } = await import("baileys");
      const preparado = await prepareWAMessageMedia(
        { image: fs.readFileSync(fotos[0]) },
        { upload: sock.waUploadToServer },
      );
      const imageMessage = preparado?.imageMessage;
      if (!imageMessage) return { ok: false, motivo: "no se pudo subir la imagen" };

      imageMessage.caption = "Toca la mitad de arriba.";
      anotarImagen(imageMessage, [{
        vertices: [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 }, { x: 0.95, y: 0.45 }, { x: 0.05, y: 0.45 }],
        lat: 19.6011, lon: -99.0526, nombre: "Shin-MD",
      }]);

      const generado = generateWAMessageFromContent(ctx.jid, { imageMessage }, {
        userJid: sock.user?.id, quoted: ctx.quoted, timestamp: new Date(),
      });
      await sock.relayMessage(ctx.jid, generado.message, { messageId: generado.key.id });
      return { ok: true };
    },
  },
];

/** Busca por clave o por número de lista (1..n). */
export function buscarExperimento(entrada) {
  const t = String(entrada ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return EXPERIMENTOS[parseInt(t, 10) - 1] || null;
  return EXPERIMENTOS.find((e) => e.clave === t) || null;
}

/** Lista legible para el mensaje de ayuda. */
export function listarExperimentos() {
  return EXPERIMENTOS.map((e, i) => ({
    n: i + 1,
    clave: e.clave,
    titulo: e.titulo,
    mira: e.mira,
    necesita: e.necesita || "",
  }));
}

export { drawWaveform };
