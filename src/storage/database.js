// ═══════════════════════════════════════════════════════════════════
//  database.js — Capa SQLite con migraciones versionadas
//  Usa node:sqlite (Node >= 22.5.0). Singleton con export por defecto.
// ═══════════════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "#migrations";
import log from "#logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDatabase(dbPath) {
  const resolved = dbPath || path.join(__dirname, "../../data", "shin.db");
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  let db;
  try {
    db = new DatabaseSync(resolved);
  } catch (err) {
    log.error("Database init failed: " + (err.message || err));
    throw err;
  }

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  // Tabla de migraciones
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version  INTEGER PRIMARY KEY,
      name     TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  function migrate() {
    const applied = new Set(
      db.prepare("SELECT version FROM migrations").all().map(r => r.version)
    );
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      log.gray("Migrating db → v" + m.version + " (" + m.name + ")");
      try {
        m.up(db);
        db.prepare("INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(m.version, m.name, Date.now());
        log.success("Migration v" + m.version + " applied");
      } catch (err) {
        log.error("Migration v" + m.version + " failed: " + (err.message || err));
        throw err;
      }
    }
  }

  migrate();

  // Helpers de settings
  const settings = {
    get(key) {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      if (!r) return null;
      try { return JSON.parse(r.value); } catch { return r.value; }
    },
    set(key, value) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .run(key, JSON.stringify(value));
    },
    del(key) {
      db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    },
    all() {
      return db.prepare("SELECT key, value FROM settings").all()
        .map(r => {
          let v = r.value;
          try { v = JSON.parse(v); } catch {}
          return { key: r.key, value: v };
        });
    },
  };

  function close() {
    try { db.close(); } catch {}
    log.gray("Database closed");
  }

  return { db, migrate, settings, close };
}

let defaultDb = null;
export function getDatabase() {
  if (!defaultDb) defaultDb = createDatabase();
  return defaultDb;
}

export default { createDatabase, getDatabase };
