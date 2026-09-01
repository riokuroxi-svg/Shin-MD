// ═══════════════════════════════════════════════════════════════════
//  watchdog.js — Watchdog minimalista (SIN SPAM de consola)
//  Solo monitorea internamente, nunca imprime nada a menos que
//  sea una advertencia crítica real (ban risk > 80%).
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

export function createWatchdog(engine, opts) {
  opts = opts || {};
  const CHECK_INTERVAL = opts.intervalMs || 10000;
  const STUCK_THRESHOLD = opts.stuckThresholdMs || 300000;

  let lastTick = Date.now();
  let watchInterval = null;
  let enabled = false;
  let stuckWarningPrinted = false;

  function tick() { lastTick = Date.now(); stuckWarningPrinted = false; }

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

    // ─── Si el socket está colgado, mostrar UNA advertencia ───
    if (elapsed > STUCK_THRESHOLD) {
      if (!stuckWarningPrinted) {
        stuckWarningPrinted = true;
        log.warn("Sin actividad del socket (" + Math.round(elapsed / 1000) + "s)");
        // ^ NUNCA se repite este mensaje hasta que el engine haga tick()
      }
    } else {
      stuckWarningPrinted = false;
    }

    // ─── Ban risk: solo actuar, NUNCA imprimir health de rutina ───
    try {
      const risk = engine.getHealth().getRiskScore();
      if (risk >= 80) {
        log.warn("Ban risk alto (" + risk + "%) — pausando envíos");
        engine.getSendQueue().pause();
      } else if (risk < 50 && engine.getSendQueue().isPaused()) {
        log.success("Ban risk recuperado (" + risk + "%) — reanudando envíos");
        engine.getSendQueue().resume();
      }
    } catch {}
  }

  return { start, stop, tick };
}

export default createWatchdog;