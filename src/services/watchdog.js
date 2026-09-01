import log from "#logger";

export function createWatchdog(engine, opts) {
  opts = opts || {};
  const CHECK_INTERVAL = opts.intervalMs || 10000;
  const STUCK_THRESHOLD = opts.stuckThresholdMs || 300000;

  let lastTick = Date.now();
  let watchInterval = null;
  let enabled = false;
  let stuckWarningSent = false;
  let healthLogCounter = 0;
  const HEALTH_LOG_INTERVAL = 60; // cada ~60 checks (~10min)

  function tick() { lastTick = Date.now(); stuckWarningSent = false; }

  function start() {
    if (enabled) return;
    enabled = true;
    watchInterval = setInterval(check, CHECK_INTERVAL);
    if (watchInterval.unref) watchInterval.unref();
  }

  function stop() {
    enabled = false;
    if (watchInterval) clearInterval(watchInterval);
    watchInterval = null;
  }

  function check() {
    if (!enabled) return;

    const now = Date.now();
    const elapsed = now - lastTick;

    // Solo mostrar stuck si no lo hemos mostrado ya
    if (elapsed > STUCK_THRESHOLD) {
      if (!stuckWarningSent) {
        stuckWarningSent = true;
        log.warn("Watchdog: sin actividad del socket (" + Math.round(elapsed / 1000) + "s)");
      }
    } else {
      stuckWarningSent = false;
    }

    // Ban risk cada 10 checks aprox
    healthLogCounter++;
    if (healthLogCounter % 10 === 0) {
      const risk = engine.getHealth().getRiskScore();
      if (risk >= 80) {
        log.warn("Watchdog: ban risk critical (" + risk + "%) - auto-pausing sends");
        engine.getSendQueue().pause();
      } else if (risk < 50 && engine.getSendQueue().isPaused()) {
        log.success("Watchdog: ban risk recovered (" + risk + "%) - resuming sends");
        engine.getSendQueue().resume();
      }

      // Log health solo cada 60 ciclos
      if (healthLogCounter >= HEALTH_LOG_INTERVAL) {
        healthLogCounter = 0;
        const health = engine.getHealth().getStatus();
        log.gray("Health: risk=" + health.score + "% level=" + health.level +
          " queue=" + engine.getSendQueue().length() +
          " uptime=" + Math.round(engine.getUptime() / 60000) + "m");
      }
    }
  }

  return { start, stop, tick };
}

export default createWatchdog;