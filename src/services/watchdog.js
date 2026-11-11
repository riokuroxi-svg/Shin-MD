/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  watchdog.js — Vigilancia de salud + auto-recuperación
//  · check() cada intervalMs (10s): score de riesgo del health monitor
//  · riesgo ≥80  → pausa la cola de envíos (anti-ban)
//  · riesgo ≥95  → reconnect forzado (ws.close(); Baileys reabre solo)
//  · conexión stuck (sin actividad 5 min en estado CONNECT+) → reconnect
//  · 3 reconnections forzadas sin alivio en 2 min → alto a gritos
//    (se resetea solo cuando el riesgo baja; no toca process.exit)
//
//  tick() lo llama socket.js en "open" y en "messages.upsert":
//  cualquier señal de vida reinicia el reloj de stuck.
//  API (la que usa boot/index.js): createWatchdog(engine, opts) →
//  { start, stop, check, tick, isPaused, getLastRisk }
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

const WS_OPEN = 1;

export function createWatchdog(engine, opts = {}) {
  const intervalMs = opts.intervalMs || 10000;
  const stuckThresholdMs = opts.stuckThresholdMs || 300000;
  const riskThreshold = opts.riskThreshold || 80;
  const maxRisk = opts.maxRisk || 95;

  let timer = null;
  let paused = false;
  let checking = false;
  let lastActivity = Date.now();
  let lastRisk = 0;
  let strikes = 0;
  let lastStrike = 0;
  const MAX_STRIKES = 3;
  const STRIKE_COOLDOWN_MS = 120000;

  function wsReady(sock) {
    // Baileys: sock.ws.ready (booleano) o readyState (1 = OPEN)
    if (!sock || !sock.ws) return false;
    return sock.ws.ready === true || sock.ws.readyState === WS_OPEN;
  }

  /** Señal de vida (open / messages.upsert). */
  function tick() {
    lastActivity = Date.now();
  }

  function doReconnect(reason) {
    const sock = engine.getSock();
    if (!wsReady(sock)) return;
    if (Date.now() - lastStrike < STRIKE_COOLDOWN_MS) return; // breaker
    strikes++;
    lastStrike = Date.now();
    if (strikes > MAX_STRIKES) {
      log.error("Watchdog: " + MAX_STRIKES + " reconnects forzados sin alivio — riesgo de BAN; revisar sesión/red (intento manual)");
      strikes = 0; // espera a que el riesgo baje para volver a intentar
      return;
    }
    log.warn("Watchdog: reconnect forzado #" + strikes + " (" + reason + ")");
    try {
      sock.ws.close(); // Baileys reabre la conexión solo
    } catch (err) {
      log.error("Watchdog: ws.close() falló: " + (err.message || err));
    }
  }

  function check() {
    if (checking) return;
    checking = true;
    try {
      const state = engine.getState();
      if (state >= engine.LIFECYCLE.SHUTDOWN) return;

      const health = engine.getHealth();
      const queue = engine.getSendQueue();
      const sock = engine.getSock();
      if (!health || !queue) return;

      const score = health.getRiskScore();
      lastRisk = score;

      // 1) Pausa/reanuda la cola según riesgo (anti-ban)
      // Usa el motivo "riesgo" para no pisarse con la pausa por "conexion".
      if (score >= riskThreshold && !paused) {
        paused = true;
        queue.pause("riesgo");
        log.warn("Watchdog: riesgo alto (" + score + ") — cola de envíos en pausa");
      } else if (paused && score < riskThreshold) {
        paused = false;
        queue.resume("riesgo");
        log.info("Watchdog: riesgo normal (" + score + ") — cola reanudada");
      }

      // 2) Conexión stuck / sesión sorda (#2491): unificado aquí para no
      //    duplicar temporizadores ni provocar tormentas de reconexión.
      const ses = typeof engine.getSesion === "function" ? engine.getSesion() : null;
      const sordera = state === engine.LIFECYCLE.RUNNING && ses?.activo && ses.sordera?.revisar?.();
      const idle = Date.now() - lastActivity;
      if ((state >= engine.LIFECYCLE.CONNECT && idle > stuckThresholdMs) || sordera) {
        if (wsReady(sock)) {
          doReconnect(
            sordera
              ? "sesión sorda — sin mensajes entrantes"
              : "conexión stuck " + Math.round(idle / 60000) + " min sin actividad",
          );
        } else if (idle > stuckThresholdMs) {
          // sin ws abierta: Baileys ya está reintentando; solo avisar
          log.warn("Watchdog: sin conexión abierta y " + Math.round(idle / 60000) + " min de inactividad");
        }
      }

      // 3) Riesgo crítico → reconnect inmediato si hay ws
      if (score >= maxRisk && wsReady(sock)) {
        doReconnect("riesgo crítico " + score);
      }

      // 4) Riesgo recuperado → resetear breaker
      if (score < riskThreshold && strikes > 0) {
        log.info("Watchdog: riesgo recuperado — contador de reconnects reseteado");
        strikes = 0;
      }
    } catch (err) {
      // El watchdog NUNCA debe tumbar el bot por su propio fallo.
      log.error("Watchdog check: " + (err.message || err));
    } finally {
      checking = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(check, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return {
    start, stop, check, tick,
    isPaused: () => paused,
    getLastRisk: () => lastRisk,
  };
}

export default createWatchdog;
