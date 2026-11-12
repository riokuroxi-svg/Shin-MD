/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  entrada.js — la puerta de los mensajes que llegan
//
//  `messages.upsert` lanzaba un handle por mensaje sin límite: 300
//  mensajes en un minuto eran 300 handlers a la vez peleando por la
//  misma SQLite y la misma CPU, y el bucle de eventos se quedaba sin
//  aire justo cuando había que contestar rápido.
//
//  Esto NO es `#lib/limits` (aquel es un semáforo que RECHAZA cuando
//  está lleno, y sirve para comandos pesados que el usuario pidió). Un
//  mensaje que llega no se puede rechazar: se atiende, sólo que en
//  orden y de a pocos. Por eso aquí se hace cola.
//
//  Uso:
//    const entrada = crearEntrada({ concurrentes: 4, enEspera: 200 });
//    onMessage: (s, m) => entrada.ejecutar(() => router.handle(s, m))
//
//  Si la espera pasa de `enEspera`, el mensaje se descarta y se cuenta:
//  es preferible no contestar el número 201 de una avalancha que
//  quedarse sin memoria. Los descartes se ven en `stats()`.
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {object} [opciones]
 * @param {number} [opciones.concurrentes] handlers a la vez
 * @param {number} [opciones.enEspera]    máximo en cola antes de descartar
 * @param {function} [opciones.alDescartar] aviso cuando se tira uno
 */
export function crearEntrada({ concurrentes = 4, enEspera = 200, alDescartar } = {}) {
  // `concurrentes <= 0` la deja desactivada: se ejecuta como siempre, sin cola.
  const apagada = Number(concurrentes) <= 0;
  const tope = Math.max(1, Number(concurrentes) || 4);
  const colaMax = Math.max(0, Number(enEspera) || 0);

  let activos = 0;
  let maxVisto = 0;
  let atendidos = 0;
  let descartados = 0;
  let esperas = 0;
  let ultimoDescarte = 0;
  const cola = [];

  // Corre una tarea y libera el slot ANTES de devolver el control: si el
  // contador se descontara después de resolver, quien hace `await` vería
  // todavía un handler vivo.
  async function correr(tarea) {
    activos += 1;
    if (activos > maxVisto) maxVisto = activos;
    try {
      tarea.resolve(await tarea.fn());
    } catch (e) {
      tarea.reject(e);
    } finally {
      activos -= 1;
      atendidos += 1;
      siguiente();
    }
  }

  function siguiente() {
    if (activos >= tope || cola.length === 0) return;
    correr(cola.shift());
  }

  /**
   * Encola `fn`. Devuelve una promesa que se resuelve con su resultado, o con
   * `{ descartado: true }` si la espera estaba llena.
   * @param {function} fn
   */
  function ejecutar(fn) {
    if (apagada) return Promise.resolve().then(fn);
    return new Promise((resolve, reject) => {
      if (activos < tope && cola.length === 0) {
        correr({ fn, resolve, reject });
        return;
      }
      if (cola.length >= colaMax) {
        descartados += 1;
        ultimoDescarte = Date.now();
        if (typeof alDescartar === "function") {
          try {
            alDescartar({ enEspera: cola.length, atendidos, descartados });
          } catch {}
        }
        resolve({ descartado: true });
        return;
      }
      esperas += 1;
      cola.push({ fn, resolve, reject });
    });
  }

  function stats() {
    return { activos, enEspera: cola.length, tope, colaMax, atendidos, descartados, esperas, maxVisto, ultimoDescarte };
  }

  /** Vacía la cola de espera (apagado). No toca lo que ya está en marcha. */
  function vaciar() {
    const sobran = cola.splice(0, cola.length);
    for (const t of sobran) t.resolve({ descartado: true });
    return sobran.length;
  }

  return { ejecutar, stats, vaciar, get activos() { return activos; }, get apagada() { return apagada; } };
}

export default crearEntrada;
