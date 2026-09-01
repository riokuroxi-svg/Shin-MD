// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging superior
//  · Pino estructurado a **stderr** (para depuración técnica)
//  · Chalk formateado a **stdout** (para lectura humana)
//  · Niveles: trace, debug, info, warn, error, fatal
//  · Timestamp ISO, contexto automático
// ═══════════════════════════════════════════════════════════════════

import pino from "pino";
import chalk from "chalk";

const LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const isSilent = LEVEL === "silent";

// Pino a stderr para no mezclarse con la salida humana
const pinoLogger = pino({
  level: LEVEL === "silent" ? "fatal" : LEVEL,
  name: "shin-md",
  formatters: { level: (l) => ({ level: l }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  enabled: !isSilent,
}, process.stderr);

function timestamp() {
  return chalk.gray(new Date().toISOString().slice(11, 23));
}

const log = {
  trace: (msg, ...args) => {
    pinoLogger.trace(args.length ? { args } : undefined, msg);
  },
  debug: (msg, ...args) => {
    pinoLogger.debug(args.length ? { args } : undefined, msg);
  },
  info: (msg, ...args) => {
    pinoLogger.info(args.length ? { args } : undefined, msg);
    console.log(timestamp(), chalk.bgBlue.white.bold(" INFO "), chalk.white(msg));
  },
  success: (msg, ...args) => {
    pinoLogger.info({ event: "success" }, msg);
    console.log(timestamp(), chalk.bgGreen.white.bold(" OK  "), chalk.greenBright(msg));
  },
  warn: (msg, ...args) => {
    pinoLogger.warn(args.length ? { args } : undefined, msg);
    console.log(timestamp(), chalk.bgHex("#FFA500").white.bold(" WRN "), chalk.yellow(msg));
  },
  error: (msg, err) => {
    const meta = err ? { err: err?.stack || err?.message || err } : undefined;
    pinoLogger.error(meta, msg);
    console.log(timestamp(), chalk.bgRed.white.bold(" ERR "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    const meta = err ? { err: err?.stack || err?.message || err } : undefined;
    pinoLogger.fatal(meta, msg);
    console.log(timestamp(), chalk.bgRed.white.bold(" FATAL "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => {
    pinoLogger.debug(msg);
    console.log(timestamp(), chalk.gray(msg));
  },
};

export { pinoLogger };
export default log;