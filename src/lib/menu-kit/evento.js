/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  evento.js — la tarjeta de evento del menú
//
//  LO QUIEN LO PINTA Y QUIÉN NO
//  El proto del evento NO tiene un campo «creado por». La línea
//  «Creado por …» la dibuja WhatsApp con el nombre del PERFIL de quien
//  envía. Por eso hay dos maneras de firmar, y van las dos:
//
//    1. La firma va escrita al final de la descripción. Se ve siempre,
//       en todos los clientes, y no depende del perfil de la cuenta.
//    2. Si el dueño quiere que la firma sea además la del perfil,
//       EVENTO_PERFIL=on renombra la cuenta al arrancar. Apagado por
//       defecto: renombrar la cuenta es cosa de su dueño, no del bot.
//
//  POR QUÉ NO UN MENSAJE NORMAL
//  Porque una tarjeta de evento no se puede citar, no llena el chat con
//  texto y se queda arriba, pequeña, sin tapar la conversación. El menú
//  grande sigue yendo aparte.
//
//  OJO CON LAS FECHAS
//  `startTime`/`endTime` van en SEGUNDOS (no milisegundos). Si se manda
//  en milisegundos, WhatsApp lo pinta en 1970 o lo descarta en silencio.
// ═══════════════════════════════════════════════════════════════════

import { generateWAMessageFromContent, proto } from "baileys";
import log from "#logger";

/** La firma que va en el recuadro. Sin esto, WhatsApp pone el número. */
export const FIRMA = "Roxi-svg";

/**
 * Segundos de Unix a partir de una fecha o de un número.
 * Acepta Date, milisegundos o segundos; siempre devuelve segundos.
 *
 * @param {Date|number} cuando
 * @returns {number}
 */
export function aSegundos(cuando) {
  if (cuando instanceof Date) return Math.floor(cuando.getTime() / 1000);
  const n = Number(cuando) || 0;
  // Más de 1e11 es, sin duda, milisegundos (año 5138 en segundos).
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

/**
 * El texto que WhatsApp enseña bajo el nombre: «Finaliza hoy a la(s)…»
 * se lo inventa el cliente con `endTime`; aquí solo se prepara el resto.
 *
 * @param {object} op
 * @param {string} [op.nombre]      el título del evento
 * @param {string} [op.descripcion]
 * @param {Date|number} [op.inicio]
 * @param {Date|number} [op.fin]
 * @param {string} [op.firma]       por defecto, Roxi-svg
 * @returns {object} el `{ eventMessage }` listo para enviar
 */
export function armarEvento(op = {}) {
  const ahora = Date.now();
  // Un evento sin horas es raro: se le pone una ventana de un día.
  const inicio = aSegundos(op.inicio ?? ahora);
  const fin = aSegundos(op.fin ?? Number(inicio) + 86400);

  const firma = op.firma || FIRMA;
  const cuerpo = String(op.descripcion || "");
  // La firma no se duplica si ya venía escrita.
  const descripcion = /creado por/i.test(cuerpo) ? cuerpo : `${cuerpo}\n\nCreado por ${firma}`.trim();

  return {
    eventMessage: proto.Message.EventMessage.fromObject({
      name: op.nombre || "Shin-MD",
      description: descripcion,
      startTime: inicio,
      endTime: fin,
      isCanceled: false,
      extraGuestsAllowed: false,
    }),
    _firma: firma,
  };
}

/**
 * Quita el campo interno antes de enviar: el proto no lo conoce y
 * reventaría al codificar.
 *
 * @param {object} contenido
 */
function limpio(contenido) {
  const { _firma, ...resto } = contenido;
  return resto;
}

/**
 * Manda la tarjeta de evento.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op   lo mismo que `armarEvento`
 * @param {{cita?:object}} [extra]
 * @returns {Promise<object|null>} la key, o null si el cliente no lo quiso
 */
export async function enviarEvento(sock, jid, op, { cita = null } = {}) {
  const contenido = armarEvento(op);

  try {
    // Los canales no tienen eventos: se cae a un texto normal.
    if (typeof jid === "string" && jid.endsWith("@newsletter")) {
      const texto = `📅 *${op.nombre || "Shin-MD"}*\n${op.descripcion || ""}\n_Creado por ${op.firma || FIRMA}_`;
      await sock.sendMessage(jid, { text: texto }, cita ? { quoted: cita } : {});
      return null;
    }

    const armado = generateWAMessageFromContent(jid, limpio(contenido), {
      userJid: sock.user?.id,
      quoted: cita || undefined,
    });
    await sock.relayMessage(jid, armado.message, { messageId: armado.key.id });
    return armado.key;
  } catch (err) {
    log.warn("evento: WhatsApp no aceptó la tarjeta (" + (err.message || err) + ")");
    return null;
  }
}

/**
 * Pone el nombre del perfil de la cuenta. Es lo que WhatsApp usa para
 * la línea «Creado por …» de las tarjetas de evento, así que sin esto
 * esa línea sale con el nombre que tuviera la cuenta.
 *
 * Va aparte y apagado por defecto (`EVENTO_PERFIL=on`): cambiar el
 * nombre del perfil es cosa del dueño del número, no del bot.
 *
 * @param {object} sock
 * @param {string} [firma]
 * @returns {Promise<boolean>} si se llegó a cambiar
 */
export async function firmarPerfil(sock, firma = FIRMA) {
  if (String(process.env.EVENTO_PERFIL || "").toLowerCase() !== "on") return false;
  try {
    const actual = sock.user?.name || "";
    if (actual === firma) return false;
    await sock.updateProfileName(firma);
    log.info(`perfil: el nombre de la cuenta pasa a «${firma}» (EVENTO_PERFIL=on).`);
    return true;
  } catch (err) {
    log.warn("perfil: no se pudo cambiar el nombre (" + (err.message || err) + ")");
    return false;
  }
}

/** Versión sin red: arma y pasa por el protobuf (para las pruebas). */
export function armarBytesEvento(op, jid = "5210000000000@s.whatsapp.net") {
  const contenido = armarEvento(op);
  const armado = generateWAMessageFromContent(jid, limpio(contenido), {});
  const bytes = proto.Message.encode(armado.message).finish();
  return { bytes, decodificado: proto.Message.decode(bytes) };
}

export default { armarEvento, enviarEvento, armarBytesEvento, firmarPerfil, aSegundos, FIRMA };
