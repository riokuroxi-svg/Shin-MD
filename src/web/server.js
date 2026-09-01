// ═══════════════════════════════════════════════════════════════════
//  server.js — Panel HTTP local: health, metrics, uptime
//  Solamente escucha en 127.0.0.1 salvo que se configure LOOPBACK=0
// ═══════════════════════════════════════════════════════════════════

import express from "express";
import os from "os";
import log from "#logger";

export function createWebServer(engine, opts) {
  opts = opts || {};
  const port = opts.port !== undefined
    ? opts.port
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  const host = opts.host || (process.env.LOOPBACK === "0" ? "0.0.0.0" : "127.0.0.1");

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  function json(ok, data, code) {
    return res => res.status(code || 200).json({ ok, ...data });
  }

  app.get("/", (req, res) => {
    res.json({
      ok: true,
      name: "Shin-MD",
      version: "0.1.0",
      engine: engine.getStateName(),
      ts: Date.now(),
    });
  });

  app.get("/health", (req, res) => {
    const h = engine.getHealth().getStatus();
    const q = engine.getSendQueue();
    res.json({
      ok: true,
      state: engine.getStateName(),
      uptimeSec: Math.round(engine.getUptime() / 1000),
      risk: h,
      queue: q ? q.length() : -1,
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    });
  });

  app.get("/metrics", (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      process: {
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        platform: process.platform,
      },
      memory: {
        rssMB: +(mem.rss / 1048576).toFixed(1),
        heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
        heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
      },
      os: {
        type: os.type(),
        release: os.release(),
        loadAvg: os.loadavg(),
        cpus: os.cpus().length,
      },
      engine: {
        state: engine.getStateName(),
        bootTime: engine.bootTime,
        health: engine.getHealth().getStatus(),
      },
    });
  });

  const server = app.listen(port, host, () => {
    const bound = server.address();
    const shownPort = bound && typeof bound === "object" ? bound.port : port;
    log.info("Web server on http://" + host + ":" + shownPort);
  });

  server.on("error", err => {
    log.error("Web server: " + (err.message || err));
  });

  function close() {
    try { server.close(); } catch {}
    log.gray("Web server closed");
  }

  return { app, server, close, port, host };
}

export default createWebServer;
