import { test } from "node:test";
import assert from "node:assert/strict";
import createWebServer from "#server";

function mockEngine() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getStatus: () => ({ score: 3, level: "safe", events: 2 }) }),
    getSendQueue: () => ({ length: () => 1, isPaused: () => false }),
    bootTime: Date.now() - 60000,
  };
}

test("web server serves root, health and metrics", async () => {
  const web = createWebServer(mockEngine(), { port: 0, host: "127.0.0.1" });
  await new Promise(r => web.server.once("listening", r));
  const port = web.server.address().port;
  const base = "http://127.0.0.1:" + port;

  const root = await (await fetch(base + "/")).json();
  assert.equal(root.ok, true);
  assert.equal(root.name, "Shin-MD");
  assert.equal(root.engine, "RUNNING");

  const health = await (await fetch(base + "/health")).json();
  assert.equal(health.ok, true);
  assert.equal(health.state, "RUNNING");
  assert.ok(health.risk.score >= 0);
  assert.equal(health.queue, 1);

  const metrics = await (await fetch(base + "/metrics")).json();
  assert.equal(metrics.ok, true);
  assert.equal(metrics.engine.state, "RUNNING");
  assert.ok(metrics.memory.rssMB > 0);
  assert.ok(metrics.process.node.startsWith("v"));

  web.close();
});
