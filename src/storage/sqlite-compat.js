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
let _isFallback = false;

// SHIN_SQLITE_FALLBACK=1 obliga a usar el respaldo en JSON aunque haya
// SQLite real. Sirve para probar ese camino en cualquier Node.
const FORZAR_FALLBACK = process.env.SHIN_SQLITE_FALLBACK === "1";

if (!FORZAR_FALLBACK) {
  try {
    const mod = await import("node:sqlite");
    if (mod && mod.DatabaseSync) {
      _DatabaseSync = mod.DatabaseSync;
    }
  } catch {}
}

if (!_DatabaseSync && !FORZAR_FALLBACK) {
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
  _isFallback = true;
  const META_PK = "__claves_primarias__";

  /**
   * Lee las igualdades de un WHERE (col = ?, col = 1, col = 'x', con AND).
   * Devuelve [[columna, valor], ...]. Los "?" se toman de params en orden.
   */
  const leerCondiciones = (whereClause, params) => {
    const conds = [];
    const condRe = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\?|-?\d+|'[^']*')/g;
    let cm;
    let pIdx = 0;
    while ((cm = condRe.exec(whereClause)) !== null) {
      let val;
      if (cm[2] === "?") val = params[pIdx++];
      else if (cm[2].startsWith("'")) val = cm[2].slice(1, -1);
      else val = cm[2];
      conds.push([cm[1].toLowerCase(), val]);
    }
    return conds;
  };

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
          const pks = raw[META_PK] || {};
          for (const [k, v] of Object.entries(raw)) {
            if (k === META_PK) continue;
            const t = /** @type {any} */ (new Map(Object.entries(v)));
            if (Array.isArray(pks[k])) t.__pk = pks[k];
            this.tables.set(k, t);
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
        const pks = {};
        for (const [tName, map] of this.tables.entries()) {
          obj[tName] = Object.fromEntries(map.entries());
          if (map.__pk) pks[tName] = map.__pk;
        }
        // Las claves primarias se guardan aparte: las tablas que se crean
        // en una migración no vuelven a pasar por CREATE TABLE al reiniciar.
        if (Object.keys(pks).length) obj[META_PK] = pks;
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
        if (m) {
          const t = this._getTable(m[1]);
          // Detectar PRIMARY KEY compuesta o inline para usar como clave del Map
          const pkTuple = sql.match(/primary\s+key\s*\(\s*([^)]+)\s*\)/i);
          if (pkTuple) {
            t.__pk = pkTuple[1].split(",").map(c => c.trim().toLowerCase());
          } else {
            const inline = sql.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s+[a-zA-Z]+\s+primary\s+key/i);
            if (inline) t.__pk = [inline[1].toLowerCase()];
          }
        }
        return { changes: 0, lastInsertRowid: 0 };
      }

      // INSERT OR REPLACE / INSERT INTO
      if (lower.startsWith("insert")) {
        const m = sql.match(/insert\s+(?:or\s+replace\s+into|into)\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*values/i);
        if (m) {
          const tableName = m[1];
          const cols = m[2].split(",").map(c => c.trim().toLowerCase());
          const table = this._getTable(tableName);
          // Parsear la lista VALUES para distinguir literales (1, 'x', NULL)
          // de placeholders (?). Antes se mapeaban params por posición de
          // columna, así que VALUES (1, ?) asignaba el param a la col id.
          const vm = sql.match(/values\s*\(([^)]*)\)/i);
          const tokens = vm ? vm[1].split(",").map(t => t.trim()) : [];
          let pIdx = 0;
          const row = {};
          cols.forEach((col, idx) => {
            let val = null;
            const tok = tokens[idx];
            if (tok === undefined || tok === "?") {
              val = params[pIdx] !== undefined ? params[pIdx] : null;
              if (tok === "?") pIdx++;
            } else if (/^'.*'$/.test(tok)) {
              val = tok.slice(1, -1);
            } else if (/^-?\d+(\.\d+)?$/.test(tok)) {
              val = Number(tok);
            } else if (/^null$/i.test(tok)) {
              val = null;
            } else {
              val = params[pIdx] !== undefined ? params[pIdx] : null;
              pIdx++;
            }
            row[col] = val;
          });
          // CLAVE CORRECTA: los valores de las columnas de clave primaria.
          // Bug previo: la key era el contenido de la primera columna como
          // string (el JSON completo) → las filas se acumulaban y las creds
          // nunca se reemplazaban ni se releían (WHERE id = 1 no matcheaba).
          const pk = table.__pk || [cols[0]];
          // Clave numérica autoincremental (id INTEGER PRIMARY KEY sin valor):
          // se asigna el siguiente número, como haría SQLite.
          if (pk.length === 1 && (row[pk[0]] === undefined || row[pk[0]] === null)) {
            let max = 0;
            for (const r of table.values()) {
              const n = Number(r[pk[0]]);
              if (Number.isFinite(n) && n > max) max = n;
            }
            row[pk[0]] = max + 1;
          }
          const keyVal = pk.map(c => String(row[c])).join("\u0000");
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
            // Igualdades col = ? / col = 1, con AND.
            const conds = leerCondiciones(whereClause, params);
            rows = rows.filter(r => conds.every(([col, val]) => String(r[col]) === String(val)));
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
          const whereClause = m[2] ? m[2].trim() : "";
          const conds = whereClause ? leerCondiciones(whereClause, params) : [];
          let changes = 0;
          if (conds.length) {
            // Se borran las filas que cumplen el WHERE, sin depender de cómo
            // se armó la clave interna (sirve igual con claves compuestas).
            for (const [k, r] of Array.from(table.entries())) {
              if (conds.every(([col, val]) => String(r[col]) === String(val))) {
                table.delete(k);
                changes++;
              }
            }
          } else if (!whereClause) {
            changes = table.size;
            table.clear();
          }
          this._save();
          return { changes };
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

/**
 * Puente del respaldo JSON a SQLite real.
 *
 * Caso: el bot corrió un tiempo con el respaldo en JSON (`<db>.json`) y
 * ahora arranca con SQLite real (por ejemplo, tras actualizar Node). Sin
 * esto, la sesión y los datos se quedarían en el JSON y el bot empezaría
 * de cero.
 *
 * Reglas para que nunca haga daño:
 *  - La tabla `migrations` NUNCA se copia: el esquema lo crea migrate().
 *    (Copiarla marcaba migraciones como hechas sin crear sus tablas y el
 *    bot fallaba con "no such table: settings".)
 *  - Solo se llenan tablas que existen y están VACÍAS en la base real, así
 *    que datos nuevos jamás se pisan con datos viejos.
 *  - Si se copió algo, el JSON se renombra a `.importado` para que no se
 *    vuelva a leer en el siguiente arranque.
 *
 * Llamar DESPUÉS de crear las tablas y ANTES de escribir nada en ellas.
 *
 * @param {any} db           instancia de DatabaseSync ya abierta
 * @param {string} jsonPath  ruta del archivo JSON del respaldo
 * @returns {number} filas copiadas
 */
export function importJsonFallback(db, jsonPath) {
  if (_isFallback) return 0; // el respaldo ya lee ese JSON por su cuenta
  if (!jsonPath || !fs.existsSync(jsonPath)) return 0;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch {
    return 0;
  }
  if (!raw || typeof raw !== "object") return 0;

  let total = 0;
  for (const [table, rows] of Object.entries(raw)) {
    if (table === "migrations" || table.startsWith("__")) continue;
    if (!/^[a-zA-Z0-9_]+$/.test(table)) continue;
    if (!rows || typeof rows !== "object") continue;
    const filas = Object.values(rows).filter((r) => r && typeof r === "object");
    if (!filas.length) continue;

    let existe = false;
    let vacia = false;
    try {
      existe = !!db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      vacia = existe && !db.prepare(`SELECT 1 AS hay FROM ${table} LIMIT 1`).get();
    } catch {
      existe = false;
    }
    if (!existe || !vacia) continue;

    for (const row of filas) {
      const cols = Object.keys(row).filter((c) => /^[a-zA-Z0-9_]+$/.test(c));
      if (!cols.length) continue;
      const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      try {
        const r = db.prepare(sql).run(...cols.map((c) => row[c]));
        if (r && r.changes) total++;
      } catch {
        /* fila que no encaja con el esquema actual: se omite */
      }
    }
  }

  if (total > 0) {
    try {
      fs.renameSync(jsonPath, jsonPath + ".importado");
    } catch {
      /* si no se puede renombrar no pasa nada: solo se llenan tablas vacías */
    }
  }
  return total;
}

export const SQLITE_IS_FALLBACK = _isFallback;
export const DatabaseSync = _DatabaseSync;
export default { DatabaseSync };
