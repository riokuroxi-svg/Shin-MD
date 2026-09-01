// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque estilo Ginko-MD
//  Uso: node index.js [--qr | --code]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import chalk from "chalk";
import cfonts from "cfonts";
import moment from "moment-timezone";
import readlineSync from "readline-sync";
import fs from "fs";
import path from "path";
import { createEngine } from "#engine";
import { connectSocket } from "#socket";
import { createWatchdog } from "#watchdog";
import { createWebServer } from "#server";
import { getDatabase } from "#db";
import { createRouter } from "#router";
import { useSQLiteAuthState } from "#auth";
import log from "#logger";

// ─── Helpers ────────────────────────────────────────────────────
function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

function parseArgs(argv) {
  const r = { qr: false, code: false, phone: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--qr") r.qr = true;
    if (argv[i] === "--code") r.code = true;
    if (argv[i] === "--code" && argv[i+1] && /^\+?\d{7,15}$/.test(argv[i+1])) {
      r.phone = normalizePhone(argv[++i]);
    }
  }
  return r;
}

function printBanner() {
  cfonts.say("SHIN-MD", {
    font: "block", align: "center",
    gradient: ["#ff7eb3", "#f97316"],
    letterSpacing: 1, space: false,
  });
  cfonts.say("Bot WhatsApp Multi-Device", {
    font: "chrome", align: "center",
    gradient: ["blue", "magenta"], letterSpacing: 2,
  });
  console.log(chalk.cyan("      🍁 Hecho por riokuroxi-svg · Anti-ban nativo") + "\n");
}

function logCommand(ctx, cmdName, ms) {
  const t = moment().tz("America/Mexico_City").format("DD/MM/YY HH:mm:ss");
  const name = ctx.pushname || "Usuario";
  const s = ctx.senderId || ctx.sender || "?";
  const g = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "Chat Privado";
  console.log("");
  console.log(chalk.gray("  ╭───────────────────────────────────────"));
  console.log(chalk.gray("  │") + chalk.cyan("  Bot: ") + chalk.greenBright(process.env.BOT_JID || "Shin-MD"));
  console.log(chalk.gray("  │") + chalk.yellow("  Hora: ") + chalk.yellowBright(t));
  console.log(chalk.gray("  │") + chalk.blueBright("  Usuario: ") + chalk.white(name));
  console.log(chalk.gray("  │") + chalk.magenta("  Grupo: ") + chalk.white(g));
  console.log(chalk.gray("  │") + chalk.cyanBright("  Comando: ") + chalk.gray(cmdName) + chalk.gray(` (${ms}ms)`));
  console.log(chalk.gray("  ╰───────────────────────────────────────"));
}

// ==================================================================
//  INICIO — SINCRONO hasta el menú, como Ginko-MD
// ==================================================================

printBanner();

const args = parseArgs(process.argv.slice(2));
const methodCodeByEnv = (process.env.PAIRING_METHOD || "").trim().toLowerCase() === "code" && process.env.PAIRING_NUMBER;
const envNumber = (process.env.PAIRING_NUMBER || "").trim();
const sessionDir = "./Sessions/Owner";
const hasSessionFile = fs.existsSync(path.join(sessionDir, "auth.db"));

let opcion, phoneNumber = "";

if (hasSessionFile) {
  opcion = "0";
  console.log(chalk.gray("[ ✿ ] Sesión existente detectada, cargando..."));
} else if (methodCodeByEnv) {
  opcion = "2";
  phoneNumber = normalizePhone(envNumber);
  console.log(chalk.gray(`[ ✿ ] Vinculación por código (número desde .env: ${phoneNumber || '?'} )`));
} else if (args.qr) {
  opcion = "1";
} else if (args.code) {
  opcion = "2";
  phoneNumber = args.phone || normalizePhone(readlineSync.question(chalk.bold.redBright("\nPor favor, Ingrese el número de WhatsApp.\n" + chalk.bold.yellowBright("Ejemplo: +57301******\n") + chalk.bold.magentaBright("---> "))));
} else {
  const isInteractive = process.stdin.isTTY !== false;
  if (!isInteractive) {
    log.warn("No hay consola interactiva. Usa --qr, --code o configura .env");
    opcion = "1";
  } else {
    console.log(chalk.yellow("\n  ╔═══════════════════════════════╗"));
    console.log(chalk.yellow("  ║") + chalk.cyan("     📲  CONEXIÓN  📲        ") + chalk.yellow("║"));
    console.log(chalk.yellow("  ╚═══════════════════════════════╝\n"));
    console.log(chalk.white("     [1]") + chalk.cyan(" QR Code"));
    console.log(chalk.white("     [2]") + chalk.cyan(" Pairing Code\n"));

    opcion = readlineSync.question(chalk.yellow("     ❯ Opción: "));
    while (!/^[1-2]$/.test(opcion)) {
      console.log(chalk.bold.redBright("     ✗ Solo 1 o 2"));
      opcion = readlineSync.question(chalk.yellow("     ❯ Opción: "));
    }

    if (opcion === "2") {
      console.log(chalk.bold.redBright("\nPor favor, Ingrese el número de WhatsApp."));
      console.log(chalk.bold.yellowBright("Ejemplo: 521234567890\n"));
      phoneNumber = normalizePhone(readlineSync.question(chalk.magenta("---> ")));
    }
  }
}

// ==================================================================
//  ASÍNCRONO — a partir de aquí todo async
// ==================================================================

async function main() {
  let db;
  try { db = getDatabase(); }
  catch (err) { log.fatal("DB: " + err.message); process.exit(1); }

  const engine = createEngine();
  const watchdog = createWatchdog(engine, { intervalMs: 10000, stuckThresholdMs: 300000 });
  watchdog.start();
  createWebServer(engine, { port: parseInt(process.env.PORT || "3000", 10) });

  const ownerEnv = process.env.OWNER_NUMBER?.replace(/\D/g, "") + "@s.whatsapp.net";
  if (ownerEnv) { db.settings.set("owner_jid", ownerEnv); engine.setOwnerJid(ownerEnv); }

  engine.on("connected", user => {
    const u = user?.id?.split(":")[0] || "?";
    const jid = u + "@s.whatsapp.net";
    process.env.BOT_JID = jid;
    db.settings.set("owner_jid", jid);
    engine.setOwnerJid(jid);
  });

  const router = createRouter(engine, { onCommand: logCommand });
  await router.init();

  const sockModule = connectSocket(engine, {
    sessionDir,
    pairingMethod: opcion === "2" ? "code" : "qr",
    pairingNumber: phoneNumber,
    onMessage: (s, m) => router.handle(s, m),
    onReady: s => log.success("Bot listo ✓"),
    watchdog,
  });

  process.on("SIGINT", () => shutdown(engine, db));
  process.on("SIGTERM", () => shutdown(engine, db));
  await sockModule.start();
}

let down = false;
async function shutdown(engine, db) {
  if (down) return; down = true;
  log.warn("Apagando...");
  try { await engine.shutdown(); } catch {}
  try { db.close(); } catch {}
  process.exit(0);
}

main().catch(e => { log.fatal(e.message, e); process.exit(1); });