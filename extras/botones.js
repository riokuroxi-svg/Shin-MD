/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  WA_DEFAULT_EPHEMERAL,
} from "baileys";
import { nodosInteractivos } from "./wa-nodes.js";

/** Cuántos botones ve la gente sin desplegar nada. */
export const MAX_BOTONES_VISIBLES = 3;

/** Tipos de botón que WhatsApp Web pinta hoy en cuentas normales. */
export const BOTON = {
  RAPIDO: "quick_reply",
  COPIAR: "cta_copy",
  ENLACE: "cta_url",
  LLAMAR: "cta_call",
  RECORDAR: "cta_reminder",
  CANCELAR_RECORDAR: "cta_cancel_reminder",
  UBICACION: "send_location",
  WEBVIEW: "open_webview",
  LISTA: "single_select",
};

/**
 * ¿Se mandan botones o texto normal?
 *
 * Interruptor para apagarlos sin tocar código: `BOTONES=off` en el entorno (o
 * `BOTONES=0`). Con los botones apagados todo sale como texto con las opciones
 * escritas, que es lo mismo que recibe un móvil que no pinta botones.
 */
export function botonesActivos() {
  const valor = String(process.env.BOTONES ?? "").trim().toLowerCase();
  return !["off", "0", "no", "false", "apagados"].includes(valor);
}

/** ¿Se conserva el envoltorio viejo de `viewOnceMessage`? (no, por defecto) */
function conViewOnce() {
  return String(process.env.BOTONES_VIEWONCE ?? "").trim() === "1";
}

// ── constructores ───────────────────────────────────────────────────────────

/** Botón de respuesta rápida: manda el texto `id` como si lo hubieran escrito. */
export function rapido(texto, id = texto) {
  return { name: BOTON.RAPIDO, buttonParamsJson: JSON.stringify({ display_text: texto, id }) };
}

/** Botón que copia un texto al portapapeles. */
export function copiar(texto, contenido) {
  return { name: BOTON.COPIAR, buttonParamsJson: JSON.stringify({ display_text: texto, copy_code: contenido }) };
}

/** Botón que abre un enlace. */
export function enlace(texto, url) {
  return { name: BOTON.ENLACE, buttonParamsJson: JSON.stringify({ display_text: texto, url, merchant_url: url }) };
}

/** Botón que abre el marcador con un número. */
export function llamar(texto, numero) {
  return { name: BOTON.LLAMAR, buttonParamsJson: JSON.stringify({ display_text: texto, phone_number: String(numero) }) };
}

/** Recordatorio nativo: lo avisa WhatsApp, no el bot. */
export function recordar(texto = "Recordármelo", id = "") {
  return { name: BOTON.RECORDAR, buttonParamsJson: JSON.stringify({ display_text: texto, id: id || texto }) };
}

/** Pide al usuario que comparta su ubicación de un toque. */
export function ubicacion(texto = "Mandar mi ubicación") {
  return { name: BOTON.UBICACION, buttonParamsJson: JSON.stringify({ display_text: texto }) };
}

/** Mini web dentro de WhatsApp, sin salir al navegador. */
export function webview(titulo, url, enApp = true) {
  return {
    name: BOTON.WEBVIEW,
    buttonParamsJson: JSON.stringify({ title: titulo, link: { in_app_webview: Boolean(enApp), url } }),
  };
}

/**
 * Lista desplegable nativa.
 *
 * @param {string} titulo
 * @param {Array<{title:string, highlight_label?:string, rows:Array<{id:string,title:string,description?:string}>}>} secciones
 */
export function lista(titulo, secciones = []) {
  const limpias = secciones.map((s) => ({
    title: s.title || "",
    highlight_label: s.highlight_label || "",
    rows: (s.rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description || "",
    })),
  }));
  return { name: BOTON.LISTA, buttonParamsJson: JSON.stringify({ title: titulo, sections: limpias }) };
}

/**
 * Parámetros de la hoja inferior: con más de tres botones hay que pedirla o
 * los sobrantes no se dibujan (y nadie avisa).
 */
export function paramsHoja(botones = [], opciones = {}) {
  const total = Array.isArray(botones) ? botones.filter(Boolean).length : 0;
  if (total <= MAX_BOTONES_VISIBLES && !opciones.forzar) return null;
  return JSON.stringify({
    bottom_sheet: {
      in_thread_buttons_limit: Math.min(opciones.visibles || MAX_BOTONES_VISIBLES, MAX_BOTONES_VISIBLES),
      divider_indices: Array.isArray(opciones.divisiones) ? opciones.divisiones : [],
      list_title: opciones.titulo || "Más opciones",
      button_title: opciones.boton || "Ver todo",
    },
    has_multiple_buttons: true,
  });
}

// ── respaldo en texto ───────────────────────────────────────────────────────

/** Convierte botones armados en la lista de texto del respaldo. */
export function desarmar(botones = []) {
  return botones.map((b) => {
    let p = {};
    try {
      p = JSON.parse(b.buttonParamsJson || "{}");
    } catch {
      p = {};
    }
    return { texto: p.display_text || p.copy_code || p.title || "opción", url: p.url || p.merchant_url || null };
  });
}

/**
 * Texto de respaldo. Acepta la lista de botones armados y también la de
 * `{texto, url}` ya desarmada. Las listas desplegables se escriben renglón por
 * renglón para que se pueda escribir el comando a mano.
 */
export function respaldo(pie, botones = []) {
  if (!botones.length) return pie;
  const lineas = [];
  for (const b of botones) {
    if (b.name === BOTON.LISTA) {
      let p = {};
      try {
        p = JSON.parse(b.buttonParamsJson || "{}");
      } catch {
        p = {};
      }
      lineas.push(`▸ ${p.title || "Opciones"}:`);
      for (const seccion of p.sections || []) {
        for (const fila of seccion.rows || []) lineas.push(`   • ${fila.title} → ${fila.id}`);
      }
    } else if (b.name) {
      const [d] = desarmar([b]);
      lineas.push(d.url ? `▸ ${d.texto}: ${d.url}` : `▸ ${d.texto}`);
    } else {
      lineas.push(b.url ? `▸ ${b.texto}: ${b.url}` : `▸ ${b.texto}`);
    }
  }
  return `${pie}\n\n${lineas.join("\n")}`;
}

// ── envío ───────────────────────────────────────────────────────────────────

/** Prepara la imagen de cabecera, si se pidió y se puede. */
async function prepararImagen(sock, imagen) {
  if (!imagen) return null;
  try {
    if (typeof prepareWAMessageMedia !== "function" || !sock?.waUploadToServer) return null;
    const fuente = typeof imagen === "string" && /^https?:\/\//i.test(imagen) ? { url: imagen } : imagen;
    const media = await prepareWAMessageMedia({ image: fuente }, { upload: sock.waUploadToServer });
    return media?.imageMessage || null;
  } catch {
    // Sin cabecera se manda igual: la foto no vale perder el mensaje entero.
    return null;
  }
}

/**
 * Manda un mensaje con botones.
 *
 * @param {object} sock
 * @param {string} jid   chat destino
 * @param {object} opciones
 * @param {string} opciones.texto    cuerpo del mensaje
 * @param {string} [opciones.titulo] encabezado
 * @param {string} [opciones.pie]    letra pequeña (nombre del bot, etc.)
 * @param {Array}  opciones.botones  los que devuelven `rapido`, `lista`, ...
 * @param {object} [opciones.cita]   mensaje a citar
 * @param {string} [opciones.imagen] URL o buffer para la cabecera
 * @param {object} [opciones.hoja]   ajustes de la hoja inferior (más de 3)
 * @returns {Promise<object|null>}
 */
export async function enviarConBotones(sock, jid, opciones) {
  const { texto = "", titulo = "", pie = "", botones = [], cita = null, imagen = null, hoja = {} } = opciones || {};
  const citar = cita ? { quoted: cita } : undefined;

  // Sin botones, o apagados a propósito: texto con las opciones escritas.
  if (!botones.length || !botonesActivos()) {
    const plano = botones.length ? respaldo(texto, botones) : texto;
    return sock.sendMessage(jid, { text: plano }, citar);
  }

  try {
    // Los canales no admiten botones de ninguna forma.
    if (typeof jid === "string" && jid.endsWith("@newsletter")) {
      return await sock.sendMessage(jid, { text: respaldo(texto, botones) }, citar);
    }

    const imagenPreparada = await prepararImagen(sock, imagen);
    const conMedia = Boolean(imagenPreparada);

    const interactivo = {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: texto }),
        footer: pie ? proto.Message.InteractiveMessage.Footer.fromObject({ text: pie }) : undefined,
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: conMedia ? "" : titulo || "",
          subtitle: "",
          hasMediaAttachment: conMedia,
          imageMessage: imagenPreparada || undefined,
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: botones.map((b) => ({ name: b.name, buttonParamsJson: b.buttonParamsJson })),
          messageParamsJson: paramsHoja(botones, hoja) || undefined,
        }),
      }),
    };

    // El envoltorio viejo solo si se pide: es lo que deja los botones grises.
    const contenido = conViewOnce() ? { viewOnceMessage: { message: interactivo } } : interactivo;

    const armado = await generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id || sock.user?.jid,
      quoted: cita || undefined,
      ephemeralExpiration: WA_DEFAULT_EPHEMERAL,
    });

    await sock.relayMessage(jid, armado.message, {
      messageId: armado.key.id,
      // Sin estos nodos el teléfono tira el mensaje sin pintar nada.
      additionalNodes: nodosInteractivos(jid),
    });

    return armado;
  } catch (err) {
    // Si el relay falla, el texto sale igual con las opciones escritas: peor
    // presentación, pero la persona recibe la información.
    console.warn("⚠️  Botones no enviados, se manda el texto:", err.message);
    return sock.sendMessage(jid, { text: respaldo(texto, botones) }, citar).catch(() => null);
  }
}

/**
 * Lee qué botón pulsó alguien. Devuelve `{ id, nombre, texto }` o `null`.
 * Sirve para responder a la pulsación en el mismo `messages.upsert`.
 */
export function botonPulsado(m) {
  const resp = m?.message?.interactiveResponseMessage;
  if (!resp) return null;
  const flujo = resp.nativeFlowResponseMessage;
  if (!flujo) return null;
  let id = null;
  try {
    id = JSON.parse(flujo.paramsJson || "{}")?.id ?? null;
  } catch {
    id = null;
  }
  if (!id) return null;
  return { id, nombre: flujo.name || null, texto: resp.body?.text || null };
}
