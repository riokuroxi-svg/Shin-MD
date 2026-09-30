/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * sqlite-compat.js — Capa de compatibilidad universal para SQLite
 * Usa node:sqlite nativo (Node >= 22.5.0) y fallback transparente a
 * better-sqlite3 si se ejecuta en Node < 22.5.0.
 */

let _DatabaseSync;

try {
  const mod = await import("node:sqlite");
  if (mod && mod.DatabaseSync) {
    _DatabaseSync = mod.DatabaseSync;
  }
} catch {
  // node:sqlite no disponible en este entorno Node
}

if (!_DatabaseSync) {
  try {
    const betterSqliteMod = await import("better-sqlite3");
    const BetterSqlite = betterSqliteMod.default || betterSqliteMod;
    _DatabaseSync = class DatabaseSync extends BetterSqlite {
      constructor(filename, options) {
        super(filename, options);
      }
    };
  } catch (err) {
    throw new Error(
      "No se encontró un motor SQLite compatible (node:sqlite o better-sqlite3): " +
        (err.message || err)
    );
  }
}

export const DatabaseSync = _DatabaseSync;
export default { DatabaseSync };
