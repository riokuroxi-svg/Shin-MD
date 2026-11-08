/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { ejecutarSqlOpcional } from "#lib/db-opcional";
// ═══════════════════════════════════════════════════════════════════
//  migrations.js — v2: economía, gacha, warns, user profiles
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
  {
    version: 2,
    name: "economy-gacha-profiles",
    up(db) {
      // Safe column adds (SQLite doesn't support IF NOT EXISTS for columns).
      // Ojo: las numéricas NO van en esta lista. Antes iban, se creaban como
      // TEXT y las líneas de abajo (que las querían INTEGER) no hacían nada
      // porque la columna ya existía: el saldo acababa guardado como "250.0"
      // y cualquier suma devolvía NaN. La migración 3 arregla las bases que
      // ya nacieron así.
      const columns = [
        'magic',
        'birth', 'genre', 'description', 'pasatiempo', 'marry',
        'inventory', 'tools', 'weapons'
      ];
      for (const col of columns) {
                  ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`);
      }
      // Numeric defaults for specific columns
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN bank INTEGER NOT NULL DEFAULT 0`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN exp INTEGER NOT NULL DEFAULT 0`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN health INTEGER NOT NULL DEFAULT 100`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN stamina INTEGER NOT NULL DEFAULT 100`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`);
      ejecutarSqlOpcional(db, `ALTER TABLE users ADD COLUMN last_daily_global INTEGER NOT NULL DEFAULT 0`);

      // New tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS economy_timers (
          id         TEXT PRIMARY KEY,
          chat_id    TEXT NOT NULL,
          sender     TEXT NOT NULL,
          last_daily INTEGER NOT NULL DEFAULT 0,
          last_work  INTEGER NOT NULL DEFAULT 0,
          last_fish  INTEGER NOT NULL DEFAULT 0,
          last_hunt  INTEGER NOT NULL DEFAULT 0,
          last_mine  INTEGER NOT NULL DEFAULT 0,
          last_crime INTEGER NOT NULL DEFAULT 0,
          last_rob   INTEGER NOT NULL DEFAULT 0,
          last_slot  INTEGER NOT NULL DEFAULT 0,
          last_rt    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS characters (
          id        TEXT PRIMARY KEY,
          name      TEXT NOT NULL,
          image     TEXT,
          anime     TEXT,
          rarity    TEXT NOT NULL DEFAULT 'comun',
          serie     TEXT,
          claimable INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS user_characters (
          user_jid  TEXT NOT NULL,
          char_id   TEXT NOT NULL,
          chat_id   TEXT,
          claimed_at INTEGER NOT NULL,
          favorite  INTEGER NOT NULL DEFAULT 0,
          sale_price INTEGER DEFAULT 0,
          PRIMARY KEY(user_jid, char_id)
        );

        CREATE TABLE IF NOT EXISTS group_warns (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          group_jid TEXT NOT NULL,
          warned_jid TEXT NOT NULL,
          warner_jid TEXT,
          reason    TEXT,
          warned_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS group_config (
          group_jid        TEXT PRIMARY KEY,
          welcome_msg      TEXT DEFAULT '',
          goodbye_msg      TEXT DEFAULT '',
          welcome_enabled  INTEGER NOT NULL DEFAULT 1,
          goodbye_enabled  INTEGER NOT NULL DEFAULT 1,
          antilink_enabled INTEGER NOT NULL DEFAULT 0,
          nsfw_enabled     INTEGER NOT NULL DEFAULT 0,
          economy_enabled  INTEGER NOT NULL DEFAULT 1,
          welcome_type     TEXT DEFAULT 'text'
        );
      `);
    },
  },
  {
    version: 3,
    name: "users-numerico",
    // Hasta la 2, `coins`, `bank`, `exp`, `health`, `stamina`, `streak` y
    // `last_daily_global` se creaban como TEXT. Un saldo "250.0" (texto) más
    // -50 daba NaN y se guardaba NULL: la economía se rompía sola.
    //
    // SQLite no sabe cambiar el tipo de una columna, así que la tabla se
    // recrea: se copia con CAST a entero, se tira la vieja y se renombra.
    up(db) {
      const actuales = db.prepare("PRAGMA table_info(users)").all();
      const tipo = (col) => String(actuales.find((c) => c.name === col)?.type || "").toUpperCase();
      if (tipo("coins").includes("INT")) return; // ya está bien (instalación nueva)

      const destino = [
        ["jid", "TEXT PRIMARY KEY"],
        ["name", "TEXT"],
        ["banned", "INTEGER NOT NULL DEFAULT 0"],
        ["warned", "INTEGER NOT NULL DEFAULT 0"],
        ["first_seen", "INTEGER NOT NULL DEFAULT 0"],
        ["last_seen", "INTEGER NOT NULL DEFAULT 0"],
        ["coins", "INTEGER NOT NULL DEFAULT 0"],
        ["bank", "INTEGER NOT NULL DEFAULT 0"],
        ["exp", "INTEGER NOT NULL DEFAULT 0"],
        ["health", "INTEGER NOT NULL DEFAULT 100"],
        ["stamina", "INTEGER NOT NULL DEFAULT 100"],
        ["streak", "INTEGER NOT NULL DEFAULT 0"],
        ["last_daily_global", "INTEGER NOT NULL DEFAULT 0"],
        ["magic", "TEXT DEFAULT ''"],
        ["birth", "TEXT DEFAULT ''"],
        ["genre", "TEXT DEFAULT ''"],
        ["description", "TEXT DEFAULT ''"],
        ["pasatiempo", "TEXT DEFAULT ''"],
        ["marry", "TEXT DEFAULT ''"],
        ["inventory", "TEXT DEFAULT ''"],
        ["tools", "TEXT DEFAULT ''"],
        ["weapons", "TEXT DEFAULT ''"],
      ];
      const enteros = new Set([
        "banned", "warned", "first_seen", "last_seen", "coins", "bank",
        "exp", "health", "stamina", "streak", "last_daily_global",
      ]);
      const respaldo = (col) =>
        enteros.has(col) && (col === "health" || col === "stamina") ? "100" : "0";

      // Columnas que la tabla tenga y no estén en el destino: se conservan
      // al final como TEXT, para no perder datos de nadie.
      const conocidas = new Set(destino.map(([c]) => c));
      const extra = actuales.map((c) => c.name).filter((n) => !conocidas.has(n));
      for (const col of extra) destino.push([col, "TEXT"]);

      const leer = destino.map(([col]) => {
        if (!actuales.some((c) => c.name === col)) return `'${respaldo(col)}' AS ${col}`;
        if (enteros.has(col)) {
          return `CAST(COALESCE(NULLIF(TRIM(${col}), ''), '${respaldo(col)}') AS INTEGER) AS ${col}`;
        }
        return col;
      });

      const antes = db.prepare("SELECT jid FROM users").all().length;
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec("DROP TABLE IF EXISTS users_nuevo");
        db.exec(`CREATE TABLE users_nuevo (${destino.map(([c, t]) => `${c} ${t}`).join(", ")})`);
        db.exec(`INSERT INTO users_nuevo (${destino.map(([c]) => c).join(", ")})
                 SELECT ${leer.join(", ")} FROM users`);
        db.exec("DROP TABLE users");
        db.exec("ALTER TABLE users_nuevo RENAME TO users");
        db.exec("CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned)");
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      const despues = db.prepare("SELECT jid FROM users").all().length;
      if (despues !== antes) throw new Error(`users-numerico: ${antes} filas antes, ${despues} después`);
    },
  },
];

export default MIGRATIONS;