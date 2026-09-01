// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque: monta engine + socket + web
//  Uso: node index.js [--qr | --code]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import chalk from "chalk";
import cfonts from "cfonts";
import moment from "moment-timezone";
import { createEngine } from "#engine";
import { connectSocket } from "#socket";
import { createWatchdog } from "#watchdog";
import { createWebServer } from "#server";
import { getDatabase } from "#db";
import { createRouter } from "#router";
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
  if (!args.qr && !args.code && process.env.PAIRING_METHOD === "code") args.code = true;
  if (!args.pairingNumber && process.env.PAIRING_NUMBER) args.pairingNumber = process.env.PAIRING_NUMBER;
  return args;
}

function printBanner() {
  console.log("");
  cfonts.say("SHIN-MD", {
    font: "block",
    align: "center",
    gradient: ["#ff7eb3", "#f97316"],
    letterSpacing: 1,
    space: false,
  });
  cfonts.say("Bot WhatsApp Multi-Device", {
    font: "chrome",
    align: "center",
    gradient: ["blue", "magenta"],
    letterSpacing: 2,
  });
  console.log(chalk.cyan("      🍁 Hecho por riokuroxi-svg · Anti-ban nativo") + "\n" + chalk.gray("         ─────────────────────────────────") + "\n");
}

function logCommand(ctx, cmdName, ms) {
  const pushname = ctx.pushname || "Usuario";
  const sender = ctx.senderId || ctx.sender || "?";
  const isGroup = ctx.isGroup;
  const chatId = ctx.chatId || "?";
  const groupName = ctx.groupName || "";
  const botJid = process.env.BOT_JID || "Shin-MD";
  const time = moment().tz("America/Mexico_City").format("DD/MM/YY HH:mm:ss");

  let output = `╭─────────────────────────────────────────···\n`;
  output += `│ ${chalk.cyan("Bot")}: ${chalk.greenBright(botJid)}\n`;
  output += `│ ${chalk.bold.yellow("Fecha")}: ${chalk.yellowBright(time)}\n`;
  output += `│ ${chalk.bold.blueBright("Usuario")}: ${chalk.blueBright(pushname)}\n`;
  output += `│ ${chalk.bold.magentaBright("Remitente")}: ${chalk.magentaBright(sender)}\n`;
  if (isGroup) {
    output += `│ ${chalk.bold.green("Grupo")}: ${chalk.greenBright(groupName)}\n`;
    output += `│ ${chalk.bold.magenta("ID")}: ${chalk.blueBright(chatId)}\n`;
  } else {
    output += `│ ${chalk.bold.green("Privado")}: ${chalk.magentaBright("Chat Privado")}\n`;
    output += `│ ${chalk.bold.magenta("ID")}: ${chalk.blueBright("Chat Privado")}\n`;
  }
  output += `│ ${chalk.bold.cyanBright("Comando usado")}: ${chalk.gray(cmdName)} (${ms}ms)\n`;
  output += `╰─────────────────────────────────────────···`;
  console.log(output);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Banner estilo Ginko-MD con cfonts
  printBanner();

  log.info("╔═══════════════════════════════════════╗");
  log.info("║      Shin-MD · WhatsApp Multi-Device  ║");
  log.info("║      Anti-ban native · AGPL-3.0       ║");
  log.info("╚═══════════════════════════════════════╝");

  let db;
  try {
    db = getDatabase();
  } catch (err) {
    log.error("DB init failed: " + (err.message || err));
    process.exit(1);
  }

  const engine = createEngine();

  const watchdog = createWatchdog(engine, { intervalMs: 10000, stuckThresholdMs: 300000 });
  watchdog.start();

  const web = createWebServer(engine, { port: parseInt(process.env.PORT || "3000", 10) });

  const ownerFromEnv = process.env.OWNER_NUMBER
    ? process.env.OWNER_NUMBER.replace(/\D/g, "") + "@s.whatsapp.net" : "";
  if (ownerFromEnv) {
    db.settings.set("owner_jid", ownerFromEnv);
    engine.setOwnerJid(ownerFromEnv);
  }

  engine.on("connected", user => {
    const u = user && user.id ? user.id.split(":")[0] : "?";
    const ownerJid = u + "@s.whatsapp.net";
    process.env.BOT_JID = u + "@s.whatsapp.net";
    db.settings.set("owner_jid", ownerJid);
    engine.setOwnerJid(ownerJid);
    log.gray("Owner: " + ownerJid);
  });

  // Router con hook de logging de comandos
  const router = createRouter(engine, { onCommand: logCommand });
  await router.init();

  const sockModule = connectSocket(engine, {
    sessionDir: "./Sessions/Owner",
    pairingMethod: args.code ? "code" : "qr",
    pairingNumber: args.pairingNumber,
    onMessage: (sock, msg) => router.handle(sock, msg),
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