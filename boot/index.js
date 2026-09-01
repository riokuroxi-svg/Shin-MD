// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque: monta engine + socket + web
//  Uso: node index.js [--qr | --code]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import { createEngine } from "#engine";
import { connectSocket } from "#socket";
import { createWatchdog } from "#watchdog";
import { createWebServer } from "#server";
import { getDatabase } from "#db";
import log from "#logger";

function parseArgs(argv) {
  const args = { qr: false, code: false, pairingNumber: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--qr") args.qr = true;
    if (a === "--code") args.code = true;
    if (a === "--code" && argv[i + 1] && /^\+?\d{7,15}$/.test(argv[i + 1])) {
      args.pairingNumber = argv[i + 1];
      i++;
    }
  }
  // Fallback a .env
  if (!args.qr && !args.code && process.env.PAIRING_METHOD === "code") args.code = true;
  if (!args.pairingNumber && process.env.PAIRING_NUMBER) args.pairingNumber = process.env.PAIRING_NUMBER;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  log.info("╔═══════════════════════════════════════╗");
  log.info("║      Shin-MD · WhatsApp Multi-Device  ║");
  log.info("║      Anti-ban native · AGPL-3.0       ║");
  log.info("╚═══════════════════════════════════════╝");

  // Base de datos
  let db;
  try {
    db = getDatabase();
  } catch (err) {
    log.error("DB init failed: " + (err.message || err));
    process.exit(1);
  }

  // Engine central
  const engine = createEngine();

  // Watchdog (supervisión)
  const watchdog = createWatchdog(engine, { intervalMs: 10000, stuckThresholdMs: 300000 });
  watchdog.start();

  // Web server (health/metrics)
  const web = createWebServer(engine, { port: parseInt(process.env.PORT || "3000", 10) });

  // Owner desde .env (semilla) o detectado al conectar
  const ownerFromEnv = process.env.OWNER_NUMBER
    ? process.env.OWNER_NUMBER.replace(/\D/g, "") + "@s.whatsapp.net" : "";
  if (ownerFromEnv) db.settings.set("owner_jid", ownerFromEnv);

  engine.on("connected", user => {
    const u = user && user.id ? user.id.split(":")[0] : "?";
    db.settings.set("owner_jid", u + "@s.whatsapp.net");
  });

  // --- Comandos: handler mínimo de mensajes ---
  function handleMessage(sock, msg) {
    return (async () => {
      if (!msg.key) return;
      const chatId = msg.key.remoteJid;
      const senderId = (msg.key.participant || msg.key.remoteJid || "");
      const text = (() => {
        const m = msg.message || {};
        const content = m.extendedTextMessage || m.conversation || m.imageMessage || m.videoMessage;
        const t = (content && (content.text || content.caption)) || m.conversation || "";
        return String(t).trim();
      })();

      if (!chatId || !text) return;

      // Solo owner por ahora
      const ownerJid = db.settings.get("owner_jid");
      if (ownerJid && senderId.split(":")[0] + "@s.whatsapp.net" !== ownerJid) return;

      if (text.toLowerCase() === "ping") {
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(chatId, { text: "🏓 pong" }),
          { messageLength: text.length }
        );
      }
    })().catch(err => log.error("handleMessage: " + (err.message || err)));
  }

  // Conectar socket
  const sockModule = connectSocket(engine, {
    sessionDir: "./Sessions/Owner",
    pairingMethod: args.code ? "code" : "qr",
    pairingNumber: args.pairingNumber,
    onMessage: handleMessage,
    onReady: sock => log.success("Bot listo ✓"),
    watchdog,
  });

  process.on("SIGINT", () => shutdown(engine, web, db));
  process.on("SIGTERM", () => shutdown(engine, web, db));

  await sockModule.start();
}

let shuttingDown = false;
async function shutdown(engine, web, db) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn("Signal received, shutting down...");
  try { await engine.shutdown(); } catch {}
  try { web.close(); } catch {}
  try { db.close(); } catch {}
  process.exit(0);
}

main().catch(err => {
  log.error("Fatal boot: " + (err.message || err), err);
  process.exit(1);
});
