/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging estilo Ginko-MD (B2.4: iconos ◐ ◑ ✓ ✕ en vez de
//  etiquetas INFO/SUCCESS en mayúsculas; colores suaves, chalk puro)
// ═══════════════════════════════════════════════════════════════════

import chalk from "chalk";
import fs from "fs";
import path from "path";
import util from "node:util";

// ── B5.3: log a archivo rotativo diario ────────────────────────────
// logs/shin-YYYY-MM-DD.log. Clave para debuggear bans: reconstruye qué
// pasaba minutos antes de una desconexión. Rotación por día + limpieza
// de archivos > 7 días. Se desactiva con LOG_FILE=0.
const FILE_LOG = process.env.LOG_FILE !== "0";
const LOG_DIR = path.resolve("logs");
const KEEP_DAYS = 7;
let fileLogBroken = false;
let lastCleanupDay = ""; // antes era writeLog._day: estado escondido dentro de una función

function writeLog(level, msg) {
  if (!FILE_LOG || fileLogBroken) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line no-control-regex -- limpia los códigos ANSI de chalk antes de escribir el archivo
    const clean = String(msg).replace(/\u001b\[[0-9;]*m/g, "");
    fs.appendFileSync(path.join(LOG_DIR, "shin-" + day + ".log"),
      new Date().toISOString() + " [" + level + "] " + clean + "\n");
    // Limpieza perezosa: solo cuando cambia el día
    if (lastCleanupDay !== day) {
      lastCleanupDay = day;
      const cutoff = Date.now() - KEEP_DAYS * 86400000;
      for (const f of fs.readdirSync(LOG_DIR)) {
        if (!/^shin-\d{4}-\d{2}-\d{2}\.log$/.test(f)) continue;
        try {
          if (fs.statSync(path.join(LOG_DIR, f)).mtimeMs < cutoff) {
            fs.unlinkSync(path.join(LOG_DIR, f));
          }
        } catch {}
      }
    }
  } catch { fileLogBroken = true; } // nunca dejar que el log tumbe al bot
}

// ── Por qué los métodos aceptan varios argumentos ───────────────────
// Antes eran de UN solo argumento, y una llamada como
//     log.info("Código de emparejamiento:", code)
// tiraba el segundo sin decir nada: el bot avisaba que había un código
// pero nunca lo mostraba. Ahora se juntan todos (texto tal cual; el
// resto con util.inspect) para que NADA se pierda en silencio.
function unir(args) {
  return args
    .map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 2, breakLength: 120 })))
    .join(" ");
}

const log = {
  info: (...args) => { const msg = unir(args); writeLog("INFO", msg); console.log(chalk.cyan(" ◐ "), chalk.white(msg)); },
  success: (...args) => { const msg = unir(args); writeLog("SUCCESS", msg); console.log(chalk.green(" ✓ "), chalk.greenBright(msg)); },
  warn: (...args) => { const msg = unir(args); writeLog("WARN", msg); console.log(chalk.yellow(" ◑ "), chalk.yellow(msg)); },
  error: (msg, err) => {
    const suelto = typeof err === "string" ? " " + err : "";
    writeLog("ERROR", msg + suelto + (err?.stack ? "\n" + err.stack : ""));
    console.log(chalk.red(" ✕ "), chalk.redBright(msg + suelto));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    writeLog("FATAL", msg + (err?.stack ? "\n" + err.stack : ""));
    console.log(chalk.bgRed.white.bold(" ✕✕ "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (...args) => { const msg = unir(args); writeLog("GRAY", msg); console.log(chalk.gray(msg)); },

  // ── log.ui(): para las salidas que SON diseño ───────────────────
  // El banner de arranque y los avisos de sub-bots ya vienen con su
  // propio color y su propia caja: pasarlos por info/success les
  // cambiaría los iconos y destrozaría el estilo. `ui` imprime el texto
  // TAL CUAL (idéntico a console.log) pero además lo escribe en
  // logs/shin-YYYY-MM-DD.log, que es de donde se reconstruye qué pasó
  // antes de una desconexión. Antes, esas líneas solo existían en la
  // pantalla y se perdían.
  ui: (...args) => { const msg = unir(args); writeLog("UI", msg); console.log(msg); },
};

export default log;