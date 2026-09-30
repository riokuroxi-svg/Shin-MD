/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";

function shinJitter(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const DEFAULTS = {
  baseDelayMs: 400,
  jitterStddev: 0.15,
  minDelayMs: 150,
  maxDelayMs: 2500,
  msPerChar: 10,
  newContactPenalty: 1.2,
  warmUpDays: 0,
  warmUpStartMsgsPerDay: 50000,
  warmUpMaxMsgsPerDay: 100000,
  disableWarmup: false,
};

export function createThrottler(opts) {
  opts = opts || {};
  const config = {};
  for (const k of Object.keys(DEFAULTS)) {
    config[k] = opts[k] !== undefined ? opts[k] : DEFAULTS[k];
  }

  // Si WARMUP_LIMIT=0 o NUMBER_PROFILE=veterano en .env, desactivar límite diario
  if (process.env.WARMUP_LIMIT === "0" || process.env.NUMBER_PROFILE === "veterano" || process.env.NUMBER_PROFILE === "ilimitado") {
    config.disableWarmup = true;
  }
  if (opts.warmUpStartMsgsPerDay !== undefined && opts.disableWarmup === undefined && process.env.WARMUP_LIMIT !== "0") {
    config.disableWarmup = false;
  }

  const state = {
    warmUpStartDate: opts.warmUpStartDate || new Date().toISOString().slice(0, 10),
    warmUpMsgsToday: opts.warmUpMsgsToday || 0,
    warmUpLastReset: opts.warmUpLastReset || new Date().toISOString().slice(0, 10),
    totalSent: 0,
  };

  function checkReset() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.warmUpLastReset !== today) {
      state.warmUpMsgsToday = 0;
      state.warmUpLastReset = today;
    }
  }

  function getDailyLimit() {
    if (config.disableWarmup) return Infinity;
    const start = new Date(state.warmUpStartDate).getTime();
    const now = Date.now();
    const day = Math.max(0, Math.min(config.warmUpDays || 1, Math.floor((now - start) / 86400000)));
    const progress = config.warmUpDays > 0 ? (day / config.warmUpDays) : 1;
    const range = config.warmUpMaxMsgsPerDay - config.warmUpStartMsgsPerDay;
    return Math.round(config.warmUpStartMsgsPerDay + range * progress);
  }

  function calcDelay(extra) {
    extra = extra || {};
    checkReset();

    if (extra.isPriority) return config.minDelayMs;

    let delay = config.baseDelayMs + shinJitter(0, config.baseDelayMs * config.jitterStddev);

    if (extra.messageLength > 20) {
      delay += Math.min(extra.messageLength * config.msPerChar, 800);
    }

    if (extra.isNewContact) {
      delay *= config.newContactPenalty;
    }

    return Math.round(Math.max(config.minDelayMs, Math.min(config.maxDelayMs, delay)));
  }

  function canSend() {
    if (config.disableWarmup) return true;
    checkReset();
    return state.warmUpMsgsToday < getDailyLimit();
  }

  function recordSent() {
    checkReset();
    state.warmUpMsgsToday++;
    state.totalSent++;
  }

  function getStats() {
    checkReset();
    const start = new Date(state.warmUpStartDate).getTime();
    const day = Math.floor((Date.now() - start) / 86400000) + 1;
    return {
      day: day,
      dailyLimit: getDailyLimit(),
      msgsToday: state.warmUpMsgsToday,
      totalSent: state.totalSent,
      warmUpComplete: config.disableWarmup || day > config.warmUpDays,
      dailyLimitReached: !config.disableWarmup && state.warmUpMsgsToday >= getDailyLimit(),
    };
  }

  return { calcDelay, canSend, recordSent, getStats, state };
}

let defaultThrottler = null;
export function getThrottler() {
  if (!defaultThrottler) defaultThrottler = createThrottler();
  return defaultThrottler;
}

export default { createThrottler, getThrottler };
