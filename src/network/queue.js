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

      const task = queue.shift();

      if (throttler && !throttler.canSend()) {
        log.warn("Warm-up limit reached, waiting 60s...");
        await new Promise(r => setTimeout(r, 60000));
        queue.unshift(task);
        continue;
      }

      const delay = throttler ? throttler.calcDelay({
        isPriority: task.opts.isPriority || false,
        messageLength: task.opts.messageLength || 0,
        isNewContact: task.opts.isNewContact || false,
      }) : 500;

      await new Promise(r => setTimeout(r, delay));

      try {
        const result = await withTimeout(task.fn(), timeoutMs, "envío");
        if (throttler) throttler.recordSent();
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
          if (throttler) throttler.recordSent();
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

  return { enqueue, pause, resume, clear, length, isPaused };
}

export default createSendQueue;
