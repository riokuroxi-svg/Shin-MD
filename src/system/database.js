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