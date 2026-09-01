// ═══════════════════════════════════════════════════════════════════
//  Shin-MD — Entry Point
//  Carga .env, settings, inicializa DB, comandos y conexión.
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import "./settings.js";
import { smsg } from "#serialize";
import { createConnectionManager } from "#core/connection";
import cmdsLoader from "#system/cmdsLoader";
import events from "#events";
import { startServer } from "../server.js";
import log from "#lib/logger";
import fs from "fs";
import chalk from "chalk";
import cfonts from "cfonts";

// ── Verificar Node ────────────────────────────────────────────────
const [maj, min] = process.versions.node.split(".").map(Number);
const needsSqlite = maj > 22 || (maj === 22 && min >= 5);
if (!needsSqlite) {
  console.log(chalk.yellow("[ ! ] Se recomienda Node >= 22.5.0 (tienes " + process.versions.node + ")"));
}

// ── Banner ────────────────────────────────────────────────────────
function showBanner() {
  console.log("");
  cfonts.say("SHIN-MD", {
    font: "block", align: "center",
    gradient: ["#ff7eb3", "#f97316"],
    letterSpacing: 1, space: false,
  });
  cfonts.say("反魂  —  Bot Superior", {
    font: "chrome", align: "center",
    gradient: ["blue", "magenta"],
    letterSpacing: 2,
  });
  console.log(chalk.cyan("  Hecho por riokuroxi-svg") + "\n");
}

// ── Bootstrap principal ───────────────────────────────────────────
async function bootstrap() {
  showBanner();

  // Servidor HTTP
  startServer();
  log.gray("Servidor HTTP iniciado");

  // Temporales
  if (!fs.existsSync("./tmp")) fs.mkdirSync("./tmp", { recursive: true });

  // Base de datos
  const db = await import("#system/database");
  db.initDB();
  db.clearDB();
  global.db = db;
  log.gray("Base de datos lista");

  // Cargar comandos
  await cmdsLoader();

  // Determinar método de conexión
  const sessionDir = "./Sessions/Owner";
  const hasSession = fs.existsSync(sessionDir + "/auth.db") || fs.existsSync(sessionDir + "/creds.json");
  const envMethod = (process.env.PAIRING_METHOD || "").toLowerCase().trim();
  const envNum = (process.env.PAIRING_NUMBER || "").trim();

  let method = "";
  let phone = "";

  if (hasSession) {
    method = "existing";
  } else if (process.argv.includes("--code") || (envMethod === "code" && envNum)) {
    method = "code";
    phone = envNum;
  } else if (process.argv.includes("--qr")) {
    method = "qr";
  } else if (process.stdin.isTTY) {
    method = "qr";
  } else {
    log.warn("Sin sesion ni TTY. Usa --qr o --code");
    method = "qr";
  }

  // Handler de mensajes
  const handleMessage = async (sock, msg) => {
    try {
      const m = await smsg(sock, msg);
      const { default: mainRouter } = await import("#src/main");
      if (typeof mainRouter === "function") {
        await mainRouter(sock, m, []).catch(e => log.error("Router: " + (e.message || e)));
      }
    } catch (err) {
      log.error("handleMessage: " + (err.message || err));
    }
  };

  // Crear y arrancar conexión
  const mgr = createConnectionManager({
    sessionDir,
    pairingNumber: phone,
    pairingMethod: method === "code" ? "code" : "",
    onReady: (s) => { global.sock = s; log.success("Shin-MD listo"); },
    onMessage: handleMessage,
  });

  global.sock = await mgr.start();

  // Eventos globales
  try { await events(global.sock); } catch (e) { log.gray("events: " + e); }

  log.success("Shin-MD iniciado correctamente");
}

// ── Ejecutar ──────────────────────────────────────────────────────
bootstrap().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});

// ── Manejadores de errores globales ───────────────────────────────
process.on("uncaughtException", (e) => {
  log.error("ERROR: " + (e.stack || e.message || e));
});
process.on("unhandledRejection", (r) => {
  if (r instanceof SyntaxError) { process.nextTick(() => { throw r; }); return; }
  log.error("REJECTION: " + (r.stack || r.message || r));
});