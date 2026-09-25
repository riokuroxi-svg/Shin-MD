/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  server.js — Panel HTTP local: health, metrics, uptime
//  Solamente escucha en 127.0.0.1 salvo que se configure LOOPBACK=0
// ═══════════════════════════════════════════════════════════════════

import express from "express";
import os from "os";
import crypto from "node:crypto";
import log from "#logger";

export function createWebServer(engine, opts) {
  opts = opts || {};
  const port = opts.port !== undefined
    ? opts.port
    : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  let host = opts.host || (process.env.LOOPBACK === "0" ? "0.0.0.0" : "127.0.0.1");

  // B5.2: panel expuesto en red (LOOPBACK=0) ⇒ contraseña obligatoria.
  // Failsafe: sin PANEL_PASSWORD el panel vuelve a loopback aunque pidas
  // exponerlo — antes, LOOPBACK=0 dejaba riesgo/cola/memoria a la vista
  // de cualquiera en tu red. Usuario fijo: "admin".
  const panelPass = process.env.PANEL_PASSWORD || "";
  if (host === "0.0.0.0" && !panelPass) {
    log.warn("Panel: LOOPBACK=0 sin PANEL_PASSWORD — por seguridad solo escuchará en 127.0.0.1");
    host = "127.0.0.1";
  }
  const authEnabled = host === "0.0.0.0" && !!panelPass;

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  if (authEnabled) {
    app.use((req, res, next) => {
      const hdr = req.headers.authorization || "";
      const [scheme, b64] = hdr.split(" ");
      let ok = false;
      if (/^Basic$/i.test(scheme || "") && b64) {
        try {
          const pass = Buffer.from(b64, "base64").toString("utf8").split(":").slice(1).join(":");
          const a = Buffer.from(pass || "");
          const b = Buffer.from(panelPass);
          ok = a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch {}
      }
      if (!ok) {
        res.set("WWW-Authenticate", 'Basic realm="Shin-MD"');
        return res.status(401).json({ ok: false, error: "Requiere PANEL_PASSWORD (usuario: admin)" });
      }
      next();
    });
  }

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
      groups: typeof engine.getGroupCount === "function" ? engine.getGroupCount() : 0,
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
