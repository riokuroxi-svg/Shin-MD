/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { normalizePhone, parseArgs } from "../src/lib/cli-args.js";
import { estadoSesion, hayTerminalDetras, leerDeTerminal, planDeVinculacion } from "../src/lib/vinculacion.js";
import * as ui from "../src/services/consola.js";
import { panelListo } from "../src/services/consola.js";
import { instalarAPIs } from "../src/lib/apis.js";
// ═══════════════════════════════════════════════════════════════════
//  boot/index.js — Punto de arranque estilo Ginko-MD
//  Uso: node index.js [--code | --menu]
// ═══════════════════════════════════════════════════════════════════

import "dotenv/config";
import chalk from "chalk";
import moment from "moment-timezone";
import readlineSync from "readline-sync";
import fs from "fs";
import path from "path";
import { createEngine } from "#engine";
import { connectSocket } from "#socket";
import { createWatchdog } from "#watchdog";
import { createWebServer } from "#server";
import { getDatabase } from "#db";
import { crearBackendIdentidades } from "../src/storage/identities.js";
import { conectarBackend } from "../src/lib/lid.js";
import { createRouter } from "#router";
import log from "#logger";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { installLogFilter } from "../src/services/log-filter.js";
import { installAntiCrash } from "../src/services/anti-crash.js";
import { createTempCleaner } from "../src/services/temp-cleaner.js";
import { createMemoryMonitor } from "../src/services/memory-monitor.js";

// Consola limpia (sin el ruido de cifrado de libsignal) y que un corte de
// red suelto no tumbe al bot. Van antes de conectar con WhatsApp.
installLogFilter();
installAntiCrash();

// El banner, lo primero: es la cara del bot y así no queda enterrado entre
// el ruido de los parches y las migraciones.
printBanner();

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
  // La versión y el autor ya los dice el banner: aquí solo se comprueba
  // que la copia trae lo que la licencia exige.
}

// Red de seguridad del conector: el npm install aplica los parches a
// Baileys (postinstall), pero si el update se hizo solo con "git pull",
// node_modules queda viejo. El script es idempotente (solo parchea lo que
// falta y se auto-verifica), así que siempre nos deja en estado conocido.
// Si falla NO bloqueamos el arranque: las sesiones existentes siguen
// funcionando; lo que se pierde son los arreglos de vinculación, y el aviso
// manda a ejecutar "npm install".
{
  const __rootDir = path.dirname(fileURLToPath(import.meta.url));
  const __patchScript = path.resolve(__rootDir, "..", "scripts", "patch-baileys.cjs");
  const __baileysSocket = path.resolve(__rootDir, "..", "node_modules", "baileys", "lib", "Socket", "socket.js");
  if (fs.existsSync(__patchScript) && fs.existsSync(__baileysSocket)) {
    // Antes se soltaban diez líneas «ya aplicado» en cada arranque. Ahora se
    // resume en una: el detalle solo aparece si algo falla, que es cuando
    // de verdad hace falta leerlo.
    const r = spawnSync(process.execPath, [__patchScript], { encoding: "utf8" });
    const salida = String(r.stdout || "") + String(r.stderr || "");
    if (r.status === 0) {
      // El script dice cuántos parches deja puestos; si no lo dice, no se
      // inventa una cifra.
      // Se cuentan las líneas numeradas del script (1., 2a., 2b.…), que son
      // los parches de verdad; «aplicado» también sale en el resumen final.
      const total = (salida.match(/^\[patch-baileys\] ·\s+\d+[a-z]?\./gm) || []).length;
      const detalle = /no hay nada que escribir/.test(salida)
        ? (total ? total + " parches al día" : "parches al día")
        : "parches revisados y puestos";
      console.log(ui.estado("ok", "conector: " + detalle));
    } else {
      console.log(ui.estado("error", "no se pudieron aplicar los parches del conector"));
      console.log("  " + chalk.hex("#8B82A3")("si no puedes vincular un dispositivo nuevo, ejecuta \"npm install\"."));
      if (process.env.SHIN_VERBOSE === "1") console.log(salida);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────


function printBanner() {
  let version = "dev";
  try {
    version = JSON.parse(fs.readFileSync(path.join(__dirname(), "..", "package.json"), "utf8")).version || version;
  } catch {}
  const plataforma = process.platform === "android" ? "termux" : process.platform;
  console.log(ui.banner({ version, node: process.versions.node, plataforma }));
}

/** La carpeta de este archivo, para no repetir el cálculo tres veces. */
function __dirname() {
  return path.dirname(fileURLToPath(import.meta.url));
}

// El registro de mensajes, en una línea por mensaje. Antes cada texto que
// entraba soltaba un cuadro de siete filas con colores distintos a los del
// resto de la consola: en un grupo activo eso es ilegible. Ahora se lee
// como un registro y comparte la paleta del resto.
function logIncomingMessage(ctx, usedPrefix) {
  const t = moment().tz("America/Mexico_City").format("HH:mm:ss");
  const donde = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "privado";
  log.ui(ui.mensaje({
    hora: t,
    quien: ctx.pushName || ctx.pushname || "Usuario",
    donde,
    texto: String(ctx.text || ""),
    comando: !!usedPrefix,
  }));
}

function logCommand(ctx, cmdName, ms) {
  const t = moment().tz("America/Mexico_City").format("HH:mm:ss");
  const donde = ctx.isGroup ? (ctx.groupName || ctx.chatId) : "privado";
  log.ui(ui.mensaje({
    hora: t,
    quien: ctx.pushName || ctx.pushname || "Usuario",
    donde,
    texto: cmdName,
    comando: true,
    ms,
  }));
}

// ==================================================================
//  INICIO — TODO SINCRONO hasta el menú (como Ginko-MD)
// ==================================================================

const args = parseArgs(process.argv.slice(2));
// SESSION_DIR permite arrancar con otra sesión (ej. para probar la
// vinculación sin tocar la del dueño: SESSION_DIR=/tmp/prueba).
const sessionDir = process.env.SESSION_DIR || "./Sessions/Owner";
const sesion = estadoSesion(sessionDir);

// ── Vinculación: siempre por código, nunca por QR ───────────────────
// El QR se retiró porque en un móvil no cabe en la pantalla y, partido,
// no hay quien lo escanee. `--qr` se sigue aceptando para no romper los
// guiones que ya existan, pero hace lo mismo que `--code`.
if (args.qrDeprecado) {
  log.warn("El QR ya no se usa: la vinculación es siempre por código.");
  console.log(ui.estado("info", "te pediré el número y WhatsApp te dará un código de 8 caracteres."));
}

/**
 * Pide el número por la terminal. Si la entrada estándar no es una
 * terminal pero hay una detrás (`/dev/tty`), se lee de ahí: es el caso
 * de un proceso lanzado con `< /dev/null` desde una sesión normal.
 *
 * @returns {string} el número normalizado, o "" si no se pudo preguntar
 */
function preguntarNumero() {
  const porTty = !process.stdin.isTTY && hayTerminalDetras();
  console.log(ui.panelVinculacion().join("\n"));
  const respuesta = porTty ? leerDeTerminal() : readlineSync.question(ui.preguntaNumero());
  if (porTty) console.log(ui.preguntaNumero() + respuesta);
  return normalizePhone(respuesta);
}

/**
 * La orden exacta que hay que escribir cuando no hay dónde preguntar.
 * Se enseña con `521XXXXXXXXXX` en lugar del número porque es lo único
 * que hay que cambiar, y se recuerda el `.env` para quien prefiera no
 * teclearlo cada vez.
 */
function explicarSinTerminal(motivo) {
  console.error("");
  console.error(ui.estado("error", `no hay una terminal donde preguntarte el número (${motivo}).`));
  console.error("  " + chalk.hex("#8B82A3")("Se arranca sin preguntar de dos maneras:"));
  console.error("");
  console.error("    " + chalk.hex("#CFC6E0")("npm start -- --code 521XXXXXXXXXX"));
  console.error("    " + chalk.hex("#CFC6E0")("PAIRING_NUMBER=521XXXXXXXXXX npm start"));
  console.error("");
  console.error("  " + chalk.hex("#8B82A3")("El número es el tuyo, el de la cuenta de WhatsApp que va a llevar el bot."));
  console.error("");
}

const plan = planDeVinculacion({
  args,
  env: process.env,
  sesion,
  hayTerminal: hayTerminalDetras(),
});

let phoneNumber = "";
switch (plan.accion) {
  case "nada":
    console.log(ui.estado("ok", "sesión existente: no hace falta vincular nada."));
    break;
  case "usar":
    phoneNumber = plan.numero;
    console.log(ui.estado("ok", `vinculando con el número ${phoneNumber}.`));
    break;
  case "preguntar":
    phoneNumber = preguntarNumero();
    if (!phoneNumber) {
      console.error(ui.estado("error", "ese número no tiene dígitos usables."));
      process.exit(1);
    }
    break;
  default:
    // Antes, aquí se seguía de largo y WhatsApp acababa pidiendo un QR
    // que nadie había pedido y que no se puede escanear en un móvil. No
    // se arranca a ciegas: se para y se dice qué escribir.
    explicarSinTerminal(plan.motivo);
    process.exit(1);
}

// ==================================================================
//  ASÍNCRONO — a partir de aquí
// ==================================================================

async function main() {
  let db;
  try { db = getDatabase(); }
  catch (err) { log.fatal("DB: " + err.message); process.exit(1); }

  // ── Identidades LID ↔ teléfono ──────────────────────────────────
  //  La red solo resuelve teléfono → LID; el sentido contrario vive en
  //  esta tabla. Se conecta ANTES de recibir el primer mensaje: si no,
  //  la primera pareja que llegue se perdería y el usuario tendría dos
  //  cuentas (una por cada forma de su JID).
  try {
    const backend = crearBackendIdentidades(db.db);
    conectarBackend(backend);
    const conocidas = backend.contar();
    if (conocidas > 0) log.gray("Identidades: " + conocidas + " parejas LID ↔ teléfono recordadas.");
  } catch (err) {
    // Sin esta capa el bot sigue funcionando: peor (cuentas partidas),
    // pero funcionando. Se avisa una vez y se sigue.
    log.warn("Identidades: no se pudo activar la persistencia: " + (err.message || err));
  }

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
  // B2.2: cargar estado persistido de warm-up y ritmo para no reiniciar
  // cuotas ni olvidar chats calientes al reiniciar el proceso.
  let savedWarmup = {};
  try {
    const raw = db.settings.get("warmup_state");
    if (raw) savedWarmup = JSON.parse(raw);
  } catch {}
  let savedRitmo = {};
  try {
    const raw = db.settings.get("ritmo_state");
    if (raw) savedRitmo = JSON.parse(raw);
  } catch {}

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
    const max = throttlerOpts.warmUpMaxMsgsPerDay ?? 2000;
    if (max < ini) {
      throttlerOpts.warmUpMaxMsgsPerDay = ini;
      log.warn("WARMUP_MAX_MSGS era menor que WARMUP_START_MSGS; se igualó a " + ini);
    }
  }
  if (savedWarmup && typeof savedWarmup === "object") {
    if (savedWarmup.warmUpLastReset === today) {
      throttlerOpts.warmUpMsgsToday = Number(savedWarmup.warmUpMsgsToday) || 0;
    }
    throttlerOpts.warmUpLastReset = savedWarmup.warmUpLastReset || today;
    throttlerOpts.totalSent = Number(savedWarmup.totalSent) || 0;
    if (savedWarmup.perfil) throttlerOpts.perfil = savedWarmup.perfil;
  }

  const engine = createEngine({ throttler: throttlerOpts, ritmoEstado: savedRitmo });
  const warmupStats = engine.getThrottler().getStats();
  log.info("Perfil del número: " + numberProfile + " (antigüedad " + ageDays + "d) — delay base " + throttlerOpts.baseDelayMs + "ms, warm-up " + throttlerOpts.warmUpDays + " días, tope de hoy " + (warmupOff ? "SIN TOPE (WARMUP=off)" : warmupStats.dailyLimit + " mensajes"));
  const watchdog = createWatchdog(engine, { intervalMs: 10000, stuckThresholdMs: 300000 });
  watchdog.start();
  const webServer = createWebServer(engine, { port: parseInt(process.env.PORT || "3000", 10) });

  // Mantenimiento 24/7: temporales viejos fuera y aviso si la RAM se dispara.
  const tempCleaner = createTempCleaner();
  tempCleaner.start();
  const memoryMonitor = createMemoryMonitor();
  memoryMonitor.start();

  function persistAntibanState() {
    try {
      const thState = engine.getThrottler()?.state;
      if (thState) db.settings.set("warmup_state", JSON.stringify(thState));
      const rtState = engine.getRitmo()?.estado;
      if (rtState) db.settings.set("ritmo_state", JSON.stringify(rtState));
    } catch (err) {
      log.warn("No se pudo guardar el estado antiban: " + (err?.message || err));
    }
  }
  const persistTimer = setInterval(persistAntibanState, 60000);
  if (typeof persistTimer.unref === "function") persistTimer.unref();

  engine.onShutdown(async () => {
    clearInterval(persistTimer);
    persistAntibanState();
    watchdog.stop();
    tempCleaner.stop();
    memoryMonitor.stop();
    await webServer.close();
  });

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
  globalThis.conns = [];
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
      console.log("");
      console.log(ui.caja({
        titulo: "falta el dueño",
        color: ui.COLOR.ambar,
        lineas: [
          "OWNER_NUMBER sin configurar: nadie será dueño.",
          "",
          "1) cp .env.example .env",
          "2) escribe tu número en OWNER_NUMBER (solo dígitos)",
          "3) reinicia el bot",
          "",
          ui.COLOR.tenue("hasta entonces, todos sin permisos."),
        ],
      }).join("\n"));
      console.log("");
    }
  });

  // Las APIs de respaldo se configuran ANTES de cargar los comandos: si no,
  // el primer .instagram se encuentra `global.APIs` sin definir y revienta.
  instalarAPIs();
  const router = createRouter(engine, { onCommand: logCommand, onMessage: logIncomingMessage });
  await router.init();

  const sockModule = connectSocket(engine, {
    sessionDir,
    // Siempre por código: el QR se retiró de la consola.
    pairingMethod: "code",
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
      console.log("");
      console.log(panelListo({
        version: (() => {
          try { return JSON.parse(fs.readFileSync(path.join(__dirname(), "..", "package.json"), "utf8")).version; }
          catch { return "?"; }
        })(),
        nombre: s?.user?.name || s?.user?.id || "?",
        comandos: typeof router.countUnique === "function" ? router.countUnique() : 0,
        prefijo: router.PREFIX || ".",
        web: `http://127.0.0.1:${process.env.PORT || 3000}`,
      }));
      console.log("  " + ui.COLOR.tenue("el registro de lo que pasa va aquí abajo.") + "\n");
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