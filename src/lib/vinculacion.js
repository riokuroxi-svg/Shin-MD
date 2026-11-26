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

// ─── La marca de sesión muerta ──────────────────────────────────────
//
// EL BUCLE SIN SALIDA QUE ESTO ARREGLA
// Cuando WhatsApp invalida la sesión (401 `loggedOut`), el archivo
// `auth.db` sigue diciendo `registered: true`. En cada reinicio el bot
// leía eso, contestaba «sesión existente: no hace falta vincular nada»
// y volvía a chocar con el 401 sin pedir nunca el número. El usuario se
// quedaba sin forma de recuperar el bot desde la propia consola.
//
// La marca es un archivo de texto junto a la sesión: dice que ESA sesión
// concreta ya murió. Mientras exista, la sesión no cuenta como buena y
// el arranque pregunta el número otra vez. Se borra sola al vincular.
const ARCHIVO_MUERTA = "sesion-muerta.txt";

/**
 * ¿Esta sesión ya fue rechazada por WhatsApp?
 *
 * @param {string} sessionDir
 * @returns {{muerta: boolean, motivo: string}}
 */
export function sesionMuerta(sessionDir) {
  const ruta = path.join(sessionDir, ARCHIVO_MUERTA);
  try {
    if (!fs.existsSync(ruta)) return { muerta: false, motivo: "" };
    const texto = fs.readFileSync(ruta, "utf8").trim();
    return { muerta: true, motivo: texto || "WhatsApp rechazó esta sesión" };
  } catch {
    return { muerta: false, motivo: "" };
  }
}

/**
 * Deja constancia de que la sesión ya no sirve.
 *
 * Se llama cuando el servidor cierra con 401 (sesión cerrada), 403
 * (prohibido), badSession o multideviceMismatch. NO borra credenciales
 * (por si hay que diagnosticar), solo marca el archivo para que el
 * próximo arranque vuelva a preguntar el número.
 *
 * @param {string} sessionDir
 * @param {string} [motivo]
 * @returns {boolean} si la marca quedó escrita
 */
export function marcarSesionMuerta(sessionDir, motivo = "") {
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, ARCHIVO_MUERTA),
      `${new Date().toISOString()} · ${motivo || "WhatsApp rechazó esta sesión"}\n`,
      "utf8",
    );
    return true;
  } catch {
    return false;
  }
}

/** La sesión se vinculó de nuevo: la marca deja de valer. */
export function limpiarMarcaSesionMuerta(sessionDir) {
  try {
    fs.rmSync(path.join(sessionDir, ARCHIVO_MUERTA), { force: true });
    return true;
  } catch {
    return false;
  }
}

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

  // Una sesión que WhatsApp ya rechazó no sirve aunque el archivo diga
  // que está registrada: es justo lo que dejaba al bot en el bucle de
  // «no hace falta vincular nada» + 401.
  const { muerta, motivo: motivoMuerta } = sesionMuerta(sessionDir);
  if (muerta) return { hay: true, registrada: false, motivo: motivoMuerta };
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

  // Sesión que existe pero que WhatsApp ya rechazó (401 y compañía): no
  // es «no hay sesión», es «hay que volver a vincular». Se distingue
  // para poder avisar en vez de dejar al usuario en el bucle.
  const rechazada = sesion.hay && !sesion.registrada && /rechaz|cerró|401|403|invalid/i.test(sesion.motivo || "");

  if (hayTerminal) {
    return {
      accion: rechazada ? "revincular" : "preguntar",
      numero: "",
      motivo: sesion.motivo,
    };
  }
  // Sin terminal no se puede preguntar, pero el mensaje tiene que decir
  // la verdad: la sesión murió y hay que vincular de nuevo.
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
