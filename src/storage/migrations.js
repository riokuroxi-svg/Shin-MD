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
      // Safe column adds (SQLite doesn't support IF NOT EXISTS for columns)
      const columns = [
        'coins', 'bank', 'exp', 'health', 'stamina', 'magic',
        'birth', 'genre', 'description', 'pasatiempo', 'marry',
        'inventory', 'tools', 'weapons', 'streak', 'last_daily_global'
      ];
      for (const col of columns) {
        try {
          db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`);
        } catch {}
      }
      // Numeric defaults for specific columns
      try { db.exec(`ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN bank INTEGER NOT NULL DEFAULT 0`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN exp INTEGER NOT NULL DEFAULT 0`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN health INTEGER NOT NULL DEFAULT 100`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN stamina INTEGER NOT NULL DEFAULT 100`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`); } catch {}
      try { db.exec(`ALTER TABLE users ADD COLUMN last_daily_global INTEGER NOT NULL DEFAULT 0`); } catch {}

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
];

export default MIGRATIONS;