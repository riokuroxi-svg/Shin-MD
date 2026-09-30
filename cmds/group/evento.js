/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  evento.js — Tarjeta de evento NATIVA de WhatsApp
//
//  Los demás bots escriben "el sábado a las 8" en texto y se pierde
//  entre 200 mensajes. WhatsApp tiene su propia tarjeta de evento: se
//  agenda en el teléfono de cada quien, con su botón de asistir y su
//  recordatorio. Está en el protocolo de baileys 6.7.24:
//
//    proto.Message.EventMessage
//      → isCanceled | name | description | location | joinLink
//        | startTime | endTime | extraGuestsAllowed
//
//  Baileys NO trae atajo para enviarla (Utils/messages.js no conoce
//  'event'), así que se arma el contenido a mano y se manda por
//  relayMessage, igual que ya hacemos con las tarjetas de botones.
//
//  Uso:
//    .evento 4/10 20:00 | Invocación doble | Tiradas al doble 3 horas
//    .evento mañana 9pm | Torneo de ppt
//    .evento hoy 22:30 | Noche de anime | Traigan palomitas
// ═══════════════════════════════════════════════════════════════════

import { state, footer, boxData } from "#lib/theme";

const DOS_HORAS = 2 * 60 * 60 * 1000;

const MESES = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3,
  may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7,
  sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
};

/** "8pm" / "20:00" / "8:30 am" → minutos desde medianoche, o null. */
export function parseHora(texto) {
  const t = String(texto || "").trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const sufijo = (m[3] || "").replace(/\./g, "");

  if (min > 59) return null;
  if (sufijo === "pm" && h < 12) h += 12;
  if (sufijo === "am" && h === 12) h = 0;
  if (h > 23) return null;

  return h * 60 + min;
}

/**
 * Interpreta la fecha y hora escritas por el usuario.
 * Acepta: hoy · mañana · 4/10 · 4-10-2026 · 4 oct
 * Pura y exportada: se puede probar sin sesión.
 * @returns {Date|null}
 */
export function parseFechaHora(texto, ahora = new Date()) {
  const bruto = String(texto || "").trim().toLowerCase();
  if (!bruto) return null;

  const partes = bruto.split(/\s+/);
  const hora = parseHora(partes[partes.length - 1]);
  // Si no escribió hora, se asume el mediodía (nunca las 00:00: un
  // evento "mañana" a medianoche es casi siempre un error de dedo).
  const minutos = hora === null ? 12 * 60 : hora;
  const fechaTxt = (hora === null ? partes : partes.slice(0, -1)).join(" ").trim();

  const d = new Date(ahora.getTime());
  d.setSeconds(0, 0);

  if (!fechaTxt || fechaTxt === "hoy") {
    // nada que mover
  } else if (fechaTxt === "mañana" || fechaTxt === "manana") {
    d.setDate(d.getDate() + 1);
  } else if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(fechaTxt)) {
    const [dd, mm, yy] = fechaTxt.split(/[/-]/).map(n => parseInt(n, 10));
    if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
    d.setFullYear(yy ? (yy < 100 ? 2000 + yy : yy) : d.getFullYear(), mm - 1, dd);
  } else {
    const m = fechaTxt.match(/^(\d{1,2})\s*(?:de\s*)?([a-záéíóú]+)$/);
    const mes = m ? MESES[m[2]] : undefined;
    if (mes === undefined) return null;
    const dd = parseInt(m[1], 10);
    if (dd < 1 || dd > 31) return null;
    d.setMonth(mes, dd);
  }

  d.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0);

  // Si la fecha ya pasó y no llevaba año, se entiende que es la del año
  // que viene (un ".evento 4/1" en diciembre es del próximo enero).
  if (d.getTime() < ahora.getTime() && !/\d{4}/.test(fechaTxt)) {
    if (fechaTxt && fechaTxt !== "hoy") d.setFullYear(d.getFullYear() + 1);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Trocea el comando completo.
 * @returns {{ok:boolean, error?:string, nombre?:string, descripcion?:string, inicio?:Date, fin?:Date}}
 */
export function parseEvento(texto, ahora = new Date()) {
  const partes = String(texto || "").split("|").map(p => p.trim());
  if (partes.length < 2 || !partes[0] || !partes[1]) {
    return { ok: false, error: "faltan datos" };
  }

  const inicio = parseFechaHora(partes[0], ahora);
  if (!inicio) return { ok: false, error: "fecha" };
  if (inicio.getTime() < ahora.getTime() - 60000) return { ok: false, error: "pasado" };

  const nombre = partes[1].slice(0, 100);
  const descripcion = (partes[2] || "").slice(0, 500);
  return { ok: true, nombre, descripcion, inicio, fin: new Date(inicio.getTime() + DOS_HORAS) };
}

/**
 * Contenido del mensaje de evento, listo para relayMessage.
 * Pura: se puede inspeccionar (y codificar con el proto) en una prueba.
 */
export function buildEventContent({ nombre, descripcion = "", inicio, fin, enlace = "" }) {
  return {
    eventMessage: {
      isCanceled: false,
      name: String(nombre),
      description: String(descripcion || ""),
      startTime: Math.floor(inicio.getTime() / 1000),
      endTime: Math.floor((fin || new Date(inicio.getTime() + DOS_HORAS)).getTime() / 1000),
      extraGuestsAllowed: true,
      ...(enlace ? { joinLink: String(enlace) } : {}),
    },
  };
}

/** Cómo se lee la fecha para el humano (respaldo en texto). */
export function fechaBonita(d) {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const h = d.getHours() % 12 || 12;
  const ampm = d.getHours() >= 12 ? "p.m." : "a.m.";
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

export default {
  name: "evento",
  aliases: ["event", "agendar"],
  category: "grupo",
  description: "Crea una tarjeta de evento nativa en el grupo",
  usage: ".evento 4/10 20:00 | Torneo de gacha | Tiradas al doble",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: true,
  adminOnly: true,

  async handler(sock, ctx) {
    const datos = parseEvento(ctx.arg, new Date());

    if (!datos.ok) {
      const ayuda = {
        "faltan datos": "Escribe la fecha y el nombre separados por una barra `|`.",
        fecha: "No entendí la fecha. Prueba con `4/10 20:00`, `mañana 9pm` o `hoy 22:30`.",
        pasado: "Esa fecha ya pasó. Pon una futura.",
      }[datos.error];

      return (
        `📅 *Crear un evento*\n> ${ayuda}\n\n` +
        state("usage", {
          usage: ".evento 4/10 20:00 | Nombre | Descripción",
          example: ".evento mañana 9pm | Torneo de ppt",
        })
      );
    }

    const respaldo = boxData("Evento creado", [
      ["Qué", datos.nombre],
      ["Cuándo", fechaBonita(datos.inicio)],
      ["Detalle", datos.descripcion],
    ]) + "\n" + footer();

    try {
      const { generateWAMessageFromContent } = await import("baileys");
      const contenido = buildEventContent(datos);
      const generado = generateWAMessageFromContent(ctx.chatId, contenido, {
        userJid: sock.user?.id,
        timestamp: new Date(),
      });
      if (!generado?.key?.id) throw new Error("no se generó la tarjeta");

      await sock.relayMessage(ctx.chatId, generado.message, { messageId: generado.key.id });
      return null; // la tarjeta ya se envió: no mandamos texto encima
    } catch {
      // Si el cliente del usuario no dibuja eventos, al menos queda el dato.
      return respaldo;
    }
  },
};
