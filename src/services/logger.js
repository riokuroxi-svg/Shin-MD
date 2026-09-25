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

// ── B5.3: log a archivo rotativo diario ────────────────────────────
// logs/shin-YYYY-MM-DD.log. Clave para debuggear bans: reconstruye qué
// pasaba minutos antes de una desconexión. Rotación por día + limpieza
// de archivos > 7 días. Se desactiva con LOG_FILE=0.
const FILE_LOG = process.env.LOG_FILE !== "0";
const LOG_DIR = path.resolve("logs");
const KEEP_DAYS = 7;
let fileLogBroken = false;

function writeLog(level, msg) {
  if (!FILE_LOG || fileLogBroken) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const clean = String(msg).replace(/\u001b\[[0-9;]*m/g, "");
    fs.appendFileSync(path.join(LOG_DIR, "shin-" + day + ".log"),
      new Date().toISOString() + " [" + level + "] " + clean + "\n");
    // Limpieza perezosa: solo cuando cambia el día
    if (writeLog._day !== day) {
      writeLog._day = day;
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

const log = {
  info: (msg) => { writeLog("INFO", msg); console.log(chalk.cyan(" ◐ "), chalk.white(msg)); },
  success: (msg) => { writeLog("SUCCESS", msg); console.log(chalk.green(" ✓ "), chalk.greenBright(msg)); },
  warn: (msg) => { writeLog("WARN", msg); console.log(chalk.yellow(" ◑ "), chalk.yellow(msg)); },
  error: (msg, err) => {
    writeLog("ERROR", msg + (err?.stack ? "\n" + err.stack : ""));
    console.log(chalk.red(" ✕ "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    writeLog("FATAL", msg + (err?.stack ? "\n" + err.stack : ""));
    console.log(chalk.bgRed.white.bold(" ✕✕ "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => { writeLog("GRAY", msg); console.log(chalk.gray(msg)); },
};

export default log;