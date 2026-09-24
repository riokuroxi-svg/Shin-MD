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

const log = {
  info: (msg) => console.log(chalk.cyan(" ◐ "), chalk.white(msg)),
  success: (msg) => console.log(chalk.green(" ✓ "), chalk.greenBright(msg)),
  warn: (msg) => console.log(chalk.yellow(" ◑ "), chalk.yellow(msg)),
  error: (msg, err) => {
    console.log(chalk.red(" ✕ "), chalk.redBright(msg));
    if (err?.stack) console.log(chalk.red(err.stack.split("\n").slice(1, 3).join("\n")));
  },
  fatal: (msg, err) => {
    console.log(chalk.bgRed.white.bold(" ✕✕ "), chalk.redBright.bold(msg));
    if (err?.stack) console.log(chalk.red(err.stack));
  },
  gray: (msg) => console.log(chalk.gray(msg)),
};

export default log;