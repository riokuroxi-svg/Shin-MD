// ═══════════════════════════════════════════════════════════════════
//  auth.js — Auth state de Baileys persistido en SQLite
//  (creds + Signal keys) en vez de archivos JSON planos.
// ═══════════════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import log from "#logger";

const KEY_MAP = {
  "pre-key": "pre-key",
  session: "session",
  "sender-key": "sender-key",
  "app-state-sync-key": "app-state-sync-key",
  "app-state-sync-version": "app-state-sync-version",
  "trusted-sender-key": "trusted-sender-key",
};

/**
 * Devuelve { state, saveCreds } compatible con Baileys.
 * state: { creds, keys } donde keys tiene methods get/set/remove.
 */
export async function useSQLiteAuthState(sessionDir) {
  fs.mkdirSync(sessionDir, { recursive: true });
  const dbPath = path.join(sessionDir, "auth.db");

  let db;
  try {
    db = new DatabaseSync(dbPath);
  } catch (err) {
    log.error("SQLite auth failed: " + (err.message || err));
    throw err;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS creds (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signal_keys (
      category TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (category, id)
    );
    CREATE INDEX IF NOT EXISTS idx_signal_cat ON signal_keys(category);
  `);

  const credsRow = db.prepare("SELECT data FROM creds WHERE id = 1").get();
  const creds = credsRow ? JSON.parse(credsRow.data) : null;

  function parseEntry(category, id, buffer) {
    let value = null;
    try {
      value = JSON.parse(buffer.toString());
      if (category === "app-state-sync-key") {
        value = { keyData: Buffer.from(value.keyData, "base64"), ...value };
      }
    } catch (err) {
      log.error("parseEntry(" + category + "," + id + "): " + (err.message || err));
    }
    return value;
  }

  const keys = {
    async get(type, ids) {
      const out = {};
      for (const id of ids) {
        const cat = KEY_MAP[type] || type;
        const row = db.prepare("SELECT data FROM signal_keys WHERE category = ? AND id = ?")
          .get(cat, id);
        if (row) {
          const parsed = parseEntry(cat, id, row.data);
          if (parsed) out[id] = parsed;
        }
      }
      return out;
    },
    async set(data) {
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO signal_keys (category, id, data) VALUES (?, ?, ?)"
      );
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const cat = KEY_MAP[category] || category;
          let serialized;
          if (cat === "app-state-sync-key" && value.keyData) {
            serialized = JSON.stringify({ ...value, keyData: value.keyData.toString("base64") });
          } else {
            serialized = JSON.stringify(value);
          }
          try {
            stmt.run(cat, id, serialized);
          } catch (err) {
            log.error("keys.set(" + cat + "," + id + "): " + (err.message || err));
          }
        }
      }
    },
    async remove(ids) {
      const stmt = db.prepare("DELETE FROM signal_keys WHERE category = ? AND id = ?");
      for (const id of ids) {
        const [cat, keyId] = id.split(":");
        try { stmt.run(cat, keyId); } catch (err) {
          log.error("keys.remove(" + id + "): " + (err.message || err));
        }
      }
    },
  };

  async function saveCreds() {
    if (!creds) return;
    db.prepare("INSERT OR REPLACE INTO creds (id, data) VALUES (1, ?)")
      .run(JSON.stringify(creds));
  }

  return { state: { creds, keys }, saveCreds };
}

export default { useSQLiteAuthState };
