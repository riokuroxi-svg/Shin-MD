import log from "#logger";

export function createWatchdog(engine, opts) {
  opts = opts || {};
  const CHECK_INTERVAL = opts.intervalMs || 10000;
  const STUCK_THRESHOLD = opts.stuckThresholdMs || 300000;

  let lastTick = Date.now();
  let watchInterval = null;
  let enabled = false;

  function tick() { lastTick = Date.now(); }

  function start() {
    if (enabled) return;
    enabled = true;
    watchInterval = setInterval(check, CHECK_INTERVAL);
    if (watchInterval.unref) watchInterval.unref();
    log.gray("Watchdog started (every " + (CHECK_INTERVAL / 1000) + "s)");
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

    // Check if main loop is stuck
    if (elapsed > STUCK_THRESHOLD) {
      log.error("Watchdog: engine appears stuck (" + Math.round(elapsed / 1000) + "s since last tick)", null);
      engine.getHealth().recordError(new Error("engine_stuck"));
    }

    // Check ban risk
    const risk = engine.getHealth().getRiskScore();
    if (risk >= 80) {
      log.warn("Watchdog: ban risk critical (" + risk + "%) - auto-pausing sends");
      engine.getSendQueue().pause();
    } else if (risk < 50 && engine.getSendQueue().isPaused()) {
      log.success("Watchdog: ban risk recovered (" + risk + "%) - resuming sends");
      engine.getSendQueue().resume();
    }

    // Log health status periodically
    if (Math.random() < 0.1) {
      const health = engine.getHealth().getStatus();
      log.gray("Health: risk=" + health.score + "% level=" + health.level +
        " queue=" + engine.getSendQueue().length() +
        " uptime=" + Math.round(engine.getUptime() / 60000) + "m");
    }
  }

  return { start, stop, tick };
}

export default createWatchdog;
