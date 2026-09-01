// ═══════════════════════════════════════════════════════════════════
//  migrations.js — Definiciones de migraciones (single source of truth)
//  database.js las aplica en orden. Nunca editar una migración ya
//  aplicada: añadir una nueva versión al final.
// ═══════════════════════════════════════════════════════════════════

export const MIGRATIONS = [
  {
    version: 1,
    name: "core-tables",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS users (
          jid        TEXT PRIMARY KEY,
          name       TEXT,
          banned     INTEGER NOT NULL DEFAULT 0,
          warned     INTEGER NOT NULL DEFAULT 0,
          first_seen INTEGER NOT NULL DEFAULT 0,
          last_seen  INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS groups_data (
          jid          TEXT PRIMARY KEY,
          name         TEXT,
          member_count INTEGER NOT NULL DEFAULT 0,
          settings     TEXT,
          updated_at   INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS message_log (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          jid       TEXT NOT NULL,
          sender    TEXT NOT NULL,
          body      TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON message_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);
      `);
    },
  },
];

export default MIGRATIONS;
