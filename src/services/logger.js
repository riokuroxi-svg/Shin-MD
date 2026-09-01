// ═══════════════════════════════════════════════════════════════════
//  logger.js — Logging EXACTO de Ginko-MD
//  chalk puro, sin pino, sin timestamps (como Ginko-MD)
// ═══════════════════════════════════════════════════════════════════

import chalk from "chalk";

const log = {
  info: (msg) => console.log(chalk.bgBlue.white.bold(" INFO "), chalk.white(msg)),
  success: (msg) => console.log(chalk.bgGreen.white.bold(" SUCCESS "), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.bgHex("#FFA500").white.bold(" WARNING "), chalk.yellow(msg)),
  error: (msg, err) => {
    console.log(chalk.bgRed.white.bold(" ERROR "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    console.log(chalk.bgRed.white.bold(" FATAL "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => console.log(chalk.gray(msg)),
};

export default log;