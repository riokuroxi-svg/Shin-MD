// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging con chalk estilo Ginko-MD
//  · Pino completamente deshabilitado (solo causa ruido en Termux)
//  · Usamos chalk + console.log formateado
//  · Niveles: info, success, warn, error, fatal, gray
// ═══════════════════════════════════════════════════════════════════

import chalk from "chalk";

function timestamp() {
  return chalk.gray(new Date().toISOString().slice(11, 23));
}

const log = {
  trace: () => {},
  debug: () => {},
  info: (msg) => {
    console.log(timestamp(), chalk.bgBlue.white.bold(" INFO "), chalk.white(msg));
  },
  success: (msg) => {
    console.log(timestamp(), chalk.bgGreen.white.bold(" OK  "), chalk.greenBright(msg));
  },
  warn: (msg) => {
    console.log(timestamp(), chalk.bgHex("#FFA500").white.bold(" WRN "), chalk.yellow(msg));
  },
  error: (msg, err) => {
    console.log(timestamp(), chalk.bgRed.white.bold(" ERR "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    console.log(timestamp(), chalk.bgRed.white.bold(" FATAL "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => {
    console.log(timestamp(), chalk.gray(msg));
  },
};

export default log;