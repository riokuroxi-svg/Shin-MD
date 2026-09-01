// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging estructurado (pino + salida legible)
//  Niveles: debug, info, warn, error. Configurable via LOG_LEVEL.
// ═══════════════════════════════════════════════════════════════════

import pino from "pino";
import chalk from "chalk";

const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();

const logger = pino({
  level: LOG_LEVEL,
  name: "shin-md",
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const log = {
  debug: (msg, meta) => logger.debug(meta || {}, msg),
  info: (msg, meta) => {
    logger.info(meta || {}, msg);
    console.log(chalk.bgBlue.white.bold(" INFO "), chalk.white(msg));
  },
  success: (msg, meta) => {
    logger.info(meta || {}, msg);
    console.log(chalk.bgGreen.white.bold(" ✓  "), chalk.greenBright(msg));
  },
  warn: (msg, meta) => {
    logger.warn(meta || {}, msg);
    console.log(chalk.bgHex("#FFA500").white.bold(" ⚠  "), chalk.yellow(msg));
  },
  error: (msg, meta) => {
    logger.error(meta || {}, msg);
    console.log(chalk.bgRed.white.bold(" ✗  "), chalk.redBright(msg));
  },
  gray: (msg) => {
    logger.debug(msg);
    console.log(chalk.gray(msg));
  },
};

export default log;