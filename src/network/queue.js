import log from "#logger";

export function createSendQueue(throttler, health) {
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
        const result = await task.fn();
        if (throttler) throttler.recordSent();
        if (health) health.recordSend();
        task.resolve(result);
      } catch (err) {
        if (health) health.recordSendFail(err);
        log.error("Send failed: " + (err.message || err), err);
        try {
          await new Promise(r => setTimeout(r, 3000));
          const result2 = await task.fn();
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
