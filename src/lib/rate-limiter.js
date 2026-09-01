// ═══════════════════════════════════════════════════════════════════
//  rate-limiter.js — Cola FIFO con delay + límite por minuto
//  Protege contra baneo de WhatsApp por rate-limiting.
// ═══════════════════════════════════════════════════════════════════

import log from "#lib/logger";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULTS = {
  delayMs: Number(process.env.RATE_DELAY_MS) || 800,
  priorityDelayMs: Number(process.env.RATE_PRIORITY_DELAY_MS) || 300,
  maxPerMinute: Number(process.env.RATE_MAX_PER_MINUTE) || 60,
};

export function createRateLimiter(opts = {}) {
  const config = { ...DEFAULTS, ...opts };
  const queue = [];
  let processing = false;
  let sentThisMinute = 0;
  let minuteTimer = null;

  function resetCounter() { sentThisMinute = 0; }

  function enqueue(sendFn, isPriority = false) {
    return new Promise((resolve, reject) => {
      const task = { sendFn, isPriority, resolve, reject };
      if (isPriority) {
        const lastPri = queue.map((t, i) => t.isPriority ? i : -1).filter((i) => i >= 0);
        const at = lastPri.length > 0 ? Math.max(...lastPri) + 1 : 0;
        queue.splice(at, 0, task);
      } else {
        queue.push(task);
      }
      if (!processing) processQueue();
    });
  }

  async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
      if (sentThisMinute >= config.maxPerMinute) {
        const wait = 60_000 - (Date.now() % 60_000) + 100;
        log.warn(`Rate-limit: esperando ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
        sentThisMinute = 0;
      }

      const task = queue.shift();
      if (!task) continue;

      try {
        sentThisMinute++;
        task.resolve(await task.sendFn());
      } catch (err) {
        task.reject(err);
      }

      const d = task.isPriority ? config.priorityDelayMs : config.delayMs;
      if (queue.length > 0) await sleep(d);
    }

    processing = false;
  }

  function stats() {
    return {
      queueLength: queue.length,
      processing,
      sentThisMinute,
      maxPerMinute: config.maxPerMinute,
      delayMs: config.delayMs,
    };
  }

  function pause() { queue.length = 0; processing = false; }

  if (minuteTimer) clearInterval(minuteTimer);
  minuteTimer = setInterval(resetCounter, 60_000);
  if (minuteTimer.unref) minuteTimer.unref();

  return { enqueue, stats, pause, getQueueLength: () => queue.length };
}

let defaultLimiter = null;
export function getDefaultLimiter() {
  if (!defaultLimiter) defaultLimiter = createRateLimiter();
  return defaultLimiter;
}

export default { createRateLimiter, getDefaultLimiter };