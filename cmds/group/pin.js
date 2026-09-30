/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  pin.js — Fijar y desfijar mensajes en el grupo
//
//  Hueco #2 del sistema de diseño: `pinInChatMessage` está soportado
//  NATIVAMENTE por baileys 6.7.24 (Utils/messages.js, rama 'pin' in
//  message) y prácticamente ningún bot MD lo usa.
//
//    sendMessage(jid, { pin: <key>, type: 1, time: <segundos> })
//      type 1 = PIN_FOR_ALL · type 2 = UNPIN_FOR_ALL
//
//  Uso:  responde a un mensaje y escribe  .pin  ·  .pin 24h  ·  .pin 7d
//        para soltarlo:                   .unpin
// ═══════════════════════════════════════════════════════════════════

import { state, footer } from "#lib/theme";

const PIN_FOR_ALL = 1;
const UNPIN_FOR_ALL = 2;

// WhatsApp solo acepta estas tres duraciones para un mensaje fijado.
// Mandar cualquier otra cosa hace que el fijado se ignore en silencio.
const DURACIONES = [
  { clave: "24h", segundos: 86400, etiqueta: "24 horas" },
  { clave: "7d", segundos: 604800, etiqueta: "7 días" },
  { clave: "30d", segundos: 2592000, etiqueta: "30 días" },
];
const POR_DEFECTO = DURACIONES[0];

/**
 * Interpreta la duración escrita por el usuario.
 * Acepta 24h/7d/30d y variantes escritas en español (1 día, una semana…).
 * Pura y exportada para poder probarla sin sesión.
 * @returns {{segundos:number, etiqueta:string, exacta:boolean}}
 */
export function parseDuracion(texto = "") {
  const t = String(texto || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return { ...POR_DEFECTO, exacta: true };

  const directa = DURACIONES.find(d => d.clave === t);
  if (directa) return { ...directa, exacta: true };

  const alias = {
    "1d": "24h", "1dia": "24h", "1día": "24h", "undia": "24h", "undía": "24h", "24": "24h", "24horas": "24h",
    "7dias": "7d", "7días": "7d", "1semana": "7d", "unasemana": "7d", "semana": "7d",
    "30dias": "30d", "30días": "30d", "1mes": "30d", "unmes": "30d", "mes": "30d",
  };
  const porAlias = alias[t] && DURACIONES.find(d => d.clave === alias[t]);
  if (porAlias) return { ...porAlias, exacta: true };

  // Cualquier otra cosa: se aproxima a la duración válida más cercana
  // y se avisa, en vez de fijar algo distinto a lo que pidió el usuario.
  const m = t.match(/^(\d+)(h|d|dias?|días?|hora?s?)?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const enHoras = /^(h|hora)/.test(m[2] || "h") ? n : n * 24;
    const cercana = DURACIONES.reduce((a, b) =>
      Math.abs(b.segundos / 3600 - enHoras) < Math.abs(a.segundos / 3600 - enHoras) ? b : a);
    return { ...cercana, exacta: false };
  }
  return { ...POR_DEFECTO, exacta: false };
}

/** Payload exacto que espera baileys. Exportado para poder verificarlo. */
export function buildPinPayload(key, { desfijar = false, segundos = POR_DEFECTO.segundos } = {}) {
  return desfijar
    ? { pin: key, type: UNPIN_FOR_ALL }
    : { pin: key, type: PIN_FOR_ALL, time: segundos };
}

export default {
  name: "pin",
  aliases: ["fijar", "unpin", "desfijar"],
  category: "grupo",
  description: "Fija (o desfija) el mensaje al que respondes, arriba del grupo",
  usage: ".pin 24h  ·  .pin 7d  ·  .pin 30d  ·  .unpin",
  cooldown: 5,
  priority: true,
  ownerOnly: false,
  groupOnly: true,
  adminOnly: true,
  // El bot también tiene que ser admin: sin esto WhatsApp descarta el
  // fijado sin devolver error y el usuario creería que funcionó.
  // El middleware de permisos ya lo verifica y responde por su cuenta.
  botAdmin: true,

  async handler(sock, ctx) {
    const desfijar = ["unpin", "desfijar"].includes(String(ctx.command || "").toLowerCase());

    const key = ctx.replyMsg?.key;
    if (!key?.id) {
      return state("needQuote", { action: desfijar ? "desfijar" : "fijar" }) +
        "\n\n" + state("usage", { usage: ".pin 24h", example: ".pin 7d" });
    }

    if (desfijar) {
      await sock.sendMessage(ctx.chatId, buildPinPayload(key, { desfijar: true }));
      return `📍 *Mensaje desfijado.*\n${footer()}`;
    }

    const dur = parseDuracion(ctx.arg);
    await sock.sendMessage(ctx.chatId, buildPinPayload(key, { segundos: dur.segundos }));

    return (
      `📌 *Mensaje fijado*\n` +
      `> Se desfijará solo en *${dur.etiqueta}*.\n` +
      (dur.exacta ? "" : `> _WhatsApp solo admite 24h, 7d o 30d: usé la más cercana._\n`) +
      `\n> Para soltarlo antes: responde al mensaje con \`${ctx.usedPrefix || "."}unpin\`\n` +
      footer()
    );
  },
};
