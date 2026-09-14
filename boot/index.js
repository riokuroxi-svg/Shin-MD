/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque estilo Ginko-MD
//  Uso: node index.js [--qr | --code | --menu]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import chalk from "chalk";
import cfonts from "cfonts";
import moment from "moment-timezone";
import readlineSync from "readline-sync";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { createEngine } from "#engine";
import { connectSocket } from "#socket";
import { createWatchdog } from "#watchdog";
import { createWebServer } from "#server";
import { getDatabase } from "#db";
import { createRouter } from "#router";
import log from "#logger";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// ─── Check legal AGPL (Sección 7) ───────────────────────────────
// LICENSE y NOTICE son parte de la licencia. Si esta copia no los
// incluye, es incompleta o modificada sin respetar AGPL: no arranca.
// (Lo que cualquier proyecto AGPL serio exige — no es un virus.)
{
  const __root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
  const __required = [
    { file: "LICENSE", desc: "licencia AGPL-3.0-only" },
    { file: "NOTICE", desc: "atribución y marca Shin-MD" },
  ];
  for (const r of __required) {
    if (!fs.existsSync(path.join(__root, r.file))) {
      console.error(chalk.red("[Shin-MD] ERROR AGPL: falta el archivo " + r.file + " (" + r.desc + ")."));
      console.error(chalk.red("[Shin-MD] Esta copia no respeta la licencia; el bot no arrancará."));
      console.error(chalk.yellow("[Shin-MD] Descarga oficial: https://github.com/riokuroxi-svg/Shin-MD"));
      process.exit(1);
    }
  }
  let __ver = "dev";
  try { __ver = JSON.parse(fs.readFileSync(path.join(__root, "package.json"), "utf8")).version || __ver; } catch {}
  console.log(chalk.magenta("Shin-MD v" + __ver + " - Powered by riokuroxi-svg"));
}

// Red de seguridad de vinculación (companion_reg_refresh):
// el npm install aplica el parche a Baileys (postinstall), pero si el
// update se hizo solo con "git pull", node_modules queda viejo. El script
// es idempotente (solo parchea lo que falta y se auto-verifica), así que
// siempre nos deja en estado conocido. Si falla NO bloqueamos el arranque:
// las sesiones existentes siguen funcionando; solo la vinculación nueva se
// ve afectada y el aviso manda a ejecutar "npm install".
{
  const __rootDir = path.dirname(fileURLToPath(import.meta.url));
  const __patchScript = path.resolve(__rootDir, "..", "scripts", "patch-baileys-pairing.cjs");
  const __baileysSocket = path.resolve(__rootDir, "..", "node_modules", "baileys", "lib", "Socket", "socket.js");
  if (fs.existsSync(__patchScript) && fs.existsSync(__baileysSocket)) {
    const r = spawnSync(process.execPath, [__patchScript], { stdio: "inherit" });
    if (r.status !== 0) {
      console.log(chalk.red("[ ✗ ]  AVISO: no se pudo aplicar el parche de vinculación. Si no puedes vincular un dispositivo nuevo, ejecuta \"npm install\"."));
    }
  }
}

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
  const r = { qr: false, code: false, menu: false, phone: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--qr") r.qr = true;
    if (argv[i] === "--menu") r.menu = true;
    if (argv[i] === "--code") r.code = true;
    if (argv[i] === "--code" && argv[i+1] && /^\+?\d{7,15}$/.test(argv[i+1])) {
      r.phone = normalizePhone(argv[++i]);
    }
  }
  return r;
}

function hasValidSession(sessionDir) {
  const authDb = path.join(sessionDir, "auth.db");
  if (!fs.existsSync(authDb)) return false;
  try {
    const db = new DatabaseSync(authDb);
    const row = db.prepare("SELECT data FROM creds WHERE id = 1").get();
    db.close();
    if (!row) return false;
    const creds = JSON.parse(row.data);
    return creds?.registered === true;
  } catch {
    return false;
  }
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
  const name = ctx.pushName || ctx.pushname || "Usuario";
  const g = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "Chat Privado";
  const boxColor = chalk.hex("#00ff88");
  console.log("");
  console.log(boxColor("  ╭───────────────────────────────────────"));
  console.log(boxColor("  │") + chalk.cyan("  Bot: ") + chalk.greenBright(process.env.BOT_JID || "Shin-MD"));
  console.log(boxColor("  │") + chalk.yellow("  Hora: ") + chalk.yellowBright(t));
  console.log(boxColor("  │") + chalk.blueBright("  Usuario: ") + chalk.white(name));
  console.log(boxColor("  │") + chalk.magenta("  Grupo: ") + chalk.white(g));
  console.log(boxColor("  │") + chalk.cyanBright("  Comando: ") + chalk.white(cmdName) + boxColor(` (${ms}ms)`));
  console.log(boxColor("  ╰───────────────────────────────────────"));
}

// ==================================================================
//  INICIO — TODO SINCRONO hasta el menú (como Ginko-MD)
// ==================================================================

printBanner();

const args = parseArgs(process.argv.slice(2));
const sessionDir = "./Sessions/Owner";
const sessionValida = hasValidSession(sessionDir);
const methodCodeByEnv = (process.env.PAIRING_METHOD || "").trim().toLowerCase() === "code" && process.env.PAIRING_NUMBER;
const envNumber = (process.env.PAIRING_NUMBER || "").trim();

let opcion, phoneNumber = "";

if (args.menu) {
  // Forzar menú aunque haya sesión
  opcion = "";
} else if (args.qr) {
  opcion = "1";
} else if (args.code) {
  opcion = "2";
  phoneNumber = args.phone || normalizePhone(readlineSync.question(
    chalk.bold.redBright("\nPor favor, Ingrese el número de WhatsApp.\n") +
    chalk.bold.yellowBright("Ejemplo: +57301******\n") +
    chalk.bold.magentaBright("---> ")
  ));
} else if (sessionValida) {
  opcion = "0";
  console.log(chalk.gray("[ ✿ ] Sesión existente detectada, cargando...\n"));
} else if (methodCodeByEnv) {
  opcion = "2";
  phoneNumber = normalizePhone(envNumber);
  console.log(chalk.gray(`[ ✿ ] Vinculación por código (número desde .env: ${phoneNumber})\n`));
}

// Menú interactivo si no se decidió antes
if (!opcion) {
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
//  ASÍNCRONO — a partir de aquí
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