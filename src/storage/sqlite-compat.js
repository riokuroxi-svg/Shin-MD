/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * sqlite-compat.js — Capa de compatibilidad universal para SQLite
 * 1. Intenta `node:sqlite` nativo (Node >= 22.5.0)
 * 2. Intenta `better-sqlite3` si está instalado
 * 3. Fallback puro en JavaScript para entornos de test / Node < 22.5.0
 */

import fs from "fs";
import path from "path";

let _DatabaseSync;

try {
  const mod = await import("node:sqlite");
  if (mod && mod.DatabaseSync) {
    _DatabaseSync = mod.DatabaseSync;
  }
} catch {}

if (!_DatabaseSync) {
  try {
    // Dependencia OPCIONAL: sólo se carga si node:sqlite (nativo, el
    // camino normal en Node 22) no está disponible.
    // @ts-expect-error -- módulo opcional, no instalado por defecto
    const bmod = await import("better-sqlite3");
    const BSqlite = bmod.default || bmod;
    _DatabaseSync = class DatabaseSync extends BSqlite {
      constructor(filename, options) {
        super(filename, options);
      }
    };
  } catch {}
}

// Fallback universal en memoria / archivo plano estructurado
if (!_DatabaseSync) {
  class MockStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql.trim();
    }

    run(...params) {
      return this.db._execStatement(this.sql, params, "run");
    }

    get(...params) {
      return this.db._execStatement(this.sql, params, "get");
    }

    all(...params) {
      return this.db._execStatement(this.sql, params, "all");
    }
  }

  class UniversalDatabaseSync {
    constructor(filename) {
      this.filename = filename;
      this.tables = new Map();
      this.isMemory = !filename || filename === ":memory:";
      this._load();
    }

    _load() {
      if (this.isMemory) return;
      try {
        const jsonPath = this.filename + ".json";
        if (fs.existsSync(jsonPath)) {
          const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
          for (const [k, v] of Object.entries(raw)) {
            this.tables.set(k, new Map(Object.entries(v)));
          }
        }
      } catch {}
    }

    _save() {
      if (this.isMemory) return;
      try {
        const dir = path.dirname(this.filename);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const obj = {};
        for (const [tName, map] of this.tables.entries()) {
          obj[tName] = Object.fromEntries(map.entries());
        }
        fs.writeFileSync(this.filename + ".json", JSON.stringify(obj, null, 2), "utf8");
      } catch {}
    }

    exec(sql) {
      const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
      for (const s of stmts) {
        this._execStatement(s, [], "exec");
      }
    }

    prepare(sql) {
      return new MockStatement(this, sql);
    }

    _getTable(name) {
      const clean = name.replace(/[`"'[\]]/g, "").toLowerCase();
      if (!this.tables.has(clean)) {
        this.tables.set(clean, new Map());
      }
      return this.tables.get(clean);
    }

    _execStatement(sql, params, mode) {
      const lower = sql.toLowerCase().trim();

      if (lower.startsWith("pragma")) return mode === "all" ? [] : null;

      if (lower.startsWith("create table")) {
        const m = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_]+)/i);
        if (m) this._getTable(m[1]);
        return { changes: 0, lastInsertRowid: 0 };
      }

      // INSERT OR REPLACE / INSERT INTO
      if (lower.startsWith("insert")) {
        const m = sql.match(/insert\s+(?:or\s+replace\s+into|into)\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*values/i);
        if (m) {
          const tableName = m[1];
          const cols = m[2].split(",").map(c => c.trim().toLowerCase());
          const table = this._getTable(tableName);
          const row = {};
          cols.forEach((col, idx) => {
            row[col] = params[idx] !== undefined ? params[idx] : null;
          });
          const pKey = cols[0];
          const keyVal = String(row[pKey] || (table.size + 1));
          table.set(keyVal, row);
          this._save();
          return { changes: 1, lastInsertRowid: table.size };
        }
      }

      // SELECT
      if (lower.startsWith("select")) {
        const m = sql.match(/select\s+(.+?)\s+from\s+([a-zA-Z0-9_]+)(?:\s+where\s+(.+?))?(?:\s+order\s+by|\s+limit|$)/i);
        if (m) {
          const colsStr = m[1].trim();
          const tableName = m[2];
          const whereClause = m[3] ? m[3].trim().toLowerCase() : null;
          const table = this._getTable(tableName);

          let rows = Array.from(table.values());

          if (whereClause) {
            if (whereClause.includes("key = ?") || whereClause.includes("id = ?")) {
              const filterVal = params[0];
              rows = rows.filter(r => {
                const k = Object.keys(r)[0];
                return String(r[k]) === String(filterVal) || String(r.key) === String(filterVal) || String(r.id) === String(filterVal);
              });
            } else if (whereClause.includes("id = 1")) {
              rows = rows.filter(r => String(r.id) === "1");
            }
          }

          if (colsStr !== "*") {
            const reqCols = colsStr.split(",").map(c => c.trim().toLowerCase());
            rows = rows.map(r => {
              const sub = {};
              for (const col of reqCols) {
                if (r[col] !== undefined) sub[col] = r[col];
              }
              return sub;
            });
          }

          if (mode === "get") return rows[0] || undefined;
          if (mode === "all") return rows;
          return rows;
        }
        return mode === "all" ? [] : undefined;
      }

      // DELETE
      if (lower.startsWith("delete")) {
        const m = sql.match(/delete\s+from\s+([a-zA-Z0-9_]+)(?:\s+where\s+(.+))?/i);
        if (m) {
          const tableName = m[1];
          const table = this._getTable(tableName);
          if (params.length > 0) {
            table.delete(String(params[0]));
          } else {
            table.clear();
          }
          this._save();
          return { changes: 1 };
        }
      }

      return mode === "all" ? [] : null;
    }

    close() {
      this._save();
    }
  }

  _DatabaseSync = UniversalDatabaseSync;
}

export const DatabaseSync = _DatabaseSync;
export default { DatabaseSync };
