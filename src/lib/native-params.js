/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  native-params.js — El campo que casi nadie rellena
//
//  Dentro de un mensaje con botones (nativeFlowMessage) hay un campo de
//  texto libre, `messageParamsJson`, que WhatsApp lee para dibujar
//  adornos extra. Está vacío en el 99% de los bots. Confirmado en el
//  proto de baileys 6.7.24:
//      proto.Message.InteractiveMessage.NativeFlowMessage
//        → buttons | messageParamsJson | messageVersion
//
//  Aquí se arman los dos adornos que valen la pena:
//
//   · limited_time_offer → la tarjeta con CUENTA ATRÁS. Le pasamos una
//     hora real y WhatsApp escribe solo "Finaliza hoy a la(s) 2:57 p.m."
//     en el idioma y la zona horaria de QUIEN LO RECIBE. Nada de
//     escribir la hora a mano y equivocarse de huso.
//
//   · bottom_sheet → los botones que no caben (WhatsApp solo muestra 3)
//     no se pierden: se guardan en una hoja que sube desde abajo, con
//     su título y sus separadores.
//
//  Este archivo NO envía nada y NO toca la red: solo devuelve objetos y
//  texto, para poder probarlo entero sin abrir sesión.
// ═══════════════════════════════════════════════════════════════════

/** Milisegundos de época a partir de un Date, número o texto ISO. */
function aMilisegundos(valor) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "number") return valor < 1e12 ? Math.round(valor * 1000) : Math.round(valor);
  const n = Date.parse(String(valor));
  return Number.isFinite(n) ? n : null;
}

/**
 * Tarjeta con cuenta atrás.
 * @param {object} o
 * @param {string} o.text      Título grande de la tarjeta ("Buenas noches 🌙").
 * @param {Date|number} o.expiresAt  Cuándo caduca. WhatsApp dibuja la hora.
 * @param {string} [o.url]     Enlace opcional de la tarjeta.
 * @param {string} [o.copyCode] Código que el usuario puede copiar.
 * @returns {object|null} null si falta lo imprescindible (así el
 *          llamador manda la tarjeta normal en vez de una rota).
 */
export function buildLimitedTimeOffer({ text, expiresAt, url = "", copyCode = "" } = {}) {
  const titulo = String(text || "").trim();
  const fin = aMilisegundos(expiresAt);
  if (!titulo || !fin) return null;

  const oferta = { text: titulo, expiration_time: fin };
  if (url) oferta.url = String(url);
  if (copyCode) oferta.copy_code = String(copyCode);
  return oferta;
}

/**
 * Hoja inferior: rompe el límite de 3 botones a la vista.
 * @param {object} o
 * @param {number} [o.inThreadLimit=2]  Cuántos botones quedan en el chat.
 * @param {number[]} [o.dividers]       Índices donde pintar un separador.
 * @param {string} [o.listTitle]        Título dentro de la hoja.
 * @param {string} [o.buttonTitle]      Texto del botón que la abre.
 */
export function buildBottomSheet({
  inThreadLimit = 2,
  dividers = [],
  listTitle = "",
  buttonTitle = "",
} = {}) {
  const limite = Number.isFinite(inThreadLimit) ? Math.max(0, Math.min(3, Math.trunc(inThreadLimit))) : 2;
  return {
    in_thread_buttons_limit: limite,
    divider_indices: (Array.isArray(dividers) ? dividers : [])
      .filter(n => Number.isFinite(n) && n >= 0)
      .map(n => Math.trunc(n)),
    list_title: String(listTitle || ""),
    button_title: String(buttonTitle || ""),
  };
}

/**
 * Junta los adornos en el texto que viaja dentro del mensaje.
 * @returns {string} JSON listo para messageParamsJson, o "" si no hay nada
 *          (mandar "{}" hace que algunos clientes dibujen una franja vacía).
 */
export function buildMessageParams({ limitedTimeOffer = null, bottomSheet = null } = {}) {
  const params = {};
  if (limitedTimeOffer) params.limited_time_offer = limitedTimeOffer;
  if (bottomSheet) {
    params.bottom_sheet = bottomSheet;
    // Sin esta bandera WhatsApp ignora la hoja y se come los botones
    // que no caben. Va junto al bottom_sheet, nunca sola.
    params.has_multiple_buttons = true;
  }
  if (!Object.keys(params).length) return "";
  return JSON.stringify(params);
}

/**
 * Atajo: el JSON de una tarjeta con cuenta atrás, de una sola llamada.
 * Devuelve "" si los datos no dan para dibujarla.
 */
export function offerParams(opciones) {
  return buildMessageParams({ limitedTimeOffer: buildLimitedTimeOffer(opciones) });
}

export default { buildLimitedTimeOffer, buildBottomSheet, buildMessageParams, offerParams };
