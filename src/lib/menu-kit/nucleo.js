/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * message-kit — prototipo verificable
 * Reemplaza las 5 rutas de menú de Shin-MD por UNA sola, con las tres
 * omisiones corregidas y pruebas offline.
 *
 * No depende de red ni de WhatsApp: todo se puede comprobar antes de enviar.
 */
import { randomBytes } from "node:crypto";

/* ──────────────────────────────────────────────────────────────
   1. SECRETO POR MENSAJE  (omisión #2)
   El fork lo añade a todos los interactivos; el stock no lo hace.
   Sin él, el teléfono pierde la referencia y el botón no responde.
   ────────────────────────────────────────────────────────────── */
export function messageContextInfo() {
  return {
    deviceListMetadata: {},
    deviceListMetadataVersion: 2,
    messageSecret: randomBytes(32),
  };
}

/* ──────────────────────────────────────────────────────────────
   2. NODO biz COMPLETO  (omisión #1)
   Al nuestro le faltaban decision_id y <decision_source value="df"/>.
   Sin esos dos campos el teléfono puede contestar «actualiza WhatsApp».
   ────────────────────────────────────────────────────────────── */
export function nodoBiz() {
  return {
    tag: "biz",
    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts: String(Math.floor(Date.now() / 1000)),
    },
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
      },
      {
        tag: "quality_control",
        attrs: {
          decision_id: randomBytes(20).toString("hex"), // 40 hex, como el cliente oficial
          source_type: "third_party",
        },
        content: [{ tag: "decision_source", attrs: { value: "df" } }],
      },
    ],
  };
}

export function nodoBot() {
  return { tag: "bot", attrs: { biz_bot: "1" } };
}

export function esPrivado(jid = "") {
  return jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
}

/**
 * Nodos para relayMessage. UN solo biz, siempre.
 * @param {string} jid
 * @param {{ai?: boolean, conBot?: boolean}} op
 */
export function nodosInteractivos(jid, { ai = true } = {}) {
  const nodos = [nodoBiz()];
  if (esPrivado(jid) && ai) nodos.push(nodoBot());
  return nodos;
}

/* ──────────────────────────────────────────────────────────────
   3. BOTONES DECLARATIVOS
   Igual que Anya: se pide `{ id }`, `{ copy }`, `{ url }` o
   `{ sections }` y se traduce al tipo nativo correcto.
   ────────────────────────────────────────────────────────────── */
export function botonesDeclarativos(lista = []) {
  return lista.map((b) => {
    const texto = b.text || "Opción";
    const icon = b.icon ? String(b.icon).toUpperCase() : undefined;

    if (b.id) {
      return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: texto, id: b.id, icon }) };
    }
    if (b.copy) {
      return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: texto, copy_code: b.copy, icon }) };
    }
    if (b.url) {
      return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: texto, url: b.url, merchant_url: b.url, icon }) };
    }
    if (b.call) {
      return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: texto, phone_number: b.call, icon }) };
    }
    if (b.sections) {
      return { name: "single_select", buttonParamsJson: JSON.stringify({ title: texto, sections: b.sections, icon }) };
    }
    return null;
  }).filter(Boolean);
}

/**
 * WhatsApp dibuja 3 botones; el resto necesita hoja inferior.
 * Se pide siempre que haya más de 3, o si el llamador la quiere.
 */
export function paramsHoja(botones = [], { titulo = "Menú", abrir = null } = {}) {
  if (botones.length <= 3 && !abrir) return undefined;
  return JSON.stringify({
    bottom_sheet: {
      in_thread_buttons_limit: 1,
      divider_indices: botones.map((_, i) => i),
      list_title: titulo,
      button_title: abrir || "Ver más opciones",
    },
  });
}

/* ──────────────────────────────────────────────────────────────
   4. RESPALDO EN TEXTO
   Si algo falla, la persona recibe las opciones CON prefijo para
   poder escribirlas. Nunca un mensaje vacío.
   ────────────────────────────────────────────────────────────── */
export function textoDeRespaldo(cuerpo, botones = [], prefijo = ".") {
  const conPrefijo = (id) => (String(id).startsWith(prefijo) ? id : `${prefijo}${id}`);
  const lineas = [];
  for (const b of botones) {
    let p = {};
    try { p = JSON.parse(b.buttonParamsJson || "{}"); } catch { p = {}; }
    if (b.name === "single_select") {
      lineas.push(`▸ ${p.title || "Opciones"}:`);
      for (const s of p.sections || []) {
        for (const r of s.rows || []) lineas.push(`   • ${r.title} → ${conPrefijo(r.id)}`);
      }
    } else if (p.url) {
      lineas.push(`▸ ${p.display_text}: ${p.url}`);
    } else if (p.id) {
      lineas.push(`▸ ${p.display_text} → ${conPrefijo(p.id)}`);
    } else if (p.copy_code) {
      lineas.push(`▸ ${p.display_text}: ${p.copy_code}`);
    } else {
      lineas.push(`▸ ${p.display_text || "Opción"}`);
    }
  }
  return lineas.length ? `${cuerpo}\n\n${lineas.join("\n")}` : cuerpo;
}

/* ──────────────────────────────────────────────────────────────
   5. LECTURA DE DIMENSIONES DEL MP4 SIN FFMPEG
   Evita el bug de los 11-14 s: nada de execFileSync en el camino
   del envío. Lee las cajas del propio archivo.
   ────────────────────────────────────────────────────────────── */
export function datosDelVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 32) return null;

  const leerCaja = (pos) => {
    if (pos + 8 > buf.length) return null;
    const tamano = buf.readUInt32BE(pos);
    const tipo = buf.toString("latin1", pos + 4, pos + 8);
    return { tamano, tipo, pos, cabecera: 8 };
  };

  // moov puede estar al principio (faststart) o al final
  let moov = null;
  for (let p = 0; p + 8 <= buf.length; ) {
    const c = leerCaja(p);
    if (!c || c.tamano < 8) break;
    if (c.tipo === "moov") { moov = { inicio: p + c.cabecera, fin: p + c.tamano }; break; }
    p += c.tamano;
  }
  if (!moov) return null;

  let segundos = 0, ancho = 0, alto = 0;

  for (let p = moov.inicio; p + 8 <= moov.fin; ) {
    const c = leerCaja(p);
    if (!c || c.tamano < 8) break;

    if (c.tipo === "mvhd") {
      const version = buf.readUInt8(p + 8);
      if (version === 0) {
        const escala = buf.readUInt32BE(p + 20);
        const duracion = buf.readUInt32BE(p + 24);
        if (escala) segundos = Math.round(duracion / escala);
      } else {
        const escala = buf.readUInt32BE(p + 28);
        const duracion = Number(buf.readBigUInt64BE(p + 32));
        if (escala) segundos = Math.round(duracion / escala);
      }
    }

    // tkhd trae ancho/alto en punto fijo 16.16 al final de la caja
    if (c.tipo === "trak") {
      for (let q = p + c.cabecera; q + 8 <= p + c.tamano; ) {
        const t = leerCaja(q);
        if (!t || t.tamano < 8) break;
        if (t.tipo === "tkhd") {
          const fin = q + t.tamano;
          if (fin >= 8) {
            const w = buf.readUInt32BE(fin - 8) / 65536;
            const h = buf.readUInt32BE(fin - 4) / 65536;
            if (w > 0 && h > 0) { ancho = Math.round(w); alto = Math.round(h); }
          }
        }
        q += t.tamano;
      }
    }

    p += c.tamano;
  }

  if (!segundos && !ancho) return null;
  return { seconds: segundos, width: ancho, height: alto, esVertical: alto > ancho };
}
