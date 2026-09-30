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

import { buildRichContent, texto, tabla, codigo, rejilla, reels, mapa, latex } from "#lib/rich-response";
import { PASO, buildStepsContent } from "#lib/bot-steps";
import { buildQuiz, sendImagePoll } from "#lib/poll-plus";
import { sendAlbum, sendEventCover } from "#lib/album";
import { sendVoiceArt, hexToArgb } from "#lib/voice-art";
import { drawWaveform } from "#lib/waveform";
import {
  botonRapido, botonUrl, botonCopiar, botonLlamar, botonRecordatorio,
  botonUbicacion, botonWebview, botonLista, buildCtaContent,
} from "#lib/cta-buttons";
import {
  buildLlamadaProgramada, buildUbicacionViva, buildSolicitudPago, buildPedido, buildPin,
} from "#lib/native-actions";

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

/** Quiz nativo: WhatsApp marca solo el acierto y el fallo. */
export function buildQuizDemo() {
  return buildQuiz({
    pregunta: "¿Quién compuso «Lemon»?",
    opciones: ["Yoasobi", "Kenshi Yonezu", "Aimer", "Radwimps"],
    correcta: 1,
  });
}

/** Etiqueta propia junto al nombre de un miembro del grupo. */
export function buildEtiqueta({ jid = "", etiqueta = "Nivel 42 · Leyenda", cuerpo = "Mira la etiqueta que llevo al lado del nombre." } = {}) {
  return {
    extendedTextMessage: {
      text: cuerpo,
      contextInfo: {
        memberLabel: { label: String(etiqueta), labelTimestamp: Math.floor(Date.now() / 1000) },
        ...(jid ? { mentionedJid: [jid] } : {}),
      },
    },
  };
}

/** Ficha de producto con precio: para la tienda del bot. */
export function buildProducto({
  titulo = "Poción de vida", descripcion = "Cura 50 HP al instante.",
  precio = 250, moneda = "MXN", vendedor = "", imagenUrl = "",
} = {}) {
  return {
    productMessage: {
      product: {
        ...(imagenUrl ? { productImage: { url: imagenUrl, mimetype: "image/jpeg" } } : {}),
        productId: "shin-pocion",
        title: String(titulo),
        description: String(descripcion),
        currencyCode: String(moneda),
        priceAmount1000: Math.round(precio * 1000),
        retailerId: "shin-md",
        productImageCount: imagenUrl ? 1 : 0,
      },
      ...(vendedor ? { businessOwnerJid: vendedor } : {}),
      body: { text: "Tienda de Shin-MD" },
      footer: { text: "❦ Shin-MD" },
    },
  };
}

/** Comentario colgado de otro mensaje (hilo, no cita). */
export function buildComentario({ targetKey, cuerpo = "Esto es un comentario, no una cita." } = {}) {
  if (!targetKey?.id) throw new Error("falta el mensaje al que comentar");
  return {
    commentMessage: {
      message: { conversation: String(cuerpo) },
      targetMessageKey: targetKey,
    },
  };
}

/** Los ocho botones nativos que el bot no usaba, en una sola tarjeta. */
export function buildCtasDemo() {
  return buildCtaContent({
    titulo: "Shin-MD · botonera completa",
    texto: "Los ocho tipos de botón que WhatsApp sabe dibujar y casi nadie usa.",
    pie: "❦ Shin-MD · 反魂",
    botones: [
      botonUrl({ texto: "Ver el repo", url: "https://github.com/riokuroxi-svg/Shin-MD" }),
      botonCopiar({ texto: "Copiar código", codigo: "SHIN-2026" }),
      botonLlamar({ texto: "Llamar al dueño", telefono: "+520000000000" }),
      botonRecordatorio({ texto: "Recordármelo" }),
      botonUbicacion({ texto: "Mandar mi ubicación" }),
      botonWebview({ titulo: "Abrir mini web", url: "https://github.com/riokuroxi-svg/Shin-MD" }),
      botonRapido({ texto: "Menú", id: ".menu" }),
      botonLista({
        titulo: "Categorías",
        secciones: [
          { titulo: "Música", filas: [{ titulo: "play", descripcion: "baja canciones", id: ".play" }] },
          { titulo: "Juegos", etiqueta: "nuevo", filas: [{ titulo: "trivia", descripcion: "quiz nativo", id: ".trivia" }] },
        ],
      }),
    ],
    hoja: { titulo: "Todas las acciones", boton: "Ver las 8" },
  });
}

/** Llamada programada: sale con su hora y su botón de avisarme. */
export function buildProgramada() {
  return buildLlamadaProgramada({
    cuando: Date.now() + 26 * 3600 * 1000,
    titulo: "Noche de trivia de Shin-MD",
    video: true,
  });
}

/** Ubicación en vivo. */
export function buildEnVivo() {
  return buildUbicacionViva({
    lat: 19.6011, lon: -99.0526, velocidad: 1.4, nota: "Shin-MD en movimiento", secuencia: 1,
  });
}

/** Carrito con total y número de artículos. */
export function buildCarrito({ vendedor = "" } = {}) {
  return buildPedido({
    id: "shin-001", titulo: "Tienda de Shin-MD", articulos: 3, total: 120,
    resumen: "1 katana · 2 pociones", vendedor,
  });
}

/** Cobro con fondo de color. */
export function buildCobro({ de = "" } = {}) {
  return buildSolicitudPago({
    monto: 500, moneda: "MXN", nota: "Renovación de premium", de, color: "#8B6CFF",
  });
}

/** Panel de pasos de razonamiento, como el de Meta AI. */
export function buildPasos() {
  return buildStepsContent({
    descripcion: "Preparando tu canción",
    texto: "● Buscando en YouTube\n◐ Descargando audio\n○ Enviando",
    disclaimer: "Shin-MD",
    pasos: [
      { titulo: "Buscando en YouTube", detalle: "3 resultados", estado: PASO.HECHO, razonando: true,
        fuentes: [{ titulo: "youtube.com", url: "https://youtube.com" }] },
      { titulo: "Descargando audio", detalle: "4.2 MB · 128 kbps", estado: PASO.EJECUTANDO,
        secciones: [{ titulo: "Calidad", cuerpo: "128 kbps" }] },
      { titulo: "Enviando", estado: PASO.PLANEADO },
    ],
  });
}

/** Carrusel de vídeos dentro de una sola burbuja. */
export function buildReels(items) {
  const lista = items?.length ? items : [
    { titulo: "Yoasobi · Idol", miniatura: "https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg", video: "https://youtu.be/ZRtdQ81jPUQ" },
    { titulo: "Kenshi Yonezu · Lemon", miniatura: "https://i.ytimg.com/vi/SX_ViT4Ra7k/hqdefault.jpg", video: "https://youtu.be/SX_ViT4Ra7k" },
  ];
  return buildRichContent([texto("*Resultados de la búsqueda*"), reels(lista)], {
    disclaimer: "Shin-MD · resultados",
  });
}

/** Mapa con chinchetas numeradas y lista debajo. */
export function buildMapa() {
  return buildRichContent([
    texto("*Dónde queda la quedada*"),
    mapa({ puntos: [
      { lat: 19.6011, lon: -99.0526, titulo: "Ecatepec", cuerpo: "Punto de encuentro" },
      { lat: 19.4326, lon: -99.1332, titulo: "Zócalo", cuerpo: "Plan B" },
    ] }),
  ], { disclaimer: "Shin-MD · mapa" });
}

/** Fórmula matemática compuesta. */
export function buildLatex() {
  return buildRichContent([
    texto("La de siempre:"),
    latex("{{0}} y también {{1}}", [
      { expr: "E = mc^2", ancho: 140, alto: 44 },
      { expr: "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}", ancho: 220, alto: 60 },
    ]),
  ], { disclaimer: "Shin-MD · fórmulas" });
}

/** Lista de productos nativa (catálogo). */
export function buildCatalogo({ vendedor = "" } = {}) {
  return {
    listMessage: {
      title: "Tienda de Shin-MD",
      description: "Gasta las monedas que tanto te costaron.",
      buttonText: "Ver tienda",
      footerText: "❦ Shin-MD",
      listType: 2, // PRODUCT_LIST
      productListInfo: {
        ...(vendedor ? { businessOwnerJid: vendedor } : {}),
        productSections: [
          { title: "Pociones", products: [{ productId: "shin-pocion" }, { productId: "shin-elixir" }] },
          { title: "Armas", products: [{ productId: "shin-katana" }] },
        ],
      },
    },
  };
}

/** Registro de llamada (tarjeta de sistema). */
export function buildRegistroLlamada() {
  return {
    callLogMesssage: {
      isVideo: true,
      callOutcome: 1, // MISSED
      durationSecs: 0,
      callType: 1,    // SCHEDULED_CALL
      participants: [],
    },
  };
}

/**
 * Zonas pinchables dentro de una foto.
 * Las coordenadas van de 0 a 1 sobre la imagen.
 */
export function anotarImagen(imageMessage, zonas = []) {
  if (!imageMessage) throw new Error("falta el imageMessage");
  imageMessage.interactiveAnnotations = zonas.map((z) => {
    const zona = { polygonVertices: z.vertices };

    // 1) Zona que abre un enlace al tocarla.
    if (z.enlace) {
      zona.tapAction = { title: String(z.nombre || ""), tapUrl: String(z.enlace) };
      zona.shouldSkipConfirmation = z.sinAviso !== false;
      return zona;
    }

    // 2) Zona con una canción pegada (la chapa de música de los estados).
    if (z.cancion) {
      zona.embeddedContent = {
        embeddedMusic: {
          title: String(z.cancion.titulo ?? ""),
          author: String(z.cancion.autor ?? ""),
          artistAttribution: String(z.cancion.atribucion ?? z.cancion.autor ?? ""),
          isExplicit: Boolean(z.cancion.explicito),
          ...(z.cancion.id ? { songId: String(z.cancion.id) } : {}),
        },
      };
      return zona;
    }

    // 3) Por defecto, la etiqueta de lugar.
    zona.location = {
      degreesLatitude: z.lat ?? 0,
      degreesLongitude: z.lon ?? 0,
      name: String(z.nombre || ""),
    };
    return zona;
  });
  return imageMessage;
}

/**
 * Botón de enlace pegado a CUALQUIER mensaje, sin tarjeta interactiva:
 * va en el contextInfo, así que funciona hasta en un texto suelto.
 */
export function conBotonEnlace(contextInfo = {}, { url, texto: rotulo }) {
  if (!url) throw new Error("el botón de enlace necesita url");
  return { ...contextInfo, actionLink: { url: String(url), buttonTitle: String(rotulo || "Abrir") } };
}

/** Menciona un grupo dentro del texto (queda pinchable, como un @). */
export function conMencionDeGrupo(contextInfo = {}, grupos = []) {
  const lista = (Array.isArray(grupos) ? grupos : []).filter((g) => g?.jid);
  if (!lista.length) return contextInfo;
  return {
    ...contextInfo,
    groupMentions: lista.map((g) => ({ groupJid: String(g.jid), groupSubject: String(g.nombre ?? "") })),
  };
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

  deContenido("quiz", "Encuesta tipo QUIZ (con respuesta correcta)",
    "Al votar, WhatsApp marca solo el acierto en verde y el fallo en rojo.",
    () => buildQuizDemo()),

  deContenido("etiqueta", "Etiqueta junto al nombre del miembro",
    "Un distintivo propio («Nivel 42») pegado al nombre, como el de admin.",
    (ctx) => buildEtiqueta({ jid: ctx.autor })),

  deContenido("producto", "Ficha de producto con precio",
    "Tarjeta de tienda con foto, precio y moneda, no un texto con emojis.",
    (ctx) => buildProducto({ vendedor: ctx.autor })),

  deContenido("comentario", "Comentario colgado de un mensaje",
    "Un hilo debajo del mensaje original, distinto de una cita normal.",
    (ctx) => buildComentario({ targetKey: ctx.quoted?.key || ctx.targetKey })),

  deContenido("ctas", "La botonera completa (8 tipos)",
    "Enlace, copiar, llamar, recordatorio, ubicación, mini web, lista y respuesta rápida, todo junto.",
    () => buildCtasDemo()),

  deContenido("programada", "Llamada programada",
    "La tarjeta de llamada agendada, con su hora y su recordatorio.",
    () => buildProgramada()),

  deContenido("envivo", "Ubicación en vivo",
    "El mapa que se mueve solo, no una chincheta muerta.",
    () => buildEnVivo()),

  deContenido("carrito", "Pedido con total",
    "La tarjeta de carrito: número de artículos e importe.",
    (ctx) => buildCarrito({ vendedor: ctx.autor })),

  deContenido("cobro", "Cobro con fondo de color",
    "Solicitud de pago con el importe en grande y el color de la marca.",
    (ctx) => buildCobro({ de: ctx.autor })),

  deContenido("pasos", "Pasos de razonamiento (panel de Meta AI)",
    "Un panel con los pasos tachándose solos y sus fuentes, no una barra de texto.",
    () => buildPasos()),

  deContenido("reels", "Carrusel de vídeos en una burbuja",
    "Tarjetas con portada y título que se deslizan dentro del mensaje.",
    (ctx) => buildReels(ctx.items)),

  deContenido("mapa", "Mapa con chinchetas numeradas",
    "Un mapa de verdad dentro de la burbuja, con su lista de puntos.",
    () => buildMapa()),

  deContenido("latex", "Fórmulas matemáticas",
    "Las fórmulas se ven compuestas, no como texto plano.",
    () => buildLatex()),

  deContenido("catalogo", "Lista de productos (catálogo)",
    "Un catálogo con secciones y productos, no una lista con emojis.",
    (ctx) => buildCatalogo({ vendedor: ctx.autor })),

  deContenido("llamadalog", "Registro de llamada",
    "La tarjeta gris de «llamada perdida» que pone el sistema.",
    () => buildRegistroLlamada()),

  {
    clave: "fotoencuesta",
    titulo: "Encuesta con foto en cada opción",
    mira: "Las opciones se votan mirando imágenes, no leyendo nombres.",
    async ejecutar(sock, ctx) {
      const fotos = portadasDisponibles(3);
      if (fotos.length < 2) return { ok: false, motivo: "no hay portadas en media/covers" };

      const r = await sendImagePoll(sock, ctx.jid, {
        pregunta: "¿Cuál portada para el menú?",
        items: fotos.map((f, i) => ({ texto: `Portada ${i + 1}`, imagen: fs.readFileSync(f) })),
      }, { quoted: ctx.quoted });

      return r.sent ? { ok: true } : { ok: false, motivo: String(r.error?.message || r.error) };
    },
  },

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
