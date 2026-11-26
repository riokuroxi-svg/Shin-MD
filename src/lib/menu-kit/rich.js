/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  rich.js — el mensaje enriquecido (el «rich v2» del proto)
//
//  POR QUÉ EXISTE
//  ──────────────
//  Hay un formato que el teléfono pinta como una tarjeta de asistente:
//  texto, tablas, bloques de código con colores, listas, LaTeX, enlaces…
//  todo en una sola burbuja y con el formato del propio WhatsApp.
//
//  En nuestro Baileys ya estaba: `WAProto.proto` trae
//    · botForwardedMessage   (campo 104)
//    · richResponseMessage   (campo  97)
//    · unifiedResponse       (campo   3, para HTML/Bloks)
//  y los 10 tipos de submessage. No hace falta ninguna librería extra.
//
//  RESPALDO: si el teléfono del usuario no pinta este formato, la función
//  manda el mismo contenido como texto con monospaciado. Nunca se queda
//  en blanco.
// ═══════════════════════════════════════════════════════════════════

import { generateWAMessageFromContent, proto } from "baileys";
import log from "#logger";

/** Tipos de submessage que entiende WhatsApp (enum del proto). */
export const SUB = Object.freeze({
  TEXTO: 2,
  TABLA: 4,
  CODIGO: 5,
  LATEX: 8,
});

export const TITULO_TABLA = 1; // AIRichResponseMessageType

/* ── Ayudantes ─────────────────────────────────────────────────────── */

/** Una línea de texto. */
export function texto(t) {
  return { messageType: SUB.TEXTO, messageText: String(t) };
}

/**
 * Una tabla.
 * @param {string} titulo
 * @param {Array<Array<string>>} filas  primera fila = cabecera
 */
export function tabla(titulo, filas) {
  return {
    messageType: SUB.TABLA,
    tableMetadata: {
      title: titulo ? String(titulo) : undefined,
      rows: (filas || []).map((items) => ({ items: items.map(String) })),
    },
  };
}

/**
 * Un bloque de código. `lenguaje` pinta el resaltado por palabras clave.
 * @param {string} codigo
 * @param {string} [lenguaje="js"]
 */
export function codigo(codigo, lenguaje = "js") {
  return {
    messageType: SUB.CODIGO,
    codeMetadata: {
      codeLanguage: lenguaje,
      codeBlocks: [{ highlightType: 1, codeContent: String(codigo) }],
    },
  };
}

/** Una fórmula LaTeX. */
export function latex(formula) {
  return { messageType: SUB.LATEX, latexMetadata: { expressions: [String(formula)] } };
}

/**
 * Arma el contenido listo para `generateWAMessageFromContent`.
 * @param {Array} submessages
 */
export function armarRich(submessages, { sello = null } = {}) {
  // `forwardOrigin: 4` es META_AI (enum del proto): el teléfono muestra la
  // tarjeta como respuesta de asistente. `sello` añade el nombre del canal
  // del bot sobre la burbuja, como hacen los bots con más diseño.
  const contextInfo = {
    isForwarded: true,
    forwardingScore: 1,
    forwardOrigin: 4,
    ...(sello
      ? {
          forwardedNewsletterMessageInfo: {
            newsletterJid: sello.jid,
            newsletterName: sello.nombre || "Shin-MD",
            serverMessageId: -1,
            contentType: 1,
          },
        }
      : {}),
  };
  return {
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: TITULO_TABLA,
          submessages: submessages || [],
          contextInfo,
        },
      },
    },
  };
}

/* ── Tarjeta de producto (la que usan los bots de tienda) ─────────── */

/**
 * Arma una tarjeta de producto: imagen, nombre, precio y descripción.
 * El teléfono la pinta como ficha de catálogo. No hace falta cuenta
 * Business.
 *
 * OJO (comprobado en `WAProto.proto`): `ProductMessage` NO tiene campo
 * de botones — sus campos son product, businessOwnerJid, catalog, body,
 * footer y contextInfo. Cualquier `buttons` dentro del producto se
 * pierde al codificar. Los botones van en un mensaje interactivo aparte.
 *
 * @param {object} p
 * @param {string} p.titulo
 * @param {string} [p.descripcion]
 * @param {number} [p.precio]        en unidades (se guarda ×1000)
 * @param {string} [p.moneda]        "MXN" por defecto
 * @param {string} [p.idProducto]
 * @param {string} [p.url]
 * @param {object} [p.imagen]        {url} o Buffer
 */
export function armarProducto(p = {}) {
  return {
    product: {
      productId: p.idProducto || "SHIN-" + Date.now(),
      title: p.titulo || "Producto",
      description: p.descripcion || "",
      currencyCode: p.moneda || "MXN",
      priceAmount1000: Math.round((p.precio || 0) * 1000),
      retailerId: p.idProducto || "shin-md",
      url: p.url || "https://github.com/riokuroxi-svg/Shin-MD",
      productImage: p.imagen || undefined,
    },
    caption: p.descripcion || "",
  };
}

/** El respaldo en texto: lo mismo, pero se lee en cualquier cliente. */
export function comoTexto(submessages) {
  const salida = [];
  for (const s of submessages || []) {
    if (s.messageType === SUB.TEXTO) salida.push(s.messageText);
    else if (s.messageType === SUB.TABLA) {
      const t = s.tableMetadata || {};
      if (t.title) salida.push(`*${t.title}*`);
      for (const fila of t.rows || []) salida.push((fila.items || []).join("  │  "));
    } else if (s.messageType === SUB.CODIGO) {
      const c = s.codeMetadata || {};
      for (const bloque of c.codeBlocks || []) salida.push("```" + (bloque.codeContent || "") + "```");
    } else if (s.messageType === SUB.LATEX) {
      salida.push((s.latexMetadata?.expressions || []).join(" "));
    }
  }
  return salida.filter(Boolean).join("\n");
}

/**
 * Manda la tarjeta enriquecida. Si el envío falla, cae al texto.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {Array} submessages
 * @param {{cita?:object}} [op]
 * @returns {Promise<boolean>}
 */
export async function enviarRich(sock, jid, submessages, { cita = null, sello = null } = {}) {
  // Los canales no pintan este formato: texto directo.
  if (typeof jid === "string" && jid.endsWith("@newsletter")) {
    return !!(await sock.sendMessage(jid, { text: comoTexto(submessages) }));
  }

  try {
    const contenido = armarRich(submessages, { sello });
    const armado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted: cita || undefined,
    });
    await sock.relayMessage(jid, armado.message, { messageId: armado.key.id });
    return true;
  } catch (err) {
    log.warn("rich: el teléfono no aceptó la tarjeta, va el texto (" + (err.message || err) + ")");
    try {
      await sock.sendMessage(jid, { text: comoTexto(submessages) }, cita ? { quoted: cita } : {});
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Versión que se puede probar sin red: arma y codifica el mensaje con el
 * proto real. Devuelve los bytes y el payload decodificado.
 */
export function armarBytes(submessages, jid = "5210000000000@s.whatsapp.net") {
  const armado = generateWAMessageFromContent(jid, armarRich(submessages), {});
  const bytes = proto.Message.encode(armado.message).finish();
  return { bytes, decodificado: proto.Message.decode(bytes) };
}

export default { enviarRich, armarRich, armarProducto, armarBytes, comoTexto, texto, tabla, codigo, latex, SUB };
