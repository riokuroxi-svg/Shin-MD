import { test } from "node:test";
import assert from "node:assert/strict";

import { createEngine } from "#engine";
import { createThrottler } from "#throttler";
import { createHealthMonitor } from "#health";
import createSendQueue from "#queue";
import { TtlCache } from "#cache";

test("engine lifecycle transitions in order", () => {
  const engine = createEngine();
  assert.equal(engine.getStateName(), "INIT");
  engine.transit(engine.LIFECYCLE.READY);
  assert.equal(engine.getStateName(), "READY");
  engine.transit(engine.LIFECYCLE.RUNNING);
  assert.equal(engine.getStateName(), "RUNNING");
  assert.ok(engine.getUptime() >= 0);
  assert.equal(typeof engine.on, "function");
  assert.equal(typeof engine.emit, "function");
});

test("engine emit/on/once work", () => {
  const engine = createEngine();
  let calls = 0;
  const off = engine.on("connected", () => calls++);
  engine.emit("connected", {});
  engine.emit("connected", {});
  assert.equal(calls, 2);
  off();
  engine.emit("connected", {});
  assert.equal(calls, 2);
});

test("throttler delay respects min/max bounds", () => {
  const t = createThrottler({ baseDelayMs: 1000, warmUpStartMsgsPerDay: 1000 });
  for (let i = 0; i < 50; i++) {
    const d = t.calcDelay({});
    assert.ok(d >= 400, "delay below min");
    assert.ok(d <= 5000, "delay above max");
  }
});

test("throttler new-contact penalty increases delay", () => {
  const t = createThrottler({ baseDelayMs: 1000 });
  let base = 0, penalized = 0;
  for (let i = 0; i < 30; i++) base += t.calcDelay({});
  for (let i = 0; i < 30; i++) penalized += t.calcDelay({ isNewContact: true });
  assert.ok(penalized > base, "penalty did not increase delay");
});

test("throttler warm-up limit blocks sends", () => {
  const t = createThrottler({ warmUpStartMsgsPerDay: 2, warmUpMaxMsgsPerDay: 2 });
  t.recordSent(); t.recordSent();
  assert.equal(t.canSend(), false);
  const s = t.getStats();
  assert.ok(s.msgsToday >= 2);
});

test("health risk score rises with errors", () => {
  const h = createHealthMonitor();
  for (let i = 0; i < 5; i++) {
    h.recordError(new Error("err" + i));
    h.recordDisconnect();
  }
  const status = h.getStatus();
  assert.ok(status.score >= 20, "score too low: " + status.score);
  assert.ok(status.level === "elevated" || status.level === "warning", "bad level");
});

test("health safe with clean traffic", () => {
  const h = createHealthMonitor();
  for (let i = 0; i < 100; i++) h.recordSend();
  assert.equal(h.getStatus().score, 0);
});

test("queue serializes sends in order", async () => {
  const t = createThrottler({ baseDelayMs: 5, warmUpStartMsgsPerDay: 10000 });
  const h = createHealthMonitor();
  const q = createSendQueue(t, h);
  const order = [];
  await Promise.all([1, 2, 3].map(n =>
    q.enqueue(async () => { order.push(n); return n; }, { messageLength: 5 })
  ));
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(q.length(), 0);
});

test("queue pauses and resumes", async () => {
  const t = createThrottler({ baseDelayMs: 5, warmUpStartMsgsPerDay: 10000 });
  const q = createSendQueue(t, null);
  q.pause();
  assert.equal(q.isPaused(), true);
  q.resume();
  assert.equal(q.isPaused(), false);
  const r = await q.enqueue(async () => 42, { messageLength: 0 });
  assert.equal(r, 42);
});

test("cache set/get/delete/ttl", async () => {
  const c = new TtlCache(50);
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
  assert.equal(c.delete("a"), true);
  assert.equal(c.get("a"), undefined);
  c.set("b", 2);
  await new Promise(r => setTimeout(r, 80));
  assert.equal(c.get("b"), undefined);
});
