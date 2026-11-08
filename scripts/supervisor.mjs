/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  supervisor.mjs — Levantar el bot y no dejarlo caído
//
//  Es el motor que comparten las dos caras del arranque:
//    · vigia.mjs    → sin interfaz, para systemd, pm2 o un VPS
//    · consola.mjs  → con el panel dibujado en la terminal
//
//  Aquí no se dibuja nada ni se escribe en pantalla: solo se avisa por
//  los ganchos. Así la misma lógica se prueba una vez y las dos caras se
//  comportan igual.
//
//  Reglas:
//    · si el bot pide reiniciar (IPC "restart"), se levanta otra vez y
//      eso NO cuenta como caída;
//    · si se muere solo, se levanta esperando 1, 2, 4, 8 y 15 s;
//    · si se cae 5 veces en 2 minutos, se rinde: eso ya no lo arregla
//      reiniciar más rápido.
// ═══════════════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import path from "node:path";

export const VENTANA_MS = 120_000;
export const MAX_CAIDAS = 5;
export const ESPERA_MAX_MS = 15_000;

const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * @param {object} o
 * @param {string} o.raiz        Carpeta del bot (donde vive index.js).
 * @param {string[]} [o.argumentos] Argumentos para index.js (--code, --qr…).
 * @param {object} [o.env]       Variables extra para el hijo.
 * @param {object} [o.ganchos]
 * @param {(pid:number)=>void}   [o.ganchos.arrancado]
 * @param {(info:object)=>void}  [o.ganchos.pidioReiniciar]
 * @param {(info:object)=>void}  [o.ganchos.cayo]
 * @param {(info:object)=>void}  [o.ganchos.esperando]
 * @param {(info:object)=>void}  [o.ganchos.rendido]
 * @param {(motivo:string)=>void}[o.ganchos.parado]
 * @param {(texto:string)=>void} [o.ganchos.salida]  Solo si capturar = true.
 * @param {boolean} [o.capturar] Leer la salida del hijo en vez de dejarla
 *        ir directa a la terminal. Obligatorio en la consola: si se
 *        captura sin leer, el bot se bloquea al llenarse el tubo.
 */
export function crearSupervisor({ raiz, argumentos = [], env = {}, ganchos = {}, capturar = false } = {}) {
  const entrada = path.join(raiz, "index.js");

  let hijo = null;
  let parando = false;
  let caidas = [];
  let reinicios = 0;
  let estado = "detenido";

  const avisar = (nombre, datos) => {
    try {
      ganchos[nombre]?.(datos);
    } catch {
      // Un gancho que revienta no puede tumbar al que vigila.
    }
  };

  /** Un turno: arranca el hijo y espera a saber qué pasó. */
  async function turno() {
    // Si nos pararon mientras esperábamos el retroceso, no se arranca nada.
    if (parando) {
      estado = "detenido";
      return "parar";
    }
    estado = "arrancando";
    // Sin capturar, el hijo escribe directo en la terminal (vigía a secas).
    // Capturando, se lee aquí para pintarlo dentro del panel; si nadie
    // leyera el tubo, el bot se quedaría clavado al llenarse.
    const flujo = capturar ? "pipe" : "inherit";
    hijo = spawn(process.execPath, [entrada, ...argumentos], {
      cwd: raiz,
      stdio: [capturar ? "ignore" : "inherit", flujo, flujo, "ipc"],
      env: { ...process.env, ...env, SHIN_VIGILADO: "1" },
    });

    if (capturar) {
      hijo.stdout.setEncoding("utf8");
      hijo.stderr.setEncoding("utf8");
      hijo.stdout.on("data", (t) => avisar("salida", t));
      hijo.stderr.on("data", (t) => avisar("salida", t));
      // Si el hijo muere a mitad de una línea, se corta ahí y no se mezcla
      // con el siguiente arranque.
      hijo.on("exit", () => avisar("salida", "\n"));
    }

    const pid = hijo.pid;
    avisar("arrancado", { pid });
    estado = "activo";

    hijo.on("message", (mensaje) => {
      if (mensaje === "restart") {
        reinicios += 1;
        estado = "reiniciando";
        avisar("pidioReiniciar", { reinicios });
        hijo.kill("SIGTERM");
      }
    });

    const { code, signal } = await new Promise((listo) => {
      hijo.on("exit", (codigo, senal) => listo({ code: codigo, signal: senal }));
    });

    hijo = null;

    if (parando) {
      estado = "detenido";
      avisar("parado", { motivo: "parado" });
      return "parar";
    }

    // SIGTERM tras un reinicio pedido: se levanta sin contarlo como caída.
    if (signal === "SIGTERM") {
      estado = "reiniciando";
      avisar("reiniciando", { reinicios });
      await espera(400);
      return "reiniciar";
    }

    const ahora = Date.now();
    caidas = caidas.filter((t) => ahora - t < VENTANA_MS);
    caidas.push(ahora);

    if (caidas.length >= MAX_CAIDAS) {
      estado = "rendido";
      avisar("rendido", { caidas: caidas.length, ventana: VENTANA_MS });
      return "rendirse";
    }

    const esperaMs = Math.min(1000 * 2 ** (caidas.length - 1), ESPERA_MAX_MS);
    estado = "esperando";
    avisar("cayo", { code, signal, esperaMs, intento: caidas.length });
    await espera(esperaMs);
    return "reiniciar";
  }

  /** Bucle principal. Termina solo si se para o si se rinde. */
  async function ejecutar() {
    for (;;) {
      const decision = await turno();
      if (decision !== "reiniciar") return decision === "parar" ? "parado" : "rendido";
    }
  }

  /** SIGTERM y, si a los 5 s sigue ahí, SIGKILL. Un bot colgado no frena la salida. */
  function matar() {
    const victima = hijo;
    if (!victima) return false;
    victima.kill("SIGTERM");
    setTimeout(() => {
      if (victima.exitCode === null && victima.signalCode === null) victima.kill("SIGKILL");
    }, 5000).unref();
    return true;
  }

  function parar() {
    if (parando) return false;
    parando = true;
    if (!matar()) avisar("parado", { motivo: "sin-hijo" });
    return true;
  }

  /** Reiniciar a mano desde fuera (la tecla "r" de la consola). */
  function reiniciar() {
    reinicios += 1;
    estado = "reiniciando";
    return matar();
  }

  return {
    ejecutar,
    parar,
    reiniciar,
    get estado() {
      return estado;
    },
    get pid() {
      return hijo?.pid || 0;
    },
    get reinicios() {
      return reinicios;
    },
  };
}

export default crearSupervisor;
