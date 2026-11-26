/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  vinculacion.js — a quién se vincula el bot, y quién pregunta.
//
//  EL FALLO QUE MOTIVÓ ESTE ARCHIVO
//  `npm start` no arranca el bot directamente: arranca `scripts/consola.mjs`,
//  que dibuja el panel y para eso lanza al bot con la entrada estándar
//  cerrada y la salida por un tubo. Dentro del bot, `process.stdin.isTTY`
//  es `false` y no hay manera de preguntar nada. Resultado: en la 3.7.0 el
//  bot seguía de largo y acababa enseñando un QR que nadie había pedido;
//  en la 3.7.1 se paraba con «no hay terminal», lo cual es honesto pero
//  deja la instalación recién hecha sin forma de vincularse.
//
//  LA REGLA, AHORA
//    · Quien tiene la terminal pregunta. Si hay terminal, se pregunta el
//      número; si no, se para antes de arrancar y se dice la orden exacta.
//    · Un número puesto a mano (--code 52…, PAIRING_NUMBER) nunca se
//      pregunta dos veces.
//    · Si ya hay una sesión buena, no se pregunta nada.
//    · El QR no es una salida de emergencia: no existe.
//
//  La decisión vive aquí, en una función pura, para poder probarla sin
//  arrancar el bot ni abrir una terminal de verdad.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizePhone } from "./cli-args.js";

/**
 * Cómo está la sesión guardada, sin optimismo.
 *
 * `hay` es que existe el archivo; `registrada` es que WhatsApp ya la dio
 * por buena. La diferencia importa: una sesión a medias (se cortó la
 * vinculación, se copió un `auth.db` de otro sitio) tiene archivo pero no
 * está registrada, y si se confunde con una buena el bot arranca, no
 * conecta y acaba pidiendo un QR.
 *
 * @param {string} sessionDir
 * @returns {{hay: boolean, registrada: boolean, motivo: string}}
 */
export function estadoSesion(sessionDir) {
  const authDb = path.join(sessionDir, "auth.db");
  if (!fs.existsSync(authDb)) return { hay: false, registrada: false, motivo: "no hay sesión" };
  let db;
  try {
    db = new DatabaseSync(authDb);
    const fila = db.prepare("SELECT data FROM creds WHERE id = 1").get();
    if (!fila) return { hay: true, registrada: false, motivo: "la sesión está vacía" };
    const creds = JSON.parse(fila.data);
    if (creds?.registered === true) return { hay: true, registrada: true, motivo: "sesión registrada" };
    return { hay: true, registrada: false, motivo: "la vinculación quedó a medias" };
  } catch (err) {
    return { hay: true, registrada: false, motivo: `la sesión no se puede leer (${err.message || err})` };
  } finally {
    try {
      db?.close();
    } catch {
      /* ya estaba cerrada */
    }
  }
}

/** Atajo: ¿sirve la sesión tal cual, sin volver a vincular? */
export const sesionUtilizable = (sessionDir) => estadoSesion(sessionDir).registrada;

/**
 * ¿Se puede abrir `/dev/tty` para preguntar? Es el caso de un proceso
 * lanzado con la entrada redirigida (un servicio, un `&`) pero con una
 * terminal de verdad detrás: ahí sí se puede preguntar, y callarse sería
 * dejar al usuario con un bot que no arranca sin decir por qué.
 *
 * @returns {boolean}
 */
export function hayTerminalDetras() {
  if (process.stdin.isTTY) return true;
  if (process.platform === "win32") return false;
  try {
    const fd = fs.openSync("/dev/tty", "r");
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

/**
 * La decisión, sin efectos: qué hay que hacer con el número.
 *
 * @param {object} opciones
 * @param {{code?: boolean, menu?: boolean, phone?: string}} opciones.args  lo leído de la línea de órdenes
 * @param {Record<string, string|undefined>} [opciones.env]               el entorno (PAIRING_NUMBER)
 * @param {{hay: boolean, registrada: boolean, motivo: string}} opciones.sesion
 * @param {boolean} opciones.hayTerminal                                  si se puede preguntar
 * @returns {{accion: "nada"|"usar"|"preguntar"|"salir", numero: string, motivo: string}}
 */
export function planDeVinculacion({ args = {}, env = {}, sesion, hayTerminal }) {
  const escrito = args.phone || normalizePhone((env.PAIRING_NUMBER || "").trim());
  const forzada = Boolean(args.code || args.menu);

  if (sesion.registrada && !forzada) {
    return { accion: "nada", numero: "", motivo: "sesión registrada" };
  }
  // Un número escrito a mano manda siempre: ni se pregunta ni se adivina.
  if (escrito) return { accion: "usar", numero: escrito, motivo: "número indicado" };
  if (hayTerminal) return { accion: "preguntar", numero: "", motivo: sesion.motivo };
  return { accion: "salir", numero: "", motivo: sesion.motivo };
}

/**
 * Lee una línea de `/dev/tty`. Para cuando la entrada estándar no sirve
 * pero hay una terminal detrás.
 *
 * @returns {string} la línea, o "" si no se pudo leer
 */
export function leerDeTerminal() {
  if (process.stdin.isTTY) return "";
  let fd;
  try {
    fd = fs.openSync("/dev/tty", "r");
    const trozos = [];
    const buf = Buffer.alloc(1);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, 1, null);
      if (!n) break;
      const c = buf.toString("utf8");
      if (c === "\n" || c === "\r") break;
      trozos.push(c);
    }
    return trozos.join("");
  } catch {
    return "";
  } finally {
    try {
      if (fd !== undefined) fs.closeSync(fd);
    } catch {
      /* nada que cerrar */
    }
  }
}

export default { estadoSesion, sesionUtilizable, hayTerminalDetras, planDeVinculacion, leerDeTerminal };
