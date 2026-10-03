/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  cli-args.js — Lectura de los argumentos de arranque.
//
//  Antes vivía dentro de boot/index.js, donde no se podía probar: para
//  importar ese archivo hay que arrancar el bot entero (revisa licencia,
//  lanza el parche de Baileys, imprime el banner). Con estas funciones
//  aquí, la normalización de números —que es justo lo que falló alguna
//  vez con los móviles mexicanos— se prueba sola.
// ═══════════════════════════════════════════════════════════════════

/**
 * Deja un número de teléfono en el formato que WhatsApp espera.
 *
 * Reglas (y por qué):
 *  · Solo dígitos: WhatsApp rechaza +, espacios y guiones.
 *  · Sin ceros iniciales.
 *  · México MÓVIL: WhatsApp guarda la forma vieja 52+1+número
 *    (ej. 5215574370309). Si llega sin el 1, se añade — sin esto, el
 *    bot se vinculaba a un número que no era el del dueño.
 *  · Argentina MÓVIL: igual, pero con el 9 (549...).
 *
 * @param {string|number} input
 * @returns {string} solo dígitos, o "" si no había nada usable
 */
export function normalizePhone(input) {
  let s = String(input).replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("0")) s = s.replace(/^0+/, "");
  if (s.startsWith("52") && !s.startsWith("521") && s.length >= 12) s = "521" + s.slice(2);
  if (s.startsWith("54") && !s.startsWith("549") && s.length >= 11) s = "549" + s.slice(2);
  return s;
}

/**
 * Interpreta los argumentos de la línea de comandos.
 *   node index.js --qr          → vinculación por QR
 *   node index.js --code 5215.. → vinculación por código con ese número
 *   node index.js --menu        → fuerza el menú interactivo
 *
 * @param {string[]} argv  normalmente process.argv.slice(2)
 * @returns {{qr: boolean, code: boolean, menu: boolean, phone: string}}
 */
export function parseArgs(argv) {
  const r = { qr: false, code: false, menu: false, phone: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--qr") r.qr = true;
    if (argv[i] === "--menu") r.menu = true;
    if (argv[i] === "--code") r.code = true;
    if (argv[i] === "--code" && argv[i + 1] && /^\+?\d{7,15}$/.test(argv[i + 1])) {
      r.phone = normalizePhone(argv[++i]);
    }
  }
  return r;
}

/**
 * Genera un número de teléfono aleatorio con formato válido, para probar
 * el flujo de vinculación sin usar un número real.
 *
 * Deja elegir el país: México por defecto (es el del dueño del bot) y
 * añade el 1 de móvil como WhatsApp espera.
 *
 * @param {{pais?: "MX"|"AR"|"ES"|string, semilla?: () => number}} [opts]
 * @returns {string} número de 12-13 dígitos, solo números
 */
export function telefonoAleatorio(opts = {}) {
  const aleatorio = opts.semilla || Math.random;
  const digito = () => Math.floor(aleatorio() * 10);
  let cuerpo = "";
  for (let i = 0; i < 10; i++) cuerpo += digito();
  switch (opts.pais) {
    case "AR":
      return "549" + cuerpo;
    case "ES":
      return "34" + cuerpo;
    case "MX":
    default:
      return "521" + cuerpo;
  }
}

export default { normalizePhone, parseArgs, telefonoAleatorio };
