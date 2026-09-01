// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque: monta engine + socket + web
//  Uso: node index.js [--qr | --code]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import chalk from "chalk";
import cfonts from "cfonts";
import moment from "moment-timezone";
import readline from "readline";
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

async function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => { rl.question(query, a => { rl.close(); r(a.trim()); }); });
}

async function showMenu() {
  console.log("");
  console.log(chalk.yellow("  ╔═══════════════════════════════╗"));
  console.log(chalk.yellow("  ║") + chalk.cyan("     📲  CONEXIÓN  📲        ") + chalk.yellow("║"));
  console.log(chalk.yellow("  ╚═══════════════════════════════╝"));
  console.log("");
  console.log(chalk.white("     [1]") + chalk.cyan(" QR Code"));
  console.log(chalk.white("     [2]") + chalk.cyan(" Pairing Code"));
  console.log("");

  let opt = "";
  while (opt !== "1" && opt !== "2") {
    opt = await ask(chalk.yellow("     ❯ Opción: "));
    if (opt !== "1" && opt !== "2") console.log(chalk.red("     ✗ 1 o 2 solamente"));
  }

  if (opt === "1") {
    console.log(chalk.green("\n     ✓ QR seleccionado\n"));
    return { method: "qr", phone: "" };
  }

  console.log("");
  console.log(chalk.cyan("     📱 Ingresa tu número (con código de país)"));
  console.log(chalk.gray("     Ej: 521234567890"));
  let phone = "";
  while (!/^\d{7,15}$/.test(phone)) {
    phone = (await ask(chalk.yellow("     ❯ Número: "))).replace(/\D/g, "");
    if (!/^\d{7,15}$/.test(phone)) console.log(chalk.red("     ✗ Inválido"));
  }
  console.log(chalk.green(`\n     ✓ Generando código para +${phone}...\n`));
  return { method: "code", phone };
}

function parseArgs(argv) {
  const r = { qr: false, code: false, phone: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--qr") r.qr = true;
    if (argv[i] === "--code") r.code = true;
    if (argv[i] === "--code" && argv[i+1] && /^\+?\d{7,15}$/.test(argv[i+1])) {
      r.phone = argv[++i].replace(/\D/g, "");
    }
  }
  if (!r.qr && !r.code && process.env.PAIRING_METHOD === "code") r.code = true;
  if (!r.phone && process.env.PAIRING_NUMBER) r.phone = process.env.PAIRING_NUMBER.replace(/\D/g, "");
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  printBanner();

  const sessionDir = "./Sessions/Owner";
  let sessionExists = false;
  try {
    const authDb = path.join(sessionDir, "auth.db");
    if (fs.existsSync(authDb)) {
      const { state } = await useSQLiteAuthState(sessionDir);
      sessionExists = state.creds?.registered === true;
    }
  } catch {}

  let method = "qr", phone = "";
  if (args.qr) { method = "qr"; }
  else if (args.code) { method = "code"; phone = args.phone; }
  else if (!sessionExists) {
    const m = await showMenu();
    method = m.method;
    phone = m.phone;
  }

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
    sessionDir, pairingMethod: method, pairingNumber: phone,
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
  if (down) return;
  down = true;
  log.warn("Apagando...");
  try { await engine.shutdown(); } catch {}
  try { db.close(); } catch {}
  process.exit(0);
}

main().catch(e => { log.fatal(e.message, e); process.exit(1); });