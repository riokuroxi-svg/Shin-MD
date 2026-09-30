/**
 * #lib/cta-buttons — la familia completa de botones nativos.
 *
 * Hasta ahora el bot solo usaba dos de los diez tipos de botón que
 * WhatsApp sabe dibujar: quick_reply y single_select. Los otros ocho
 * existen, los renderiza el cliente y no hacen falta forks:
 *
 *   cta_url               abre un enlace
 *   cta_copy              copia un código al portapapeles
 *   cta_call              marca un teléfono
 *   cta_reminder          crea un recordatorio nativo
 *   cta_cancel_reminder   lo quita
 *   send_location         pide al usuario que mande su ubicación
 *   address_message       pide una dirección
 *   open_webview          abre una mini web dentro de WhatsApp
 *   single_select         lista desplegable (admite varias secciones)
 *
 * Cada botón es {name, buttonParamsJson}, y buttonParamsJson es una
 * CADENA JSON, no un objeto: si se pasa el objeto, el cliente no
 * dibuja nada y no avisa.
 */

import { randomUUID } from "node:crypto";

export const CTA = Object.freeze({
  RAPIDO: "quick_reply",
  URL: "cta_url",
  COPIAR: "cta_copy",
  LLAMAR: "cta_call",
  RECORDAR: "cta_reminder",
  NO_RECORDAR: "cta_cancel_reminder",
  UBICACION: "send_location",
  DIRECCION: "address_message",
  WEBVIEW: "open_webview",
  LISTA: "single_select",
});

/** Máximo de botones que WhatsApp acepta en una tarjeta. */
export const MAX_BOTONES = 10;
/** A partir de aquí hay que usar la hoja inferior o no se ven. */
export const MAX_VISIBLES = 3;

const empaquetar = (name, params) => ({ name, buttonParamsJson: JSON.stringify(params) });
const texto = (v, campo) => {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`falta ${campo}`);
  return s;
};

export function botonRapido({ texto: rotulo, id }) {
  return empaquetar(CTA.RAPIDO, { display_text: texto(rotulo, "el texto del botón"), id: String(id ?? rotulo) });
}

export function botonUrl({ texto: rotulo, url, comercial }) {
  const destino = texto(url, "la url");
  return empaquetar(CTA.URL, {
    display_text: texto(rotulo, "el texto del botón"),
    url: destino,
    merchant_url: String(comercial || destino),
  });
}

export function botonCopiar({ texto: rotulo, codigo }) {
  return empaquetar(CTA.COPIAR, {
    display_text: texto(rotulo, "el texto del botón"),
    copy_code: texto(codigo, "el código a copiar"),
    id: randomUUID().slice(0, 8),
  });
}

export function botonLlamar({ texto: rotulo, telefono }) {
  return empaquetar(CTA.LLAMAR, {
    display_text: texto(rotulo, "el texto del botón"),
    phone_number: texto(telefono, "el teléfono"),
  });
}

export function botonRecordatorio({ texto: rotulo = "Recordármelo", id } = {}) {
  return empaquetar(CTA.RECORDAR, { display_text: String(rotulo), id: String(id ?? randomUUID().slice(0, 8)) });
}

export function botonCancelarRecordatorio({ texto: rotulo = "Quitar recordatorio", id } = {}) {
  return empaquetar(CTA.NO_RECORDAR, { display_text: String(rotulo), id: String(id ?? "") });
}

/** Pide al usuario que comparta su ubicación con un toque. */
export function botonUbicacion({ texto: rotulo = "Mandar mi ubicación" } = {}) {
  return empaquetar(CTA.UBICACION, { display_text: String(rotulo) });
}

/** Pide una dirección postal (formulario nativo). */
export function botonDireccion({ texto: rotulo = "Mi dirección", id } = {}) {
  return empaquetar(CTA.DIRECCION, { display_text: String(rotulo), id: String(id ?? randomUUID().slice(0, 8)) });
}

/** Mini web dentro de WhatsApp, sin salir de la app. */
export function botonWebview({ titulo, url, dentro = true }) {
  return empaquetar(CTA.WEBVIEW, {
    title: texto(titulo, "el título"),
    link: { in_app_webview: Boolean(dentro), url: texto(url, "la url") },
  });
}

/**
 * Lista desplegable. Admite VARIAS secciones: eso es lo más cerca que
 * hay de un menú anidado sin mandar otro mensaje.
 * @param {object[]} secciones [{titulo, etiqueta, filas:[{titulo,descripcion,cabecera,id}]}]
 */
export function botonLista({ titulo, secciones = [] }) {
  const grupos = (Array.isArray(secciones) ? secciones : []).filter((s) => s?.filas?.length);
  if (!grupos.length) throw new Error("la lista necesita al menos una sección con filas");
  return empaquetar(CTA.LISTA, {
    title: texto(titulo, "el título de la lista"),
    sections: grupos.map((s) => ({
      title: String(s.titulo ?? ""),
      ...(s.etiqueta ? { highlight_label: String(s.etiqueta) } : {}),
      rows: s.filas.map((f) => ({
        ...(f.cabecera ? { header: String(f.cabecera) } : {}),
        title: String(f.titulo ?? ""),
        description: String(f.descripcion ?? ""),
        id: String(f.id ?? f.titulo ?? ""),
      })),
    })),
  });
}

/**
 * Arma la tarjeta interactiva con los botones que le pases.
 * Si hay más de tres y pides hoja, mete el bottom_sheet: es la única
 * vía legítima para que se vean todos.
 */
export function buildCtaContent({
  texto: cuerpo,
  titulo = "",
  subtitulo = "",
  pie = "",
  botones = [],
  imagen = null,
  hoja = null,
} = {}) {
  const lista = (Array.isArray(botones) ? botones : []).filter((b) => b?.name);
  if (!lista.length) throw new Error("hacen falta botones");
  if (lista.length > MAX_BOTONES) throw new Error(`como mucho ${MAX_BOTONES} botones`);

  const cuerpoTexto = String(cuerpo ?? "").trim();
  if (!cuerpoTexto) throw new Error("falta el texto del mensaje");

  const nativeFlowMessage = { messageVersion: 1, buttons: lista };

  const params = {};
  if (hoja || lista.length > MAX_VISIBLES) {
    params.bottom_sheet = {
      in_thread_buttons_limit: Math.min(hoja?.visibles ?? MAX_VISIBLES, MAX_VISIBLES),
      divider_indices: Array.isArray(hoja?.divisiones) ? hoja.divisiones : [],
      list_title: String(hoja?.titulo ?? "Más opciones"),
      button_title: String(hoja?.boton ?? "Ver todo"),
    };
    params.has_multiple_buttons = true;
  }
  if (Object.keys(params).length) nativeFlowMessage.messageParamsJson = JSON.stringify(params);

  const header = {};
  if (titulo) header.title = String(titulo);
  if (subtitulo) header.subtitle = String(subtitulo);
  if (imagen) {
    header.imageMessage = imagen;
    header.hasMediaAttachment = true;
  } else {
    header.hasMediaAttachment = false;
  }

  return {
    interactiveMessage: {
      body: { text: cuerpoTexto },
      ...(pie ? { footer: { text: String(pie) } } : {}),
      ...(Object.keys(header).length > 1 ? { header } : {}),
      nativeFlowMessage,
    },
  };
}

/** Respaldo en texto por si el cliente no dibuja los botones. */
export function renderCtaTexto({ texto: cuerpo, botones = [] } = {}) {
  const filas = [];
  for (const b of botones) {
    let p = {};
    try { p = JSON.parse(b.buttonParamsJson || "{}"); } catch { /* da igual */ }
    if (b.name === CTA.LISTA) {
      for (const s of p.sections || []) for (const f of s.rows || []) filas.push(`› ${f.title}`);
    } else if (b.name === CTA.URL) filas.push(`› ${p.display_text} — ${p.url}`);
    else if (b.name === CTA.COPIAR) filas.push(`› ${p.display_text} — ${p.copy_code}`);
    else if (b.name === CTA.LLAMAR) filas.push(`› ${p.display_text} — ${p.phone_number}`);
    else if (b.name === CTA.WEBVIEW) filas.push(`› ${p.title} — ${p.link?.url ?? ""}`);
    else if (p.display_text) filas.push(`› ${p.display_text}`);
  }
  return [String(cuerpo ?? "").trim(), filas.join("\n")].filter(Boolean).join("\n\n");
}

/** Manda la tarjeta. No lanza: devuelve {sent,error}. */
export async function sendCta(sock, jid, datos = {}, { quoted } = {}) {
  try {
    const { generateWAMessageFromContent } = await import("baileys");
    const contenido = buildCtaContent(datos);
    const generado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock?.user?.id,
      quoted,
      timestamp: new Date(),
    });
    await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}
