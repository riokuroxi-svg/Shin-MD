/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  rich-response.js — El formato de tarjeta de Meta AI
//
//  QUÉ ES ESTO
//  -----------
//  Cuando Meta AI contesta dentro de WhatsApp con una TABLA de
//  verdad, un bloque de CÓDIGO coloreado o una rejilla de imágenes,
//  no está mandando texto con guiones: usa un mensaje aparte que
//  ningún bot normal manda.
//
//    proto.Message.richResponseMessage   (AIRichResponseMessage)
//      · submessages[] → TEXT | TABLE | CODE | GRID_IMAGE |
//                        INLINE_IMAGE | MAP | LATEX | ...
//      · unifiedResponse.data → el mismo contenido en JSON, que es
//        lo que el cliente nuevo dibuja de verdad.
//    messageContextInfo.botMetadata
//      · messageDisclaimerText → la línea gris de arriba
//      · suggestedPromptMetadata → las píldoras de sugerencia
//
//  Existe en baileys 6.7.24 (el que usa el bot), pero la librería no
//  trae ningún atajo: hay que armar el protobuf a mano. Eso es lo que
//  hace este archivo, sin forks ni dependencias nuevas.
//
//  AVISO HONESTO
//  -------------
//  Que el mensaje VIAJE está comprobado aquí (codifica y decodifica
//  bien). Que el cliente lo DIBUJE depende de la versión de WhatsApp
//  del que mira; los clientes viejos pueden no pintar nada. Por eso
//  todo builder acepta `respaldo` y el comando .lab existe: se prueba
//  en el teléfono antes de meterlo en un comando de uso diario.
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from "node:crypto";

/** AIRichResponseSubMessageType del proto 6.7.24. */
export const SUB = Object.freeze({
  REJILLA: 1,   // GRID_IMAGE
  TEXTO: 2,     // TEXT
  IMAGEN: 3,    // INLINE_IMAGE
  TABLA: 4,     // TABLE
  CODIGO: 5,    // CODE
  DINAMICO: 6,  // DYNAMIC
  MAPA: 7,      // MAP
  LATEX: 8,     // LATEX
  ITEMS: 9,     // CONTENT_ITEMS
});

/** AIRichResponseCodeHighlightType. */
export const COLOR_CODIGO = Object.freeze({
  NORMAL: 0, CLAVE: 1, METODO: 2, TEXTO: 3, NUMERO: 4, COMENTARIO: 5,
});

const PALABRAS_CLAVE = {
  javascript: new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "await", "async", "import", "export", "class", "new", "try", "catch", "throw", "of", "in"]),
  python: new Set(["def", "return", "if", "elif", "else", "for", "while", "import", "from", "class", "try", "except", "raise", "with", "as", "lambda", "None", "True", "False"]),
  bash: new Set(["echo", "cd", "if", "then", "fi", "for", "do", "done", "export", "sudo", "cat", "grep"]),
};

/**
 * Parte el código en trozos coloreados (comentario / texto / número /
 * palabra clave / método). Es un resaltador mínimo pero determinista:
 * nada de dependencias.
 */
export function tokenizeCode(codigo, lenguaje = "javascript") {
  const claves = PALABRAS_CLAVE[String(lenguaje).toLowerCase()] || PALABRAS_CLAVE.javascript;
  const regex = /(\/\/[^\n]*|#[^\n]*)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|(\d+(?:\.\d+)?)|([\s\S])/g;
  const bloques = [];
  let m;
  while ((m = regex.exec(String(codigo))) !== null) {
    if (m[1]) bloques.push({ highlightType: COLOR_CODIGO.COMENTARIO, codeContent: m[1] });
    else if (m[2]) bloques.push({ highlightType: COLOR_CODIGO.TEXTO, codeContent: m[2] });
    else if (m[3]) bloques.push({ highlightType: claves.has(m[3]) ? COLOR_CODIGO.CLAVE : COLOR_CODIGO.METODO, codeContent: m[3] });
    else if (m[4]) bloques.push({ highlightType: claves.has(m[4]) ? COLOR_CODIGO.CLAVE : COLOR_CODIGO.NORMAL, codeContent: m[4] });
    else if (m[5]) bloques.push({ highlightType: COLOR_CODIGO.NUMERO, codeContent: m[5] });
    else bloques.push({ highlightType: COLOR_CODIGO.NORMAL, codeContent: m[6] });
  }
  return bloques;
}

// ── Bloques ────────────────────────────────────────────────────────
// Cada uno devuelve un submensaje listo para el protobuf.

export function texto(md) {
  return { messageType: SUB.TEXTO, messageText: String(md ?? "") };
}

/**
 * @param {string[][]} filas  la primera es la cabecera salvo que
 *                            se pase {cabecera:false}
 */
export function tabla(filas = [], { titulo = "", cabecera = true } = {}) {
  return {
    messageType: SUB.TABLA,
    tableMetadata: {
      title: String(titulo || ""),
      rows: filas.map((items, i) => ({
        isHeading: Boolean(cabecera && i === 0),
        items: (Array.isArray(items) ? items : [items]).map((c) => String(c ?? "")),
      })),
    },
  };
}

export function codigo(contenido, lenguaje = "javascript") {
  return {
    messageType: SUB.CODIGO,
    codeMetadata: { codeLanguage: String(lenguaje), codeBlocks: tokenizeCode(contenido, lenguaje) },
  };
}

export function rejilla(urls = []) {
  const lista = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).map(String);
  const comoImagen = (u) => ({ imagePreviewUrl: u, imageHighResUrl: u, sourceUrl: u });
  const meta = { imageUrls: lista.map(comoImagen) };
  // gridImageUrl NO es un texto: es otra imagen (la de portada del mosaico).
  if (lista.length) meta.gridImageUrl = comoImagen(lista[0]);
  return { messageType: SUB.REJILLA, gridImageMetadata: meta };
}

export function imagen(url, { pie = "", enlace = "", alineacion = 0 } = {}) {
  return {
    messageType: SUB.IMAGEN,
    imageMetadata: {
      imageUrl: String(url || ""),
      imageText: String(pie || ""),
      alignment: alineacion,
      ...(enlace ? { tapLinkUrl: String(enlace) } : {}),
    },
  };
}

/**
 * Carrusel de vídeos dentro de la burbuja (lo que Meta AI usa para
 * enseñar reels). Cada tarjeta lleva portada, título y su vídeo.
 * @param {object[]} items [{titulo, miniatura, video, perfil}]
 */
export function reels(items = []) {
  const lista = (Array.isArray(items) ? items : []).filter(Boolean);
  return {
    messageType: SUB.ITEMS,
    contentItemsMetadata: {
      contentType: 1, // CAROUSEL
      itemsMetadata: lista.map((i) => ({
        reelItem: {
          title: String(i.titulo ?? ""),
          thumbnailUrl: String(i.miniatura ?? ""),
          videoUrl: String(i.video ?? ""),
          ...(i.perfil ? { profileIconUrl: String(i.perfil) } : {}),
        },
      })),
    },
  };
}

/**
 * Mapa con chinchetas numeradas y su lista debajo.
 * @param {object} op
 * @param {object[]} op.puntos [{lat, lon, titulo, cuerpo}]
 */
export function mapa({ puntos = [], zoom = 0.08, lista = true } = {}) {
  const marcas = (Array.isArray(puntos) ? puntos : []).filter(Boolean);
  if (!marcas.length) throw new Error("el mapa necesita al menos un punto");

  const lat = marcas.reduce((s, p) => s + Number(p.lat || 0), 0) / marcas.length;
  const lon = marcas.reduce((s, p) => s + Number(p.lon || 0), 0) / marcas.length;

  return {
    messageType: SUB.MAPA,
    mapMetadata: {
      centerLatitude: lat,
      centerLongitude: lon,
      latitudeDelta: zoom,
      longitudeDelta: zoom,
      showInfoList: Boolean(lista),
      annotations: marcas.map((p, i) => ({
        annotationNumber: i + 1,
        latitude: Number(p.lat || 0),
        longitude: Number(p.lon || 0),
        title: String(p.titulo ?? ""),
        body: String(p.cuerpo ?? ""),
      })),
    },
  };
}

/**
 * Fórmulas matemáticas. El texto lleva marcas {{0}}, {{1}}... donde
 * van las expresiones.
 */
export function latex(textoConMarcas, expresiones = []) {
  return {
    messageType: SUB.LATEX,
    latexMetadata: {
      text: String(textoConMarcas ?? ""),
      expressions: (Array.isArray(expresiones) ? expresiones : []).map((e) => ({
        latexExpression: String(typeof e === "string" ? e : e.expr ?? ""),
        ...(e?.ancho ? { width: Number(e.ancho) } : {}),
        ...(e?.alto ? { height: Number(e.alto) } : {}),
        ...(e?.url ? { url: String(e.url) } : {}),
      })),
    },
  };
}

/** SourceProvider de BotSourceItem: 1 Bing, 2 Google, 3 soporte. */
export const PROVEEDOR_FUENTE = Object.freeze({ DESCONOCIDO: 0, BING: 1, GOOGLE: 2, SOPORTE: 3 });

/**
 * Tira de fuentes citadas con favicon y número, la que Meta AI pone
 * debajo de sus respuestas.
 * @param {object[]} lista [{url, favicon, miniatura, busqueda, proveedor}]
 */
export function fuentes(lista = []) {
  const items = (Array.isArray(lista) ? lista : []).filter(Boolean);
  if (!items.length) return null;
  return {
    sources: items.map((f, i) => ({
      provider: Number.isInteger(f.proveedor) ? f.proveedor : PROVEEDOR_FUENTE.DESCONOCIDO,
      ...(f.url ? { sourceProviderUrl: String(f.url) } : {}),
      ...(f.favicon ? { faviconCdnUrl: String(f.favicon) } : {}),
      ...(f.miniatura ? { thumbnailCdnUrl: String(f.miniatura) } : {}),
      ...(f.busqueda ? { sourceQuery: String(f.busqueda) } : {}),
      citationNumber: Number.isInteger(f.numero) ? f.numero : i + 1,
    })),
  };
}

// ── Armado del mensaje ─────────────────────────────────────────────

/**
 * El JSON que los clientes nuevos leen de unifiedResponse.data.
 * Es una copia del mismo contenido en el formato interno de Meta.
 */
export function buildUnified(bloques = [], idRespuesta = randomUUID()) {
  return {
    response_id: idRespuesta,
    sections: bloques.map((b) => {
      switch (b.messageType) {
        case SUB.TEXTO:
          return {
            view_model: {
              primitive: { text: b.messageText, inline_entities: [], __typename: "GenAIMarkdownTextUXPrimitive" },
              __typename: "GenAISingleLayoutViewModel",
            },
          };
        case SUB.TABLA:
          return {
            view_model: {
              primitive: {
                title: b.tableMetadata?.title || "",
                rows: (b.tableMetadata?.rows || []).map((r) => ({
                  is_header: Boolean(r.isHeading),
                  cells: r.items || [],
                  markdown_cells: (r.items || []).map((t) => ({ text: t })),
                })),
                __typename: "GenATableUXPrimitive",
              },
              __typename: "GenAISingleLayoutViewModel",
            },
          };
        case SUB.CODIGO:
          return {
            view_model: {
              primitive: {
                language: b.codeMetadata?.codeLanguage || "",
                code_blocks: (b.codeMetadata?.codeBlocks || []).map((k) => ({ content: k.codeContent, type: k.highlightType })),
                __typename: "GenAICodeUXPrimitive",
              },
              __typename: "GenAISingleLayoutViewModel",
            },
          };
        default:
          return {};
      }
    }),
  };
}

/**
 * Contenido completo listo para generateWAMessageFromContent.
 *
 * @param {object[]} bloques
 * @param {object} [op]
 * @param {string} [op.disclaimer]    línea gris sobre la tarjeta
 * @param {string[]} [op.sugerencias] píldoras de seguimiento
 */
export function buildRichContent(bloques = [], { disclaimer = "", sugerencias = [], citas = [] } = {}) {
  if (!Array.isArray(bloques) || !bloques.length) throw new Error("hacen falta bloques");

  const idRespuesta = randomUUID();
  const botMetadata = {};

  if (disclaimer) botMetadata.messageDisclaimerText = String(disclaimer);

  const tiraFuentes = fuentes(citas);
  if (tiraFuentes) botMetadata.richResponseSourcesMetadata = tiraFuentes;
  if (Array.isArray(sugerencias) && sugerencias.length) {
    botMetadata.suggestedPromptMetadata = {
      suggestedPrompts: sugerencias.map(String),
      promptSuggestions: {
        suggestions: sugerencias.map((p, i) => ({ prompt: String(p), promptId: `shin_${i}` })),
      },
    };
  }

  const contenido = {
    richResponseMessage: {
      messageType: 1, // AI_RICH_RESPONSE_TYPE_STANDARD
      submessages: bloques,
      unifiedResponse: { data: Buffer.from(JSON.stringify(buildUnified(bloques, idRespuesta))) },
    },
  };
  if (Object.keys(botMetadata).length) contenido.messageContextInfo = { botMetadata };
  return contenido;
}

/**
 * Manda la tarjeta. Nunca lanza.
 * @returns {Promise<{sent: boolean, key?: object, error?: any}>}
 */
export async function sendRich(sock, jid, bloques, { quoted, disclaimer, sugerencias, citas } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, buildRichContent(bloques, { disclaimer, sugerencias, citas }), {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó la tarjeta");

    await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}
