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
import { DatabaseSync } from "../src/storage/sqlite-compat.js";
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
      log.error(chalk.red("[Shin-MD] ERROR AGPL: falta el archivo " + r.file + " (" + r.desc + ")."));
      log.error(chalk.red("[Shin-MD] Esta copia no respeta la licencia; el bot no arrancará."));
      log.error(chalk.yellow("[Shin-MD] Descarga oficial: https://github.com/riokuroxi-svg/Shin-MD"));
      process.exit(1);
    }
  }
  let __ver = "dev";
  try { __ver = JSON.parse(fs.readFileSync(path.join(__root, "package.json"), "utf8")).version || __ver; } catch {}
  log.ui(chalk.magenta("Shin-MD v" + __ver + " - Powered by riokuroxi-svg"));
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
      log.ui(chalk.red("[ ✗ ]  AVISO: no se pudo aplicar el parche de vinculación. Si no puedes vincular un dispositivo nuevo, ejecuta \"npm install\"."));
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
  log.ui(chalk.cyan("      🍁 Hecho por riokuroxi-svg · Anti-ban nativo") + "\n");
}

function logIncomingMessage(ctx, usedPrefix) {
  const t = moment().tz("America/Mexico_City").format("DD/MM/YY HH:mm:ss");
  const name = ctx.pushName || "Usuario";
  const g = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "Chat Privado";
  const isCmd = !!usedPrefix;
  const boxColor = isCmd ? chalk.hex("#00ff88") : chalk.hex("#38bdf8");
  log.ui("");
  log.ui(boxColor("  ╭───────────────────────────────────────"));
  log.ui(boxColor("  │") + chalk.cyan("  Bot: ") + chalk.greenBright(process.env.BOT_JID || "Shin-MD"));
  log.ui(boxColor("  │") + chalk.yellow("  Hora: ") + chalk.yellowBright(t));
  log.ui(boxColor("  │") + chalk.blueBright("  Usuario: ") + chalk.white(name));
  log.ui(boxColor("  │") + chalk.magenta("  Remitente: ") + chalk.magentaBright(ctx.senderId || ctx.chatId));
  log.ui(boxColor("  │") + chalk.green("  " + (ctx.isGroup ? "Grupo" : "Privado") + ": ") + chalk.white(g));
  log.ui(boxColor("  │") + chalk.cyanBright("  " + (isCmd ? "Comando" : "Mensaje") + ": ") + chalk.white(ctx.text.slice(0, 70)));
  log.ui(boxColor("  ╰───────────────────────────────────────"));
}

function logCommand(ctx, cmdName, ms) {
  const t = moment().tz("America/Mexico_City").format("DD/MM/YY HH:mm:ss");
  const name = ctx.pushName || ctx.pushname || "Usuario";
  const g = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "Chat Privado";
  const boxColor = chalk.hex("#00ff88");
  log.ui("");
  log.ui(boxColor("  ╭───────────────────────────────────────"));
  log.ui(boxColor("  │") + chalk.cyan("  Bot: ") + chalk.greenBright(process.env.BOT_JID || "Shin-MD"));
  log.ui(boxColor("  │") + chalk.yellow("  Hora: ") + chalk.yellowBright(t));
  log.ui(boxColor("  │") + chalk.blueBright("  Usuario: ") + chalk.white(name));
  log.ui(boxColor("  │") + chalk.magenta("  Grupo: ") + chalk.white(g));
  log.ui(boxColor("  │") + chalk.cyanBright("  Comando: ") + chalk.white(cmdName) + boxColor(` (${ms}ms)`));
  log.ui(boxColor("  ╰───────────────────────────────────────"));
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
  // Prioridad: número por CLI > PAIRING_NUMBER de .env > preguntar.
  // (Antes: siempre preguntaba con readline-sync y crasheaba en hosts
  //  sin terminal interactiva — BoxMine, Docker, paneles, etc.)
  phoneNumber = args.phone || normalizePhone(envNumber);
  if (!phoneNumber) {
    if (!process.stdin.isTTY) {
      log.error(chalk.red("[Shin-MD] --code sin número y sin consola interactiva."));
      log.error(chalk.yellow("[Shin-MD] Usa: node index.js --code +521XXXXXXXXXX"));
      log.error(chalk.yellow("[Shin-MD] o define PAIRING_NUMBER en tu archivo .env"));
      process.exit(1);
    }
    phoneNumber = normalizePhone(readlineSync.question(
      chalk.bold.redBright("\nPor favor, Ingrese el número de WhatsApp.\n") +
      chalk.bold.yellowBright("Ejemplo: +57301******\n") +
      chalk.bold.magentaBright("---> ")
    ));
  } else {
    log.ui(chalk.gray(`[ ✿ ] Vinculación por código (número: ${phoneNumber})\n`));
  }
} else if (sessionValida) {
  opcion = "0";
  log.ui(chalk.gray("[ ✿ ] Sesión existente detectada, cargando...\n"));
} else if (methodCodeByEnv) {
  opcion = "2";
  phoneNumber = normalizePhone(envNumber);
  log.ui(chalk.gray(`[ ✿ ] Vinculación por código (número desde .env: ${phoneNumber})\n`));
}

// Menú interactivo si no se decidió antes
if (!opcion) {
  const isInteractive = !!process.stdin.isTTY;
  if (!isInteractive) {
    log.warn("No hay consola interactiva. Usa --qr, --code o configura .env");
    opcion = "1";
  } else {
    log.ui(chalk.yellow("\n  ╔═══════════════════════════════╗"));
    log.ui(chalk.yellow("  ║") + chalk.cyan("     📲  CONEXIÓN  📲        ") + chalk.yellow("║"));
    log.ui(chalk.yellow("  ╚═══════════════════════════════╝\n"));
    log.ui(chalk.white("     [1]") + chalk.cyan(" QR Code"));
    log.ui(chalk.white("     [2]") + chalk.cyan(" Pairing Code\n"));

    opcion = readlineSync.question(chalk.yellow("     ❯ Opción: "));
    while (!/^[1-2]$/.test(opcion)) {
      log.ui(chalk.bold.redBright("     ✗ Solo 1 o 2"));
      opcion = readlineSync.question(chalk.yellow("     ❯ Opción: "));
    }

    if (opcion === "2") {
      log.ui(chalk.bold.redBright("\nPor favor, Ingrese el número de WhatsApp."));
      log.ui(chalk.bold.yellowBright("Ejemplo: 521234567890\n"));
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

  // ── B2.1: perfil del número (nuevo vs aclimatado) ──────────────
  // Número nuevo:    delay base 1500ms + warm-up de 7 días (20→500 msg/día)
  // Número aclimatado: delay base 700ms + warm-up de 2 días
  // Detección auto: antigüedad de la primera fecha de warm-up guardada
  // en settings (>= 7 días → aclimatado). NUMBER_PROFILE=nuevo|veterano
  // fuerza el perfil. La fecha se persiste: antes el warm-up se reiniciaba
  // en cada arranque y un número viejo NUNCA se sentía ágil.
  const today = new Date().toISOString().slice(0, 10);
  // B2.2: en hostings donde la base de datos NO persiste (redeploy sin volumen,
  // reinstalar Termux, borrar la carpeta de datos), esta fecha volvía a "hoy"
  // en cada arranque y el bot quedaba atrapado para siempre en el día 0 del
  // warm-up = 20 mensajes al día. WARMUP_START_DATE permite fijarla en el .env.
  const envWarmupStart = (process.env.WARMUP_START_DATE || "").trim();
  let warmupStart = /^\d{4}-\d{2}-\d{2}$/.test(envWarmupStart)
    ? envWarmupStart
    : db.settings.get("warmup_start_date");
  if (envWarmupStart && !/^\d{4}-\d{2}-\d{2}$/.test(envWarmupStart)) {
    log.warn("WARMUP_START_DATE ignorada: formato inválido (se espera AAAA-MM-DD)");
  }
  if (!warmupStart) {
    db.settings.set("warmup_start_date", today);
    warmupStart = today;
  }
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(warmupStart).getTime()) / 86400000));
  let numberProfile = (process.env.NUMBER_PROFILE || "auto").trim().toLowerCase();
  if (numberProfile !== "nuevo" && numberProfile !== "veterano") {
    numberProfile = ageDays >= 7 ? "veterano" : "nuevo";
  }
  const throttlerOpts = numberProfile === "veterano"
    ? { baseDelayMs: 700, warmUpDays: 2, warmUpStartDate: warmupStart }
    : { baseDelayMs: 1500, warmUpDays: 7, warmUpStartDate: warmupStart };

  // B2.2: el tope diario del warm-up ahora es configurable desde .env.
  // El RITMO entre mensajes (delay + jitter) NO se toca: eso es lo que de
  // verdad protege del ban. Lo configurable es cuántos mensajes al día.
  const numEnv = (nombre) => {
    const v = parseInt(process.env[nombre] || "", 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const warmupOff = /^(0|off|no|false)$/i.test((process.env.WARMUP || "").trim()) || /^(0|off|no|false)$/i.test((process.env.WARMUP_LIMIT || "").trim());
  if (warmupOff) {
    throttlerOpts.warmUpStartMsgsPerDay = Number.MAX_SAFE_INTEGER;
    throttlerOpts.warmUpMaxMsgsPerDay = Number.MAX_SAFE_INTEGER;
  } else {
    const iniEnv = numEnv("WARMUP_START_MSGS");
    const maxEnv = numEnv("WARMUP_MAX_MSGS");
    const diasEnv = numEnv("WARMUP_DAYS");
    if (iniEnv) throttlerOpts.warmUpStartMsgsPerDay = iniEnv;
    if (maxEnv) throttlerOpts.warmUpMaxMsgsPerDay = maxEnv;
    if (diasEnv) throttlerOpts.warmUpDays = diasEnv;
    // Coherencia: el tope final nunca puede quedar por debajo del inicial
    // (si no, getDailyLimit() decrecería con los días: absurdo).
    const ini = throttlerOpts.warmUpStartMsgsPerDay ?? 20;
    const max = throttlerOpts.warmUpMaxMsgsPerDay ?? 500;
    if (max < ini) {
      throttlerOpts.warmUpMaxMsgsPerDay = ini;
      log.warn("WARMUP_MAX_MSGS era menor que WARMUP_START_MSGS; se igualó a " + ini);
    }
  }

  const engine = createEngine({ throttler: throttlerOpts });
  const warmupStats = engine.getThrottler().getStats();
  log.info("Perfil del número: " + numberProfile + " (antigüedad " + ageDays + "d) — delay base " + throttlerOpts.baseDelayMs + "ms, warm-up " + throttlerOpts.warmUpDays + " días, tope de hoy " + (warmupOff ? "SIN TOPE (WARMUP=off)" : warmupStats.dailyLimit + " mensajes"));
  const watchdog = createWatchdog(engine, { intervalMs: 10000, stuckThresholdMs: 300000 });
  watchdog.start();
  createWebServer(engine, { port: parseInt(process.env.PORT || "3000", 10) });

  // (Antes: si OWNER_NUMBER no existía, `undefined + "@s.whatsapp.net"`
  //  dejaba owner_jid = "undefined@s.whatsapp.net" — owner fantasma.)
  const ownerNum = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");
  // 🇲🇽 México: WhatsApp conserva en los JID el formato viejo 52+1+número
  //  (13 dígitos). Si se configura el móvil como 52… (12 dígitos) el bot
  //  NUNCA reconocería a su dueño: el JID real lleva el 1. Generamos la
  //  otra forma y la tratamos como alias; todos los candados aceptan ambas.
  let ownerAlias = null;
  if (ownerNum.startsWith("52") && !ownerNum.startsWith("521") && ownerNum.length === 12) {
    ownerAlias = "521" + ownerNum.slice(2);
  } else if (ownerNum.startsWith("521") && ownerNum.length === 13) {
    ownerAlias = "52" + ownerNum.slice(3);
  }
  if (ownerNum) {
    const ownerJidReal = (ownerAlias || ownerNum) + "@s.whatsapp.net";
    db.settings.set("owner_jid", ownerJidReal);
    engine.setOwnerJid(ownerJidReal);
    if (ownerAlias) log.info("Owner móvil MX: acepto «" + ownerNum + "» y su forma en JID «" + ownerAlias + "».");
  }

  // ── Globals legacy de Ginko ─────────────────────────────────────
  // 21 comandos portados (self, kick, setprefix, setowner...) leen
  // global.owner y global.mess. Sin definirlos, el primer uso lanza
  // TypeError en runtime (global.owner.map sobre undefined).
  globalThis.owner = ownerNum ? Array.from(new Set([ownerNum, ownerAlias].filter(Boolean))) : [];
  globalThis.links = {
    channel: process.env.CHANNEL_LINK || "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522",
    channelCode: process.env.CHANNEL_CODE || "0029VbDVFpSGJP89hfZUe522",
    channelName: process.env.CHANNEL_NAME || "Shin-MD Official Channel",
    instagram: process.env.INSTAGRAM_LINK || "https://www.instagram.com/__ikg.05",
    github: "https://github.com/riokuroxi-svg/Shin-MD",
    support: process.env.SUPPORT_LINK || "",
  };
  globalThis.multiplier = 2;
  globalThis.botname = "Shin-MD";
  globalThis.conns = new Map();
  globalThis.mess = {
    default: "⚠️ Comando no disponible.",
    socket: "🚫 *Solo el dueño* puede usar este comando.",
    success: "✓ Listo.",
    error: "⚠️ Error al ejecutar el comando.",
    wait: "⏳ Espera un momento...",
  };

  engine.on("connected", user => {
    const u = user?.id?.split(":")[0] || "?";
    const jid = u + "@s.whatsapp.net";
    process.env.BOT_JID = jid;
    // ⚠️ s.user es la cuenta VINCULADA (el propio bot), no el dueño.
    // NO se fija como owner el número del bot: quien vincula un número
    // distinto al suyo (p. ej. un SIM/VM) y no configura .env, se
    // quedaba con un bot que se coronaba a sí mismo mientras el dueño
    // real recibía «solo el dueño». Eso ya no puede pasar: si falta
    // OWNER_NUMBER, se avisa a gritos en consola y NADIE es owner
    // hasta configurarlo. (Bot de una sola cuenta: sin cambios — tus
    // propios mensajes ya pasan por ctx.fromMe.)
    if (!engine.getOwnerJid()) {
      log.warn("┌─────────────────────────────────────────────────────────");
      log.warn("│ ⚠ OWNER_NUMBER SIN CONFIGURAR — nadie será dueño del bot");
      log.warn("│   1) cp .env.example .env");
      log.warn("│   2) escribe tu número en OWNER_NUMBER (solo dígitos)");
      log.warn("│   3) reinicia el bot. Hasta entonces: todos sin permisos.");
      log.warn("└─────────────────────────────────────────────────────────");
    }
  });

  const router = createRouter(engine, { onCommand: logCommand, onMessage: logIncomingMessage });
  await router.init();

  const sockModule = connectSocket(engine, {
    sessionDir,
    pairingMethod: opcion === "2" ? "code" : "qr",
    pairingNumber: phoneNumber,
    onMessage: (s, m) => router.handle(s, m),
    onReady: async s => {
      globalThis.sock = s;
      try {
        const eventsMod = await import("#events");
        if (typeof eventsMod.default === "function") eventsMod.default(s);
      } catch (e) {
        log.error("Events registration: " + (e.message || e));
      }
      log.success("Bot listo ✓");
    },
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