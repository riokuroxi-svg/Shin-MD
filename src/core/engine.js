/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";
import { createHealthMonitor } from "#health";
import createSendQueue from "#queue";
import { createThrottler } from "#throttler";
import { crearRitmo, avisarRitmo } from "../lib/ritmo.js";
import { crearSesion } from "../lib/sesion.js";

const LIFECYCLE = { BOOT: 0, INIT: 1, CONNECT: 2, READY: 3, RUNNING: 4, SHUTDOWN: 5 };

export function createEngine(opts) {
  opts = opts || {};
  let state = LIFECYCLE.BOOT;
  let sock = null;
  let bootTime = Date.now();
  let ownerJid = null;
  let groupCount = 0;
  const health = createHealthMonitor();
  // opts.throttler: perfil del número (B2.1) — el boot decide si el
  // número es nuevo (1500ms + warm-up 7d) o aclimatado (700ms + 2d).
  const throttler = createThrottler(opts.throttler);
  // El ritmo vive aparte del tope diario: cuenta conversaciones nuevas (no
  // mensajes), mira la hora y se encarga del «escribiendo…».
  const ritmo = crearRitmo({ estado: opts.ritmoEstado, ajustes: opts.ritmo });
  // Las piezas de sesión: calma tras reconectar, detector de sordera, portón de
  // reentrada y descanso diario. Ver src/lib/sesion.js.
  const sesion = crearSesion(opts.sesion);
  const sendQueue = createSendQueue(throttler, health, { ritmo, sesion, avisarRitmo });
  const listeners = {};
  const shutdownHooks = [];

  function onShutdown(fn) {
    if (typeof fn === "function") shutdownHooks.push(fn);
    return () => {
      const idx = shutdownHooks.indexOf(fn);
      if (idx >= 0) shutdownHooks.splice(idx, 1);
    };
  }

  function getState() { return state; }
  function getStateName() { return Object.keys(LIFECYCLE).find(k => LIFECYCLE[k] === state) || "UNKNOWN"; }
  function getSock() { return sock; }
  function setSock(s) { sock = s; }
  function setOwnerJid(j) { ownerJid = j; }
  function getOwnerJid() { return ownerJid; }
  function setGroupCount(n) { groupCount = n; }
  function getGroupCount() { return groupCount; }
  function getHealth() { return health; }
  function getThrottler() { return throttler; }
  function getSendQueue() { return sendQueue; }
  function getRitmo() { return ritmo; }
  function getSesion() { return sesion; }
  function getUptime() { return Date.now() - bootTime; }
  function resetBootTime() { bootTime = Date.now(); }

  function transit(newState) {
    const old = getStateName();
    state = newState;
    log.gray(`Engine: ${old} → ${getStateName()}`);
    emit("lifecycle", { from: old, to: getStateName(), ts: Date.now() });
  }

  function emit(event, data) {
    const ev = listeners[event];
    if (ev) {
      for (const fn of ev) {
        try { fn(data); } catch (e) { log.error(`Engine emit(${event}): ${e.message}`, e); }
      }
    }
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => { listeners[event] = listeners[event].filter(f => f !== fn); };
  }

  function once(event, fn) {
    const wrapper = (data) => { fn(data); off(); };
    const off = on(event, wrapper);
    return off;
  }

  async function shutdown() {
    transit(LIFECYCLE.SHUTDOWN);
    log.info("Engine shutting down...");
    sendQueue.pause("shutdown");
    for (const fn of [...shutdownHooks].reverse()) {
      try { await fn(); } catch (e) { log.warn("Engine shutdown hook: " + (e?.message || e)); }
    }
    if (sesion.__sorderaTimer) {
      clearInterval(sesion.__sorderaTimer);
      sesion.__sorderaTimer = null;
    }
    if (sock) {
      try { sock.ev.removeAllListeners(); } catch {}
      try { sock.ws.close(); } catch {}
      try { sock.end(new Error("shutdown")); } catch {}
    }
    log.success("Engine shutdown complete");
  }

  transit(LIFECYCLE.INIT);

  return {
    getState, getStateName, getSock, setSock,
    setOwnerJid, getOwnerJid,
    setGroupCount, getGroupCount,
    getHealth, getThrottler, getSendQueue, getRitmo, getSesion, getUptime, resetBootTime,
    transit, emit, on, once, onShutdown, shutdown, LIFECYCLE,
    bootTime,
  };
}

export default createEngine;
