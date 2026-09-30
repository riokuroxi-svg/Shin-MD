/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ui-kit.js — Para que un comando cualquiera tenga cara de premium
//              sin copiar cuarenta líneas
//
//  El problema real: 22 comandos de 217 tenían botones. No porque
//  fueran difíciles, sino porque cablearlos a mano en cada fichero es
//  media hora de trabajo y cuatro maneras distintas de equivocarse.
//
//  Aquí hay dos cosas y ya:
//
//    sendFicha()  — una tarjeta con título, filas de datos y atajos
//    atajo()      — un botón que ejecuta OTRO comando del bot
//
//  El truco de `atajo` merece explicación. Cuando alguien pulsa un
//  quick_reply, WhatsApp devuelve su `id` como si el usuario lo
//  hubiera escrito. Si el id lleva el prefijo (".daily"), el router
//  lo recoge como un comando normal: cooldown, permisos y cola
//  anti-ban incluidos. O sea que cualquier botón puede lanzar
//  cualquier comando sin escribir un solo manejador nuevo.
//
//  Y si la tarjeta no se puede dibujar (WhatsApp Web, un iPhone con
//  la app vieja), sale el mismo contenido en texto. Nunca se pierde
//  la respuesta por ponerle un adorno.
// ═══════════════════════════════════════════════════════════════════

import { sendInteractive, quickReply, ctaUrl, ctaCopy } from "#interactive";
import { boxData, footer } from "#lib/theme";

/** WhatsApp pinta tres botones en el chat; el resto va a la hoja. */
export const VISIBLES = 3;

/**
 * Un botón que lanza otro comando del bot.
 *
 * @param {string} texto     lo que se lee en el botón
 * @param {string} comando   sin prefijo: "daily", "balance top"
 * @param {string} [prefijo] el prefijo en uso (por defecto ".")
 * @returns {object} botón listo para sendFicha
 */
export function atajo(texto, comando, prefijo = ".") {
  return quickReply(String(texto), `${prefijo}${String(comando).replace(/^\./, "")}`);
}

/** Botón que abre un enlace. */
export function enlace(texto, url) {
  return ctaUrl(String(texto), String(url));
}

/** Botón que copia algo al portapapeles. */
export function copiar(texto, contenido) {
  return ctaCopy(String(texto), String(contenido));
}

/**
 * El texto de una ficha: título arriba, filas debajo, nota al final.
 * Pura y sin envíos, para poder probarla y para usarla de respaldo.
 *
 * @param {object} d
 * @param {string} d.titulo
 * @param {Array<[string,string]|string>} [d.filas]
 * @param {string} [d.nota]
 * @param {boolean} [d.conFirma=true]
 * @returns {string}
 */
export function renderFicha({ titulo, filas = [], nota = "", conFirma = true } = {}) {
  const cuerpo = boxData(titulo || "", filas);
  const partes = [cuerpo];
  if (nota) partes.push(`> ${nota}`);
  if (conFirma) partes.push(footer());
  return partes.join("\n");
}

/**
 * Manda una ficha con sus atajos. Nunca lanza: si la tarjeta no sale,
 * manda el mismo contenido en texto.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} d
 * @param {string} d.titulo
 * @param {Array<[string,string]|string>} [d.filas]
 * @param {string} [d.nota]      línea final, en cursiva de cita
 * @param {object[]} [d.botones] de atajo() / enlace() / copiar()
 * @param {object} [d.quoted]
 * @param {string} [d.pie]       letra pequeña de la tarjeta
 * @param {string} [d.hojaTitulo] título de la hoja desplegable
 * @returns {Promise<{sent:boolean, respaldo?:boolean}>}
 */
export async function sendFicha(sock, jid, {
  titulo, filas = [], nota = "", botones = [], quoted, pie = "", hojaTitulo = "",
} = {}) {
  const texto = renderFicha({ titulo, filas, nota });

  // Sin botones no hay nada que ganar con una tarjeta: texto y listo.
  if (!botones.length) {
    try {
      await sock.sendMessage(jid, { text: texto }, { quoted });
      return { sent: true, respaldo: true };
    } catch { return { sent: false }; }
  }

  const hoja = botones.length > VISIBLES
    ? { titulo: hojaTitulo || titulo || "Más opciones", boton: "Ver todo", divisiones: [VISIBLES] }
    : null;

  // sendInteractive devuelve el mensaje generado (o null si ni el
  // respaldo salió), no un {sent}. Lo normalizamos aquí para que los
  // comandos no tengan que saberlo.
  const r = await sendInteractive(sock, jid, {
    body: texto,
    footer: pie || "",
    buttons: botones,
    quoted,
    fallbackText: texto,
    ...(hoja ? { hoja } : {}),
  });
  return { sent: !!r, respaldo: !r?.message?.interactiveMessage };
}

export default { VISIBLES, atajo, enlace, copiar, renderFicha, sendFicha };
