import log from "#logger";

function gaussianRandom(mean, stddev) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const DEFAULTS = {
  baseDelayMs: 1200,
  jitterStddev: 0.25,
  minDelayMs: 400,
  maxDelayMs: 5000,
  msPerChar: 25,
  newContactPenalty: 1.5,
  warmUpDays: 7,
  warmUpStartMsgsPerDay: 20,
  warmUpMaxMsgsPerDay: 500,
};

export function createThrottler(opts) {
  opts = opts || {};
  const config = {};
  for (const k of Object.keys(DEFAULTS)) {
    config[k] = opts[k] !== undefined ? opts[k] : DEFAULTS[k];
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
    const start = new Date(state.warmUpStartDate).getTime();
    const now = Date.now();
    const day = Math.max(0, Math.min(config.warmUpDays, Math.floor((now - start) / 86400000)));
    const progress = day / config.warmUpDays;
    const range = config.warmUpMaxMsgsPerDay - config.warmUpStartMsgsPerDay;
    return Math.round(config.warmUpStartMsgsPerDay + range * progress);
  }

  function calcDelay(extra) {
    extra = extra || {};
    checkReset();

    if (extra.isPriority) return config.minDelayMs;

    let delay = config.baseDelayMs + gaussianRandom(0, config.baseDelayMs * config.jitterStddev);

    if (extra.messageLength > 10) {
      delay += Math.min(extra.messageLength * config.msPerChar, 2000);
    }

    if (extra.isNewContact) {
      delay *= config.newContactPenalty;
    }

    return Math.round(Math.max(config.minDelayMs, Math.min(config.maxDelayMs, delay)));
  }

  function canSend() {
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
      warmUpComplete: state.warmUpMsgsToday >= getDailyLimit(),
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
