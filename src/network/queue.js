/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";

// Tope por envío: si Baileys cuelga una promesa de sendMessage (redes
// inestables), la cola NO puede congelarse detrás de ese envío para todos
// los chats. Tras este tiempo se trata como fallo y se sigue con el siguiente.
// (La operación huérfina puede terminar más tarde en segundo plano; no es
// cancelable, pero ya no bloquea nada.)
const SEND_TIMEOUT_MS = 120000;

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(label + " superó " + ms + "ms")), ms); }),
  ]).finally(() => clearTimeout(t));
}

export function createSendQueue(throttler, health, opts = {}) {
  const timeoutMs = opts.timeoutMs || SEND_TIMEOUT_MS;
  const queue = [];
  let processing = false;
  let paused = false;
  // B1.4: ventana de prioridad. El router la abre alrededor de comandos
  // marcados `priority: true` (.menu/.ping/.owner); todo envío hecho
  // dentro de la ventana sale con delay mínimo y no lo frena el tope
  // diario del warm-up (son respuestas directas a quien escribe: lo
  // menos baneable que hay).
  let priorityDepth = 0;

  // B2.2: el tope diario antes escribía "Warm-up limit reached, waiting 60s..."
  // una vez por minuto, para siempre, sin decir cuánto era el tope ni cuándo
  // se libera. Ahora se avisa UNA sola vez por episodio y con datos útiles.
  let avisoTopeDado = false;
  function avisarTopeDiario(th) {
    if (avisoTopeDado) return;
    avisoTopeDado = true;
    let detalle = "";
    try {
      const s = th.getStats();
      const faltanMs = new Date().setUTCHours(24, 0, 0, 0) - Date.now();
      const horas = Math.floor(faltanMs / 3600000);
      const mins = Math.round((faltanMs % 3600000) / 60000);
      detalle = ` (${s.msgsToday}/${s.dailyLimit} hoy · día ${s.day} del warm-up · se reinicia en ${horas}h ${mins}m)`;
    } catch {}
    log.warn("Tope diario del warm-up alcanzado" + detalle);
    log.warn("Los envíos normales esperan; .menu/.ping y las reacciones siguen pasando. Ajusta con WARMUP_START_MSGS / WARMUP_MAX_MSGS / WARMUP=off en .env, o revísalo con .warmup");
  }

  function enterPriority() { priorityDepth++; }
  function exitPriority() { priorityDepth = Math.max(0, priorityDepth - 1); }
  function inPriority() { return priorityDepth > 0; }

  function enqueue(fn, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      queue.push({ fn, opts, resolve, reject, ts: Date.now() });
      if (!processing) process();
    });
  }

  async function process() {
    if (processing || paused) return;
    processing = true;

    while (queue.length > 0) {
      if (paused) { processing = false; return; }

      // B1.4: con el tope diario del warm-up alcanzado, las tareas
      // normales esperan; si hay una tarea de prioridad en la cola,
      // se adelanta y pasa (nunca se queda 60s detrás del bloqueo).
      // B2.2: lo mismo para las tareas que no gastan cuota (reacciones,
      // borrados, ediciones): no tiene sentido congelarlas 60s por un
      // tope que ni siquiera consumen.
      let task;
      if (throttler && throttler.canSend()) avisoTopeDado = false;
      if (throttler && !throttler.canSend()) {
        const pIdx = queue.findIndex(t => t.opts && (t.opts.isPriority || t.opts.countsForQuota === false));
        if (pIdx === -1) {
          avisarTopeDiario(throttler);
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        task = queue.splice(pIdx, 1)[0];
      } else {
        task = queue.shift();
      }

      const delay = throttler ? throttler.calcDelay({
        isPriority: task.opts.isPriority || false,
        messageLength: task.opts.messageLength || 0,
        isNewContact: task.opts.isNewContact || false,
      }) : 500;

      await new Promise(r => setTimeout(r, delay));

      const gastaCuota = task.opts.countsForQuota !== false;

      try {
        const result = await withTimeout(task.fn(), timeoutMs, "envío");
        if (throttler && gastaCuota) throttler.recordSent();
        if (health) health.recordSend();
        task.resolve(result);
      } catch (err) {
        if (health) health.recordSendFail(err);
        log.error("Send failed: " + (err.message || err), err);
        try {
          // Reintento que RESPETA el throttler (nunca 3s fijos a tope de
          // velocidad: esto es un bot anti-ban). Mínimo 2s.
          const retryDelay = throttler
            ? Math.max(2000, throttler.calcDelay({ messageLength: task.opts.messageLength || 0 }))
            : 3000;
          await new Promise(r => setTimeout(r, retryDelay));
          const result2 = await withTimeout(task.fn(), timeoutMs, "reintento");
          if (throttler && gastaCuota) throttler.recordSent();
          task.resolve(result2);
          if (health) health.recordSend();
        } catch (err2) {
          task.reject(err2);
        }
      }
    }
    processing = false;
  }

  function pause() { paused = true; }
  function resume() { paused = false; if (!processing) process(); }
  function clear() { queue.length = 0; }
  function length() { return queue.length; }
  function isPaused() { return paused; }

  return { enqueue, pause, resume, clear, length, isPaused, enterPriority, exitPriority, inPriority };
}

export default createSendQueue;
