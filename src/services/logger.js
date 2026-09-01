// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging estilo Ginko-MD
//  Sin pino — solo chalk + console.log directo
// ═══════════════════════════════════════════════════════════════════

import chalk from "chalk";

const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(" INFO "), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(" OK  "), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgHex("#FFA500").white.bold(" WRN "), chalk.yellow(msg)),
  error: (msg, err) => {
    console.log(chalk.bgRed.white.bold(" ERR "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    console.log(chalk.bgRed.white.bold(" FATAL "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => console.log(chalk.gray(msg)),
  // Sin timestamp — como Ginko-MD
};

export default log;