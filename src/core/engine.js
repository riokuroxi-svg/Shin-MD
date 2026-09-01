import log from "#logger";
import { createHealthMonitor } from "#health";
import createSendQueue from "#queue";
import { createThrottler } from "#throttler";

const LIFECYCLE = { BOOT: 0, INIT: 1, CONNECT: 2, READY: 3, RUNNING: 4, SHUTDOWN: 5 };

export function createEngine() {
  let state = LIFECYCLE.BOOT;
  let sock = null;
  let bootTime = Date.now();
  let ownerJid = null;
  const health = createHealthMonitor();
  const throttler = createThrottler();
  const sendQueue = createSendQueue(throttler, health);
  const listeners = {};

  function getState() { return state; }
  function getStateName() { return Object.keys(LIFECYCLE).find(k => LIFECYCLE[k] === state) || "UNKNOWN"; }
  function getSock() { return sock; }
  function setSock(s) { sock = s; }
  function setOwnerJid(j) { ownerJid = j; }
  function getOwnerJid() { return ownerJid; }
  function getHealth() { return health; }
  function getThrottler() { return throttler; }
  function getSendQueue() { return sendQueue; }
  function getUptime() { return Date.now() - bootTime; }

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
    sendQueue.pause();
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
    getHealth, getThrottler, getSendQueue, getUptime,
    transit, emit, on, once, shutdown, LIFECYCLE,
    bootTime,
  };
}

export default createEngine;
