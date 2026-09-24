/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  auth.js — Auth state de Baileys persistido en SQLite
//  WAL mode + synchronous=NORMAL + busy_timeout para evitar locks
//  durante el pairing (como Ginko-MD)
// ═══════════════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite";
import { initAuthCreds, BufferJSON } from "baileys";
import fs from "fs";
import path from "path";
import log from "#logger";

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

  // ── PRAGMAs estilo Ginko-MD: evitan locks durante pairing ──
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");

  // B1.3: checkpoint WAL al abrir. Tras un corte brusco (batería, kill)
  // puede quedar un -wal huérfano; el checkpoint lo pliega a la DB
  // principal para que creds/keys se lean siempre completos y frescos.
  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}

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
  const creds = credsRow ? JSON.parse(credsRow.data, BufferJSON.reviver) : initAuthCreds();

  function parseEntry(category, id, raw) {
    try {
      let value = JSON.parse(raw.toString(), BufferJSON.reviver);
      if (category === "app-state-sync-key" && value?.keyData) {
        value = { keyData: Buffer.from(value.keyData, "base64") };
      }
      return value;
    } catch {
      return null;
    }
  }

  // Statement preparado UNA sola vez (antes se creaba dentro del loop).
  const stmtGet = db.prepare("SELECT data FROM signal_keys WHERE category = ? AND id = ?");
  const stmtSet = db.prepare("INSERT OR REPLACE INTO signal_keys (category, id, data) VALUES (?, ?, ?)");
  const stmtRemove = db.prepare("DELETE FROM signal_keys WHERE category = ? AND id = ?");

  const keys = {
    async get(type, ids) {
      const out = {};
      for (const id of ids) {
        const row = stmtGet.get(type, id);
        if (row) {
          const parsed = parseEntry(type, id, row.data);
          if (parsed) out[id] = parsed;
        }
      }
      return out;
    },
    async set(data) {
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          try {
            stmtSet.run(category, id, JSON.stringify(value, BufferJSON.replacer));
          } catch (err) {
            log.error("keys.set(" + category + "," + id + "): " + (err.message || err));
          }
        }
      }
    },
    async remove(ids) {
      // Baileys llama a remove con ids como "senderKey:<chat>:<sender>"
      // (varios ":" dentro). split(":") truncaba la keyId → DELETE que
      // nunca coincidía → las keys muertas se acumulaban en la tabla.
      // Partir SOLO en el primer ":".
      for (const id of ids) {
        const idx = String(id).indexOf(":");
        const cat = idx === -1 ? id : id.slice(0, idx);
        const keyId = idx === -1 ? "" : id.slice(idx + 1);
        try { stmtRemove.run(cat, keyId); } catch (err) {
          log.error("keys.remove(" + id + "): " + (err.message || err));
        }
      }
    },
  };

  async function saveCreds() {
    if (!creds) return;
    try {
      db.prepare("INSERT OR REPLACE INTO creds (id, data) VALUES (1, ?)")
        .run(JSON.stringify(creds, BufferJSON.replacer));
    } catch (err) {
      log.error("saveCreds: " + (err.message || err));
    }
  }

  return { state: { creds, keys }, saveCreds };
}

export default { useSQLiteAuthState };