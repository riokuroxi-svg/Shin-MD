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
import { randomBytes, createHash } from "crypto";

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
      return this.db._runStatement(this.sql, params);
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
      this.transactionSnapshot = null;
      this.degraded = false;
      if (!this.isMemory && fs.existsSync(filename)) {
        throw new Error("SQLite real existe; el fallback JSON no puede abrirlo sin riesgo de divergencia: " + filename);
      }
      this._load();
    }

    _snapshot() {
      return new Map([...this.tables].map(([name, table]) => {
        const copy = /** @type {any} */ (new Map([...table].map(([key, row]) => [key, structuredClone(row)])));
        if (table.__pk) copy.__pk = [...table.__pk];
        return [name, copy];
      }));
    }

    _load() {
      if (this.isMemory) return;
      const jsonPath = this.filename + ".json";
      try {
        let text;
        try { text = fs.readFileSync(jsonPath, "utf8"); }
        catch (err) { if (err.code === "ENOENT") return; throw err; }
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Formato JSON inválido");
        const pks = raw[META_PK] || {};
        for (const [k, v] of Object.entries(raw)) {
          if (k === META_PK) continue;
          if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Tabla JSON inválida: " + k);
          const t = /** @type {any} */ (new Map(Object.entries(v)));
          if (Array.isArray(pks[k])) t.__pk = pks[k];
          this.tables.set(k, t);
        }
      } catch (err) {
        this.degraded = true;
        throw new Error("No se pudo leer almacenamiento JSON; se preservó el archivo", { cause: err });
      }
    }

    _save() {
      if (this.isMemory || this.transactionSnapshot) return;
      let temp;
      let fd;
      try {
        const dir = path.dirname(this.filename);
        fs.mkdirSync(dir, { recursive: true });
        const obj = {};
        const pks = {};
        for (const [tName, map] of this.tables.entries()) {
          obj[tName] = Object.fromEntries(map.entries());
          if (map.__pk) pks[tName] = map.__pk;
        }
        if (Object.keys(pks).length) obj[META_PK] = pks;
        temp = this.filename + ".json.tmp-" + randomBytes(12).toString("hex");
        fd = fs.openSync(temp, "wx", 0o600);
        fs.writeFileSync(fd, JSON.stringify(obj, null, 2), "utf8");
        fs.fsyncSync(fd);
        fs.closeSync(fd); fd = undefined;
        fs.renameSync(temp, this.filename + ".json");
        temp = undefined;
        this.degraded = false;
      } catch (err) {
        this.degraded = true;
        throw new Error("No se pudo persistir almacenamiento JSON", { cause: err });
      } finally {
        if (fd !== undefined) try { fs.closeSync(fd); } catch {}
        if (temp) try { fs.unlinkSync(temp); } catch {}
      }
    }

    _runStatement(sql, params) {
      const before = this.transactionSnapshot ? null : this._snapshot();
      try { return this._execStatement(sql, params, "run"); }
      catch (err) { if (before) this.tables = before; throw err; }
    }

    exec(sql) {
      const stmts = sql.split(";").map(s => s.trim()).filter(Boolean);
      for (const s of stmts) {
        this._runStatement(s, []);
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

      if (/^begin(?:\s|$)/.test(lower)) {
        if (this.transactionSnapshot) throw new Error("Transacción ya iniciada");
        this.transactionSnapshot = this._snapshot();
        return null;
      }
      if (/^commit(?:\s|$)/.test(lower)) {
        if (!this.transactionSnapshot) throw new Error("No hay transacción activa");
        const snapshot = this.transactionSnapshot;
        this.transactionSnapshot = null;
        try { this._save(); } catch (err) { this.tables = snapshot; throw err; }
        return null;
      }
      if (/^rollback(?:\s|$)/.test(lower)) {
        if (!this.transactionSnapshot) throw new Error("No hay transacción activa");
        this.tables = this.transactionSnapshot;
        this.transactionSnapshot = null;
        return null;
      }
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

      // INSERT / INSERT OR REPLACE / INSERT OR IGNORE
      if (lower.startsWith("insert")) {
        // OR IGNORE faltaba: ginko-db crea las filas con
        // `INSERT OR IGNORE INTO g_users (id) VALUES (?)`, así que sin esta
        // rama la fila NO se creaba y getUser/getChat/getSettings devolvían
        // undefined para siempre (el bot parecía sano y perdía los datos).
        const m = sql.match(/insert\s+(?:or\s+(replace|ignore)\s+into|into)\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*values/i);
        if (m) {
          const esIgnore = /or\s+ignore/i.test(sql);
          const tableName = m[2];
          const cols = m[3].split(",").map(c => c.trim().toLowerCase());
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
          if (esIgnore && table.has(keyVal)) {
            // Como SQLite: la fila existente se queda como está.
            return { changes: 0, lastInsertRowid: 0 };
          }
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

      // UPDATE ... SET col = ?, col2 = valor WHERE ...
      // Faltaba por completo: `db.prepare("UPDATE g_users SET coins = ? WHERE
      // id = ?").run(...)` devolvía null y NO escribía nada. En el respaldo
      // JSON eso significa que el bot guardaba en el vacío (economía, XP,
      // warnings, ajustes). Se implementa con el mismo lector de condiciones
      // que SELECT/DELETE, respetando los literales del SET.
      if (lower.startsWith("update")) {
        const m = sql.match(/update\s+([a-zA-Z0-9_]+)\s+set\s+(.+?)(?:\s+where\s+(.+))?\s*$/i);
        if (m) {
          const tableName = m[1];
          const setClause = m[2].trim();
          const whereClause = m[3] ? m[3].trim() : "";
          const table = this._getTable(tableName);

          // "a = ?, b = 0, c = 'x'" → [[a, "?"], [b, "0"], [c, "'x'"]]
          const asignaciones = [];
          let pIdx = 0;
          for (const trozo of setClause.split(",")) {
            const am = trozo.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+?)\s*$/);
            if (!am) continue;
            const col = am[1].toLowerCase();
            const tok = am[2];
            let valor;
            if (tok === "?") {
              valor = params[pIdx] !== undefined ? params[pIdx] : null;
              pIdx++;
            } else if (/^'.*'$/.test(tok)) {
              valor = tok.slice(1, -1);
            } else if (/^-?\d+(\.\d+)?$/.test(tok)) {
              valor = Number(tok);
            } else if (/^null$/i.test(tok)) {
              valor = null;
            } else if (/^(true|false)$/i.test(tok)) {
              valor = /^true$/i.test(tok) ? 1 : 0;
            } else {
              valor = params[pIdx] !== undefined ? params[pIdx] : null;
              pIdx++;
            }
            asignaciones.push([col, valor]);
          }

          const conds = whereClause ? leerCondiciones(whereClause, params.slice(pIdx)) : [];
          let changes = 0;
          for (const [k, fila] of table.entries()) {
            const coincide = conds.length
              ? conds.every(([col, val]) => String(fila[col]) === String(val))
              : true;
            if (!coincide) continue;
            for (const [col, valor] of asignaciones) fila[col] = valor;
            table.set(k, fila);
            changes++;
          }
          if (changes) this._save();
          return { changes, lastInsertRowid: 0 };
        }
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
      if (this.transactionSnapshot) { this.tables = this.transactionSnapshot; this.transactionSnapshot = null; }
    }
  }

  _DatabaseSync = UniversalDatabaseSync;
}

/** Copia transaccional verificable. El JSON original nunca se mueve ni borra. */
export function importJsonFallback(db, jsonPath) {
  if (_isFallback) return 0;
  return importJsonFallbackToDatabase(db, jsonPath);
}

// Exportada para verificar el contrato con una base sintética sin iniciar el bot.
export function importJsonFallbackToDatabase(db, jsonPath) {
  if (!jsonPath) return 0;
  let bytes;
  try { bytes = fs.readFileSync(jsonPath); }
  catch (err) { if (err.code === "ENOENT") return 0; throw err; }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const raw = JSON.parse(bytes.toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Formato de respaldo JSON inválido");
  let total = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS shin_json_imports (source TEXT PRIMARY KEY, digest TEXT NOT NULL)");
    const sourceKey = path.basename(jsonPath);
    const previous =
      db.prepare("SELECT digest FROM shin_json_imports WHERE source = ?").get(sourceKey) ||
      (sourceKey !== jsonPath ? db.prepare("SELECT digest FROM shin_json_imports WHERE source = ?").get(jsonPath) : undefined);
    if (previous) {
      if (previous.digest !== hash) throw new Error("El respaldo JSON cambió después de importarse; requiere revisión manual");
      db.exec("COMMIT");
      return 0;
    }
    for (const [table, rows] of Object.entries(raw)) {
      if (table === "migrations" || table.startsWith("__")) continue;
      if (!/^[a-zA-Z0-9_]+$/.test(table) || !rows || typeof rows !== "object" || Array.isArray(rows)) throw new Error("Tabla inválida en respaldo JSON");
      const entries = Object.values(rows);
      if (!entries.length) continue;
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) throw new Error("Falta tabla de destino: " + table);
      if (db.prepare(`SELECT 1 AS hay FROM "${table}" LIMIT 1`).get()) throw new Error("Destino no vacío, requiere revisión manual: " + table);
      for (const row of entries) {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Fila inválida en " + table);
        const cols = Object.keys(row);
        if (!cols.length || cols.some(c => !/^[a-zA-Z0-9_]+$/.test(c))) throw new Error("Columna inválida en " + table);
        const names = cols.map(c => `"${c}"`).join(", ");
        const values = cols.map(c => row[c]);
        const result = db.prepare(`INSERT INTO "${table}" (${names}) VALUES (${cols.map(() => "?").join(", ")})`).run(...values);
        if (Number(result.changes) !== 1) throw new Error("No se insertó una fila en " + table);
        const where = cols.map(c => `"${c}" IS ?`).join(" AND ");
        if (!db.prepare(`SELECT 1 AS hay FROM "${table}" WHERE ${where} LIMIT 1`).get(...values)) throw new Error("No se verificó la fila en " + table);
        total++;
      }
    }
    if (total) db.prepare("INSERT INTO shin_json_imports (source, digest) VALUES (?, ?)").run(sourceKey, hash);
    db.exec("COMMIT");
    return total;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw new Error("Migración JSON cancelada; original conservado y revisión necesaria", { cause: err });
  }
}

export const SQLITE_IS_FALLBACK = _isFallback;
export const DatabaseSync = _DatabaseSync;
export default { DatabaseSync };
