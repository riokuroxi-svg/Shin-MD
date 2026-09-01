// ═══════════════════════════════════════════════════════════════════
//  database.js — SQLite nativo (node:sqlite) con caché en memoria
//  Tablas: users, chats, chat_users, settings, characters, sticker_packs
//  Requiere Node >= 22.5.0
// ═══════════════════════════════════════════════════════════════════

import path from "path";
import { DatabaseSync } from "node:sqlite";

const dbPath = path.join(process.cwd(), "database.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA cache_size = -32000");
db.exec("PRAGMA busy_timeout = 5000");

const stmts = {};
function stmt(sql) {
  if (!stmts[sql]) stmts[sql] = db.prepare(sql);
  return stmts[sql];
}

class TtlCache {
  map = new Map();
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > entry.ttl) {
      this.map.delete(key);
      return undefined;
    }
    return entry.data;
  }
  set(key, data, ttl) {
    this.map.set(key, { data, ts: Date.now(), ttl });
  }
  delete(key) { this.map.delete(key); }
  deletePrefix(prefix) {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
  clear() { this.map.clear(); }
}

const memCache = new TtlCache();
const TTL = { USER: 600000, CHAT: 600000, CHATUSER: 600000, SET: 300000, CHAR: 600000, PACK: 600000 };

function toStore(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val === "boolean") return val ? 1 : 0;
  return val;
}

function parseJSON(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function ck(type, id) { return `${type}:${id}`; }

// ── Esquemas por defecto ──────────────────────────────────────────
export const defUser = {
  name: "", exp: 0, level: 0, usedcommands: 0,
  pasatiempo: "", description: "", marry: "", genre: "", birth: "",
  metadatos: null, metadatos2: null,
};

export const defChat = {
  isBanned: 0, welcome: 0, goodbye: 0, sWelcome: "", sGoodbye: "",
  nsfw: 0, alerts: 1, gacha: 1, economy: 1, adminonly: 0,
  primaryBot: null, antilinks: 1, antistatus: 0, rolls: "{}",
};

export const defChatUser = {
  coins: 0, bank: 0, lastCmd: 0, usedTime: null,
  afk: -1, afkReason: "", health: 100, stamina: 100, magic: 100,
  characters: "[]", stats: "{}",
};

export const defSets = {
  self: 0, prefix: '["/","!",".","#"]', commandsejecut: 0,
  newsletter_id: "", nameid: "", type: "Owner", link: "", banner: "", icon: "",
  currency: "Yenes", namebot: "Shin", botname: "Shin-MD", owner: "",
};

export const defStickerPack = { packs: "[]" };

// ── Inicialización ────────────────────────────────────────────────
export function initDB() {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0, usedcommands INTEGER DEFAULT 0,
    pasatiempo TEXT DEFAULT '', description TEXT DEFAULT '',
    marry TEXT DEFAULT '', genre TEXT DEFAULT '', birth TEXT DEFAULT '',
    metadatos TEXT, metadatos2 TEXT)`);

  db.exec(`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY, isBanned BOOLEAN DEFAULT 0,
    welcome BOOLEAN DEFAULT 0, goodbye BOOLEAN DEFAULT 0,
    sWelcome TEXT DEFAULT '', sGoodbye TEXT DEFAULT '',
    nsfw BOOLEAN DEFAULT 0, alerts BOOLEAN DEFAULT 1,
    gacha BOOLEAN DEFAULT 1, economy BOOLEAN DEFAULT 1,
    adminonly BOOLEAN DEFAULT 0, primaryBot TEXT,
    antilinks BOOLEAN DEFAULT 1, antistatus BOOLEAN DEFAULT 0,
    rolls TEXT DEFAULT '{}')`);

  db.exec(`CREATE TABLE IF NOT EXISTS chat_users (
    chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT 0,
    bank INTEGER DEFAULT 0, lastCmd INTEGER DEFAULT 0,
    usedTime TEXT, afk INTEGER DEFAULT -1, afkReason TEXT DEFAULT '',
    health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100,
    magic INTEGER DEFAULT 100, characters TEXT DEFAULT '[]',
    stats TEXT DEFAULT '{}', PRIMARY KEY (chat_id, user_id))`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY, self BOOLEAN DEFAULT 0,
    prefix TEXT DEFAULT '["/","!",".","#"]',
    commandsejecut INTEGER DEFAULT 0, newsletter_id TEXT DEFAULT '',
    nameid TEXT DEFAULT '', type TEXT DEFAULT 'Owner',
    link TEXT DEFAULT '', banner TEXT DEFAULT '', icon TEXT DEFAULT '',
    currency TEXT DEFAULT 'Yenes', namebot TEXT DEFAULT 'Shin',
    botname TEXT DEFAULT 'Shin-MD', owner TEXT DEFAULT '')`);

  db.exec(`CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, packs TEXT DEFAULT '[]')`);
}

// ── CRUD: Users ───────────────────────────────────────────────────
export function getUser(id, opt = {}) {
  if (!id) {
    const { orderBy, limit = null, desc = true } = opt;
    if (orderBy) {
      const allowed = ["exp", "level", "usedcommands", "name"];
      if (!allowed.includes(orderBy)) throw new Error("Columna no permitida");
      let q = `SELECT * FROM users ORDER BY ${orderBy} ${desc ? "DESC" : "ASC"}`;
      if (limit) q += ` LIMIT ${limit}`;
      return stmt(q).all();
    }
    return stmt("SELECT * FROM users").all();
  }
  const key = ck("user", id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;

  let user = stmt("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) {
    stmt(`INSERT OR IGNORE INTO users (id, name, exp, level, usedcommands, pasatiempo, description, marry, genre, birth, metadatos, metadatos2) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, defUser.name, defUser.exp, defUser.level, defUser.usedcommands, defUser.pasatiempo, defUser.description, defUser.marry, defUser.genre, defUser.birth, defUser.metadatos, defUser.metadatos2);
    user = stmt("SELECT * FROM users WHERE id = ?").get(id);
  }
  if (user.metadatos) { try { user.metadatos = JSON.parse(user.metadatos); } catch {} }
  if (user.metadatos2) { try { user.metadatos2 = JSON.parse(user.metadatos2); } catch {} }
  memCache.set(key, user, TTL.USER);
  return user;
}

export function setUser(id, field, val) {
  if (!stmt("SELECT id FROM users WHERE id = ?").get(id)) return;
  memCache.delete(ck("user", id));
  return stmt(`UPDATE users SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

// ── CRUD: Chats ──────────────────────────────────────────────────
export function getChat(id) {
  if (!id) return stmt("SELECT * FROM chats").all();
  const key = ck("chat", id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;

  let chat = stmt("SELECT * FROM chats WHERE id = ?").get(id);
  if (!chat) {
    stmt(`INSERT OR IGNORE INTO chats (id, isBanned, welcome, goodbye, sWelcome, sGoodbye, nsfw, alerts, gacha, economy, adminonly, primaryBot, antilinks, antistatus, rolls) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, defChat.isBanned, defChat.welcome, defChat.goodbye, defChat.sWelcome, defChat.sGoodbye, defChat.nsfw, defChat.alerts, defChat.gacha, defChat.economy, defChat.adminonly, defChat.primaryBot, defChat.antilinks, defChat.antistatus, defChat.rolls);
    chat = stmt("SELECT * FROM chats WHERE id = ?").get(id);
  }
  chat.rolls = parseJSON(chat.rolls, {});
  memCache.set(key, chat, TTL.CHAT);
  return chat;
}

export function setChat(id, field, val) {
  if (!stmt("SELECT id FROM chats WHERE id = ?").get(id)) return;
  memCache.delete(ck("chat", id));
  return stmt(`UPDATE chats SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

// ── CRUD: ChatUser ────────────────────────────────────────-──────
export function getChatUser(chatId, userId, opt = {}) {
  if (!chatId) {
    return stmt("SELECT * FROM chat_users").all().map(u => {
      u.characters = parseJSON(u.characters, []);
      u.stats = parseJSON(u.stats, {});
      return u;
    });
  }
  if (chatId && !userId) {
    const { orderBy, limit = null, desc = true } = opt;
    const allowed = ["coins", "bank", "lastCmd", "usedTime", "afk", "health", "stamina", "magic"];
    if (orderBy && !allowed.includes(orderBy)) throw new Error("Columna no permitida");
    let q = "SELECT * FROM chat_users WHERE chat_id = ?";
    const params = [chatId];
    if (orderBy) q += ` ORDER BY ${orderBy} ${desc ? "DESC" : "ASC"}`;
    if (limit) { q += " LIMIT ?"; params.push(limit); }
    return stmt(q).all(...params).map(u => {
      u.characters = parseJSON(u.characters, []);
      u.sttas = parseJSON(u.stats, {});
      return u;
    });
  }
  const key = ck("chatuser", `${chatId}:${userId}`);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;

  let cu = stmt("SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?").get(chatId, userId);
  if (!cu) {
    stmt(`INSERT OR IGNORE INTO chat_users (chat_id, user_id, coins, bank, lastCmd, usedTime, afk, aFkReason, health, stamina, magic, characters, stats) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(chatId, userId, defChatUser.coins, defChatUser.bank, defChatUser.lasCmd, defChatUser.usedTime, defChatUser.afk, defChatUser.afkReason, defChatUser.health, defChatUser.stamina, defChatUser.magic, defChatUser.characters, defChatUser.stats);
    cu = stmt("SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?").get(chatId, userId);
  }
  if (cu) {
    cu.characters = parseJSON(cu.characters, []);
    cu.stats = parseJSON(cu.stas, {});
    memCache.set(key, cu, TTL.CHATUSR);
  }
  return cu;
}

export function setChatUser(chatId, userId, field, val) {
  memCache.delete(ck("chatuser", `${chatId}:${userId}`));
  return stmt(`UPDATE chat_users SET ${field} = ? WHERE chat_id = ? AND user_id = ?`).run(toStore(val), chatId, userId);
}

// ── Settings ──────────────────────────────────────────────────────
export function getSettings(id) {
  if (!id) {
    return stmt("SELECT * FROM settings").all().map(row => {
      row.prefix = parseJSON(row.prefix, []);
      return row;
    });
  }
  const key = ck("set", id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;

  let row = stmt("SELECT * FROM settings WHERE id = ?").get(id);
  if (!row) {
    stmt(`INSERT OR IGNORE INTO settings (id, self, prefix, commandsejecut, newsletter_id, nameid, type, link, banner, icon, currency, namebot, botname, owner) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, defSets.self, defSets.prefix, defSets.commandsejecut, defSets.newsletter_id, defSets.nameid, defSets.type, defSets.link, defSets.banner, defSets.icon, defSets.currency, defSets.namebot, defSets.botname, defSets.owner);
    row = stmt("SELECT * FROM settings WHERE id = ?").get(id);
  }
  if (row.prefix != null) {
    try { row.prefix = JSON.parse(row.prefix); } catch { row.prefix = row.prefix === "true" || row.prefix === "1" ? true : []; }
  }
  memCache.set(key, row, 300000);
  return row;
}

export function setSettings(id, field, val) {
  if (!stmt("SELECT id FROM settings WHERE id = ?").get(id)) return;
  memCache.delete(ck("set", id));
  let stored = val;
  if (val === true) stored = "1";
  else if (Array.isArray(val) || typeof val === "object") stored = JSON.stringify(val);
  return stmt(`UPDATE settings SET ${field} = ? WHERE id = ?`).run(stored, id);
}

// ── Characters ────────────────────────────────────────────────────
export function getCharacter(id) {
  const key = ck("char", id || "all");
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  if (!id) {
    const rows = stmt("SELECT id, data FROM characters").all();
    const chars = {};
    for (const r of rows) chars[r.id] = parseJSON(r.data, r.data);
    memCache.set(key, chars, 600000);
    return chars;
  }
  const row = stmt("SELECT data FROM characters WHERE id = ?").get(id);
  if (!row) return null;
  const data = parseJSON(row.data, row.data);
  memCache.set(key, data, 600000);
  return data;
}

export function setCharacter(id, data) {
  memCache.delete(ck("char", id));
  stmt("REPLACE INTO characters (id, data) VALUES (?, ?)").run(id, toStore(data));
  return true;
}

// ── Sticker Packs ─────────────────────────────────────────────────
export function getStickersPack(id) {
  if (!id) return stmt("SELECT * FROM sticker_packs").all();
  const key = ck("stickerpack", id);
  const cached = memCache.get(key);
  if (cached !== undefined) return cached;
  let sp = stmt("SELECT * FROM sticker_packs WHERE id = ?").get(id);
  if (!sp) {
    stmt("INSERT OR IGNORE INTO sticker_packs (id, packs) VALUES (?, ?)").run(id, defStickerPack.packs);
    sp = stmt("SELECT * FROM sticker_packs WHERE id = ?").get(id);
  }
  sp.packs = parseJSON(sp.packs, []);
  memCache.set(key, sp, 600000);
  return sp;
}

export function setStickersPack(id, field, val) {
  if (!stmt("SELECT id FROM sticker_packs WHERE id = ?").get(id)) return;
  memCache.delete(ck("stickerpack", id));
  return stmt(`UPDATE sticker_packs SET ${field} = ? WHERE id = ?`).run(toStore(val), id);
}

// ── Delete ────────────────────────────────────────────────────────
export function deletedb(type, ...ids) {
  if (!type || !ids || ids.length === 0) return false;
  switch (type) {
    case "user": memCache.delete(ck("user", ids[0])); return stmt("DELETE FROM users WHERE id = ?").run(ids[0]).changes > 0;
    case "chat": memCache.delete(ck("chat", ids[0])); return stmt("DELETE FROM chats WHERE id = ?").run(ids[0]).changes > 0;
    case "chatuser":
      if (ids.length < 2) return false;
      memCache.delete(ck("chatuser", ids[0] + ":" + ids[1]));
      return stmt("DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?").run(ids[0], ids[1]).changes > 0;
    case "settings": memCache.delete(ck("set", ids[0])); return stmt("DELETE FROM settings WHERE id = ?").run(ids[0]).changes > 0;
    case "character": memCache.delete(ck("char", ids[0])); return stmt("DELETE FROM characters WHERE id = ?").run(ids[0]).changes > 0;
    case "stickerpack": memCache.delete(ck("stickerpack", ids[0])); return stmt("DELETE FROM sticker_packs WHERE id = ?").run(ids[0]).changes > 0;
    default: return false;
  }
}

// ── Cache helpers ─────────────────────────────────────────────────
export function clearCache(type, id) {
  if (!type && !id) { memCache.clear(); return true; }
  if (id) memCache.delete(ck(type, id));
  else memCache.deletePrefix(type + ":");
}

export function clearDB() {
  if (global.__dbCleanupStarted) return;
  global.__dbCleanupStarted = true;
  const INACTIVE_MS = 20 * 86400000;
  setInterval(() => {
    const now = Date.now();
    for (const cu of stmt("SELECT chat_id, user_id, usedTime, lastCmd FROM chat_users").all()) {
      const last = cu.lastCmd > 0 ? cu.lastCmd : (cu.usedTime ? new Date(JSON.parse(cu.usedTime)).getTime() : 0);
      if (last === 0 || now - last > INACTIVE_MS) {
        stmt("DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?").run(cu.chat_id, cu.user_id);
        memCache.delete(ck("chatuser", cu.chat_id + ":" + cu.user_id));
      }
    }
    for (const u of stmt("SELECT id FROM users WHERE exp = 0 AND id NOT IN (SELECT user_id FROM chat_users)").all()) {
      stmt("DELETE FROM users WHERE id = ?").run(u.id);
      memCache.delete(ck("user", u.id));
    }
  }, 86400000);
}

export function setCreate(table, identifier, field, value) {
  // Simplified - creates column if not exists
  const colExists = (tbl, col) => {
    try { return stmt(`PRAGMA table_info(${tbl})`).all().some(c => c.name === col); } catch { return false; }
  };
  if (!colExists(table, field)) {
    const sqlType = typeof value === "number" ? "INTEGER" : typeof value === "boolean" ? "BOOLEAN" : "TEXT";
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${sqlType} DEFAULT ${JSON.stringify(value)}`);
  }
  return value;
}

// ── Auto-migración de columnas faltantes ──────────────────────────
try {
  const tables = [
    { name: "users", def: defUser, exclude: ["id"] },
    { name: "chats", def: defChat, exclude: ["id"] },
    { name: "chat_users", def: defChatUser, exclude: ["chat_id", "user_id"] },
    { name: "settings", def: defSets, exclude: ["id"] },
    { name: "sticker_packs", def: defStickerPack, exclude: ["id"] },
  ];
  for (const table of tables) {
    if (!stmt(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table.name)) continue;
    const existingCols = stmt(`PRAGMA table_info(${table.name})`).all().map(c => c.name);
    const missing = Object.keys(table.def).filter(col => !existingCols.includes(col) && !table.exclude.includes(col));
    for (const col of missing) {
      const def = table.def[col];
      const sqlType = typeof def === "number" ? "INTEGER" : typeof def === "boolean" ? "BOOLEAN" : "TEXT";
      const defaultStr = def === null ? "NULL" : JSON.stringify(def);
      db.exec(`ALTER TABLE ${table.name} ADD COLUMN ${col} ${sqlType} DEFAULT ${defaultStr}`);
    }
  }
} catch (e) {
  console.error("[DB migration error]", e);
}

// Re-export default
export default {
  initDB, getUser, setUser, getChat, setChat, getChatUser, setChatUser,
  getSettings, setSettings, getCharacter, setCharacter,
  getStickersPack, setStickersPack, deletedb, setCreate, clearCache, clearDB, db
};
