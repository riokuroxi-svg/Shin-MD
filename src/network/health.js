import log from "#logger";

export function createHealthMonitor() {
  const events = [];
  const MAX_EVENTS = 1000;
  const EVENT_TTL = 3600000;

  function prune() {
    const cutoff = Date.now() - EVENT_TTL;
    while (events.length > 0 && events[0].ts < cutoff) events.shift();
  }

  function record(type, data) {
    prune();
    events.push({ ts: Date.now(), type, data });
    if (events.length > MAX_EVENTS) events.shift();
  }

  function getRiskScore() {
    prune();
    const now = Date.now();
    const hourAgo = now - 3600000;
    const recent = events.filter(e => e.ts > hourAgo);

    const disconnects = recent.filter(e => e.type === "disconnect").length;
    const errors = recent.filter(e => e.type === "error").length;
    const failures = recent.filter(e => e.type === "send_fail").length;
    const totalSends = recent.filter(e => e.type === "send").length;

    let score = 0;

    // Disconnect frequency (max 30 points)
    score += Math.min(30, disconnects * 10);

    // Error rate (max 30 points)
    score += Math.min(30, errors * 5);

    // Send failure rate (max 30 points)
    if (totalSends > 0) {
      const failRate = failures / totalSends;
      score += Math.min(30, failRate * 100 * 0.5);
    }

    // Recent 403 (max 10 points)
    const has403 = recent.some(e => e.type === "error" && e.data && e.data.code === 403);
    if (has403) score += 10;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  function getStatus() {
    const score = getRiskScore();
    let level = "safe";
    if (score >= 80) level = "critical";
    else if (score >= 50) level = "warning";
    else if (score >= 20) level = "elevated";
    return { score, level, events: events.length };
  }

  function recordSend() { record("send"); }
  function recordDisconnect() { record("disconnect"); }
  function recordError(err) { record("error", { code: err?.code, msg: err?.message }); }
  function recordSendFail(err) { record("send_fail", { msg: err?.message }); }

  return {
    recordSend, recordDisconnect, recordError, recordSendFail,
    getRiskScore, getStatus, getEvents: () => [...events],
  };
}

let defaultHealth = null;
export function getHealthMonitor() {
  if (!defaultHealth) defaultHealth = createHealthMonitor();
  return defaultHealth;
}

export default { createHealthMonitor, getHealthMonitor };
