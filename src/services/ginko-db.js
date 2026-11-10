/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ginko-db.js — API DB compatible para comandos de economía, gacha y grupos.
//
// IMPORTANTE: sus tablas usan prefijo `g_` (g_settings, g_users, g_chats,
// g_chat_users, g_characters, g_sticker_packs) para NO colisionar con las tablas
// del sistema propio de Shin-MD (settings, users, groups_data...) que comparten
// el mismo archivo data/shin.db.
import { getDatabase } from "#db";
import { ejecutarSqlOpcional } from "#lib/db-opcional";
import { clave as claveDeIdentidad } from "#lib/lid";

let _d = null;
function db() {
  const cur = getDatabase().db;
  if (_d !== cur) {
    _d = cur;
    mem.clear();
    _d.exec("PRAGMA journal_mode = WAL");
    _d.exec("PRAGMA synchronous = NORMAL");
    init(_d);
  }
  return _d;
}

const EXTRAS = {
  g_users: [
    ["minxp", "INTEGER DEFAULT 0"], ["maxxp", "INTEGER DEFAULT 0"],
    ["streak", "INTEGER DEFAULT 0"], ["lastDailyGlobal", "INTEGER DEFAULT 0"],
    ["weeklyStreak", "INTEGER DEFAULT 0"], ["lastWeeklyGlobal", "INTEGER DEFAULT 0"],
    ["monthlyStreak", "INTEGER DEFAULT 0"], ["lastMonthlyGlobal", "INTEGER DEFAULT 0"],
    ["favorite", "TEXT DEFAULT ''"], ["claimMessage", "TEXT DEFAULT ''"],
    ["lastVote", "INTEGER DEFAULT 0"], ["jointime", "INTEGER DEFAULT 0"],
    ["reportCooldown", "INTEGER DEFAULT 0"], ["sugCooldown", "INTEGER DEFAULT 0"],
  ],
  g_chat_users: [
    ["warnings", "TEXT DEFAULT '[]'"], ["favorite", "TEXT DEFAULT ''"],
    ["weapons", "TEXT DEFAULT '{}'"], ["tools", "TEXT DEFAULT '{}'"],
    ["inventory", "TEXT DEFAULT '{}'"], ["robVictims", "TEXT DEFAULT '{}'"],
    ["lastdaily", "INTEGER DEFAULT 0"], ["lastweekly", "INTEGER DEFAULT 0"],
    ["lastmonthly", "INTEGER DEFAULT 0"], ["lastwork", "INTEGER DEFAULT 0"],
    ["lastfish", "INTEGER DEFAULT 0"], ["lasthunt", "INTEGER DEFAULT 0"],
    ["lastmine", "INTEGER DEFAULT 0"], ["lastcrime", "INTEGER DEFAULT 0"],
    ["laststeal", "INTEGER DEFAULT 0"], ["lastslut", "INTEGER DEFAULT 0"],
    ["lastadventure", "INTEGER DEFAULT 0"], ["lastdungeon", "INTEGER DEFAULT 0"],
    ["lastcoffer", "INTEGER DEFAULT 0"], ["lastcoinflip", "INTEGER DEFAULT 0"],
    ["lastroulette", "INTEGER DEFAULT 0"], ["lastslot", "INTEGER DEFAULT 0"],
    ["lastppt", "INTEGER DEFAULT 0"], ["lastApuesta", "INTEGER DEFAULT 0"],
    ["lastinvoke", "INTEGER DEFAULT 0"], ["lastClaim", "INTEGER DEFAULT 0"],
    ["lastRoll", "INTEGER DEFAULT 0"], ["lastrobwaifu", "INTEGER DEFAULT 0"],
  ],
  g_chats: [
    ["sales", "TEXT DEFAULT '{}'"], ["intercambios", "TEXT DEFAULT '[]'"],
    ["regalosPendientes", "TEXT DEFAULT '[]'"], ["timeTrade", "INTEGER DEFAULT 0"],
    ["warnLimit", "INTEGER DEFAULT 3"], ["expulsar", "INTEGER DEFAULT 0"],
  ],
  g_settings: [
    ["botprem", "INTEGER DEFAULT 0"], ["botmod", "INTEGER DEFAULT 0"],
  ],
};

const TABLA_COLS = {
  g_users: new Set([
    "id", "name", "exp", "level", "usedcommands", "pasatiempo", "description",
    "marry", "genre", "birth", "metadatos", "metadatos2", "Subs",
    ...EXTRAS.g_users.map(([c]) => c),
  ]),
  g_chats: new Set([
    "id", "isBanned", "welcome", "goodbye", "sWelcome", "sGoodbye",
    "nsfw", "alerts", "gacha", "economy", "adminonly", "primaryBot",
    "antilinks", "antistatus", "rolls", "autotr",
    ...EXTRAS.g_chats.map(([c]) => c),
  ]),
  g_chat_users: new Set([
    "chat_id", "user_id", "coins", "bank", "lastCmd", "usedTime", "afk",
    "afkReason", "health", "stamina", "magic", "characters", "stats",
    ...EXTRAS.g_chat_users.map(([c]) => c),
  ]),
  g_settings: new Set([
    "id", "self", "prefix", "commandsejecut", "newsletter_id", "nameid",
    "type", "link", "banner", "icon", "currency", "namebot", "botname",
    "owner", "menu_variant", "instagram",
    ...EXTRAS.g_settings.map(([c]) => c),
  ]),
};

function safeCol(tabla, field) {
  const f = String(field || "");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f) || !TABLA_COLS[tabla]?.has(f)) {
    throw new Error(`Columna inválida en ${tabla}: ${f}`);
  }
  return f;
}

function init(d) {
  d.exec("CREATE TABLE IF NOT EXISTS g_users (id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, usedcommands INTEGER DEFAULT 0, pasatiempo TEXT DEFAULT '', description TEXT DEFAULT '', marry TEXT DEFAULT '', genre TEXT DEFAULT '', birth TEXT DEFAULT '', metadatos TEXT, metadatos2 TEXT, Subs INTEGER DEFAULT 0)");
  d.exec("CREATE TABLE IF NOT EXISTS g_chats (id TEXT PRIMARY KEY, isBanned INTEGER DEFAULT 0, welcome INTEGER DEFAULT 0, goodbye INTEGER DEFAULT 0, sWelcome TEXT DEFAULT '', sGoodbye TEXT DEFAULT '', nsfw INTEGER DEFAULT 0, alerts INTEGER DEFAULT 1, gacha INTEGER DEFAULT 1, economy INTEGER DEFAULT 1, adminonly INTEGER DEFAULT 0, primaryBot TEXT, antilinks INTEGER DEFAULT 1, antistatus INTEGER DEFAULT 0, rolls TEXT DEFAULT '{}')");
  d.exec("CREATE TABLE IF NOT EXISTS g_chat_users (chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT 0, bank INTEGER DEFAULT 0, lastCmd INTEGER DEFAULT 0, usedTime TEXT, afk INTEGER DEFAULT -1, afkReason TEXT DEFAULT '', health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100, magic INTEGER DEFAULT 100, characters TEXT DEFAULT '[]', stats TEXT DEFAULT '{}', PRIMARY KEY (chat_id, user_id))");
  d.exec("CREATE TABLE IF NOT EXISTS g_settings (id TEXT PRIMARY KEY, self INTEGER DEFAULT 0, prefix TEXT DEFAULT '[]', commandsejecut INTEGER DEFAULT 0, newsletter_id TEXT DEFAULT '', nameid TEXT DEFAULT '', type TEXT DEFAULT 'Owner', link TEXT DEFAULT '', banner TEXT DEFAULT '', icon TEXT DEFAULT '', currency TEXT DEFAULT 'Yenes', namebot TEXT DEFAULT 'Shin', botname TEXT DEFAULT 'Shin-MD', owner TEXT DEFAULT '', menu_variant INTEGER DEFAULT 1, instagram TEXT DEFAULT 'https://www.instagram.com/__ikg.05')");
  d.exec("CREATE TABLE IF NOT EXISTS g_characters (id TEXT PRIMARY KEY, data TEXT)");
  d.exec("CREATE TABLE IF NOT EXISTS g_sticker_packs (id TEXT PRIMARY KEY, packs TEXT DEFAULT '[]')");

  ejecutarSqlOpcional(d, "ALTER TABLE g_users ADD COLUMN Subs INTEGER DEFAULT 0");
  ejecutarSqlOpcional(d, "ALTER TABLE g_chats ADD COLUMN autotr TEXT DEFAULT ''");
  ejecutarSqlOpcional(d, "ALTER TABLE g_settings ADD COLUMN menu_variant INTEGER DEFAULT 1");
  ejecutarSqlOpcional(d, "ALTER TABLE g_settings ADD COLUMN instagram TEXT DEFAULT 'https://www.instagram.com/__ikg.05'");

  for (const [tabla, columnas] of Object.entries(EXTRAS)) {
    for (const [nombre, tipo] of columnas) {
      ejecutarSqlOpcional(d, `ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${tipo}`);
    }
  }
}

/**
 * Llave con la que se guarda una persona: su teléfono si el bot lo conoce,
 * si no el JID que haya llegado. Así un mismo usuario no tiene dos filas
 * (una por teléfono y otra por LID) según cómo venga el mensaje.
 */
function claveUsuario(id) {
  if (!id) return id;
  try {
    return claveDeIdentidad(id) || id;
  } catch {
    return id;
  }
}

const mem = new Map();
function ck(t, i) { return t + ":" + i; }
function gC(k) { const e = mem.get(k); if (!e) return undefined; if (Date.now() - e.ts > e.ttl) { mem.delete(k); return undefined; } return e.d; }
function sC(k, d, t) { mem.set(k, { d, ts: Date.now(), ttl: t || 600000 }); }
function dC(k) { mem.delete(k); }
function sv(v) { if (v === null || v === undefined) return null; if (typeof v === "object") return JSON.stringify(v); if (typeof v === "boolean") return v ? 1 : 0; return v; }
function pj(v, f) { if (v == null) return f; if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return f; } }
function q(sql, ...p) { return db().prepare(sql).get(...p); }
function r(sql, ...p) { return db().prepare(sql).run(...p); }

function parseUser(u) {
  if (!u) return u;
  if (typeof u.metadatos === "string" && /^["{[]/.test(u.metadatos.trim())) {
    const parsed = pj(u.metadatos, u.metadatos);
    if (typeof parsed === "string") u.metadatos = parsed;
  }
  if (typeof u.metadatos2 === "string" && /^["{[]/.test(u.metadatos2.trim())) {
    const parsed = pj(u.metadatos2, u.metadatos2);
    if (typeof parsed === "string") u.metadatos2 = parsed;
  }
  return u;
}

function parseChat(c) {
  if (!c) return c;
  if (typeof c.rolls === "string") c.rolls = pj(c.rolls, {});
  if (typeof c.sales === "string") c.sales = pj(c.sales, {});
  if (typeof c.intercambios === "string") c.intercambios = pj(c.intercambios, []);
  if (typeof c.regalosPendientes === "string") c.regalosPendientes = pj(c.regalosPendientes, []);
  return c;
}

function parseChatUser(cu) {
  if (!cu) return cu;
  if (typeof cu.characters === "string") cu.characters = pj(cu.characters, []);
  if (typeof cu.stats === "string") cu.stats = pj(cu.stats, {});
  if (typeof cu.weapons === "string") cu.weapons = pj(cu.weapons, {});
  if (typeof cu.tools === "string") cu.tools = pj(cu.tools, {});
  if (typeof cu.inventory === "string") cu.inventory = pj(cu.inventory, {});
  if (typeof cu.robVictims === "string") cu.robVictims = pj(cu.robVictims, {});
  if (typeof cu.warnings === "string" && cu.warnings.trim().startsWith("[")) {
    cu.warnings = pj(cu.warnings, []);
  }
  return cu;
}

const gdb = {
  getUser(id) {
    if (!id) {
      return db().prepare("SELECT * FROM g_users").all().map(parseUser);
    }
    const uid = claveUsuario(id);
    const key = ck("u", uid);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    let u = q("SELECT * FROM g_users WHERE id = ?", uid);
    if (!u) {
      r("INSERT OR IGNORE INTO g_users (id) VALUES (?)", uid);
      u = q("SELECT * FROM g_users WHERE id = ?", uid);
    }
    parseUser(u);
    sC(key, u);
    return u;
  },

  setUser(id, field, val) {
    const col = safeCol("g_users", field);
    const uid = claveUsuario(id);
    dC(ck("u", uid));
    r("INSERT OR IGNORE INTO g_users (id) VALUES (?)", uid);
    return r(`UPDATE g_users SET ${col} = ? WHERE id = ?`, sv(val), uid);
  },

  getChat(id) {
    if (!id) {
      return db().prepare("SELECT * FROM g_chats").all().map(parseChat);
    }
    const key = ck("c", id);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    let c = q("SELECT * FROM g_chats WHERE id = ?", id);
    if (!c) {
      r("INSERT OR IGNORE INTO g_chats (id) VALUES (?)", id);
      c = q("SELECT * FROM g_chats WHERE id = ?", id);
    }
    parseChat(c);
    sC(key, c);
    return c;
  },

  setChat(id, field, val) {
    const col = safeCol("g_chats", field);
    dC(ck("c", id));
    r("INSERT OR IGNORE INTO g_chats (id) VALUES (?)", id);
    return r(`UPDATE g_chats SET ${col} = ? WHERE id = ?`, sv(val), id);
  },

  getChatUser(chatId, userId) {
    if (!chatId) return null;
    if (!userId) return this.getChatUsers(chatId);
    const uid = claveUsuario(userId);
    const key = ck("cu", chatId + ":" + uid);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    let cu = q("SELECT * FROM g_chat_users WHERE chat_id = ? AND user_id = ?", chatId, uid);
    if (!cu) {
      r("INSERT OR IGNORE INTO g_chat_users (chat_id, user_id) VALUES (?, ?)", chatId, uid);
      cu = q("SELECT * FROM g_chat_users WHERE chat_id = ? AND user_id = ?", chatId, uid);
    }
    parseChatUser(cu);
    sC(key, cu);
    return cu;
  },

  getChatUsers(chatId) {
    if (!chatId) return [];
    return db().prepare("SELECT * FROM g_chat_users WHERE chat_id = ?").all(chatId).map(parseChatUser);
  },

  setChatUser(chatId, userId, field, val) {
    const col = safeCol("g_chat_users", field);
    const uid = claveUsuario(userId);
    dC(ck("cu", chatId + ":" + uid));
    r("INSERT OR IGNORE INTO g_chat_users (chat_id, user_id) VALUES (?, ?)", chatId, uid);
    return r(`UPDATE g_chat_users SET ${col} = ? WHERE chat_id = ? AND user_id = ?`, sv(val), chatId, uid);
  },

  getSettings(id) {
    if (!id) {
      return db().prepare("SELECT * FROM g_settings").all().map(s => {
        if (s.prefix && typeof s.prefix === "string") s.prefix = pj(s.prefix, []);
        return s;
      });
    }
    const key = ck("s", id);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    let s = q("SELECT * FROM g_settings WHERE id = ?", id);
    if (!s) {
      r("INSERT OR IGNORE INTO g_settings (id) VALUES (?)", id);
      s = q("SELECT * FROM g_settings WHERE id = ?", id);
    }
    if (s && s.prefix && typeof s.prefix === "string") s.prefix = pj(s.prefix, []);
    sC(key, s, 300000);
    return s;
  },

  setSettings(id, field, val) {
    const col = safeCol("g_settings", field);
    dC(ck("s", id));
    r("INSERT OR IGNORE INTO g_settings (id) VALUES (?)", id);
    let st = val;
    if (val === true) st = 1;
    else if (val === false) st = 0;
    else if (val !== null && typeof val === "object") st = JSON.stringify(val);
    return r(`UPDATE g_settings SET ${col} = ? WHERE id = ?`, st, id);
  },

  setCreate(tbl, identifier, field, value) {
    const tableKey = String(tbl || "").startsWith("g_") ? tbl : `g_${tbl}`;
    const singleId = Array.isArray(identifier) ? identifier[0] : identifier;
    const methods = {
      g_users: { get: (i) => this.getUser(i), set: (i, f, v) => this.setUser(i, f, v) },
      g_chats: { get: (i) => this.getChat(i), set: (i, f, v) => this.setChat(i, f, v) },
      g_chat_users: {
        get: (i) => this.getChatUser(i[0], i[1]),
        set: (i, f, v) => this.setChatUser(i[0], i[1], f, v),
      },
      g_settings: { get: (i) => this.getSettings(i), set: (i, f, v) => this.setSettings(i, f, v) },
      g_characters: { get: (i) => this.getCharacter(i), set: (i, f, v) => this.setCharacter(i, f, v) },
      g_sticker_packs: { get: (i) => this.getStickersPack(i), set: (i, f, v) => this.setStickersPack(i, f, v) },
    };
    const m = methods[tableKey];
    if (!m) return value;
    const key = tableKey === "g_chat_users" ? identifier : singleId;
    if (tableKey === "g_chat_users" && (!Array.isArray(key) || !key[0] || !key[1])) return value;
    const current = m.get(key);
    if (!current || current[field] === undefined || current[field] === null) {
      m.set(key, field, value);
      return value;
    }
    return current[field];
  },

  getCharacter(id) {
    if (!id) {
      return db().prepare("SELECT * FROM g_characters").all().map(row => ({ id: row.id, ...pj(row.data, {}) }));
    }
    const key = ck("ch", id);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    const row = q("SELECT * FROM g_characters WHERE id = ?", id);
    const parsed = row ? pj(row.data, {}) : null;
    if (parsed !== null) sC(key, parsed);
    return parsed;
  },

  setCharacter(id, fieldOrObj, val) {
    if (!id) return null;
    dC(ck("ch", id));
    let next;
    if (fieldOrObj !== null && typeof fieldOrObj === "object" && !Array.isArray(fieldOrObj)) {
      next = fieldOrObj;
    } else {
      const existing = this.getCharacter(id) || {};
      existing[String(fieldOrObj)] = val;
      next = existing;
    }
    r("INSERT OR REPLACE INTO g_characters (id, data) VALUES (?, ?)", id, JSON.stringify(next));
    return next;
  },

  getCharacters(id) {
    const c = q("SELECT * FROM g_characters WHERE id = ?", id);
    return c ? pj(c.data, {}) : null;
  },

  getStickersPack(id) {
    if (!id) {
      return db().prepare("SELECT * FROM g_sticker_packs").all().map(row => ({
        id: row.id,
        packs: pj(row.packs, []),
      }));
    }
    const uid = claveUsuario(id);
    const key = ck("sp", uid);
    const ca = gC(key);
    if (ca !== undefined) return ca;
    let row = q("SELECT * FROM g_sticker_packs WHERE id = ?", uid);
    if (!row) {
      r("INSERT OR IGNORE INTO g_sticker_packs (id, packs) VALUES (?, '[]')", uid);
      row = q("SELECT * FROM g_sticker_packs WHERE id = ?", uid);
    }
    const out = { id: uid, packs: pj(row?.packs, []) };
    sC(key, out);
    return out;
  },

  setStickersPack(id, fieldOrVal, val) {
    if (!id) return null;
    const uid = claveUsuario(id);
    dC(ck("sp", uid));
    const packs = typeof fieldOrVal === "string" && val !== undefined ? val : fieldOrVal;
    r("INSERT OR IGNORE INTO g_sticker_packs (id, packs) VALUES (?, '[]')", uid);
    return r("UPDATE g_sticker_packs SET packs = ? WHERE id = ?", sv(Array.isArray(packs) ? packs : []), uid);
  },

  getStickerPacks(id) {
    const uid = claveUsuario(id);
    const p = q("SELECT * FROM g_sticker_packs WHERE id = ?", uid);
    return p ? pj(p.packs, []) : [];
  },

  setStickerPacks(id, packs) {
    const uid = claveUsuario(id);
    dC(ck("sp", uid));
    r("INSERT OR IGNORE INTO g_sticker_packs (id, packs) VALUES (?, '[]')", uid);
    return r("UPDATE g_sticker_packs SET packs = ? WHERE id = ?", sv(packs), uid);
  },

  deletedb(tbl, id1, id2) {
    const kind = String(tbl || "").toLowerCase().replace(/^g_/, "");
    if (kind === "chatuser" || kind === "chat_users") {
      if (!id1 || !id2) return { changes: 0 };
      const uid = claveUsuario(id2);
      dC(ck("cu", id1 + ":" + uid));
      dC(ck("cu", id1 + ":" + id2));
      const res = r("DELETE FROM g_chat_users WHERE chat_id = ? AND (user_id = ? OR user_id = ?)", id1, uid, id2);
      return res;
    }
    if (kind === "user" || kind === "users") {
      const uid = claveUsuario(id1);
      dC(ck("u", uid));
      dC(ck("u", id1));
      return r("DELETE FROM g_users WHERE id = ? OR id = ?", uid, id1);
    }
    if (kind === "chat" || kind === "chats") {
      dC(ck("c", id1));
      return r("DELETE FROM g_chats WHERE id = ?", id1);
    }
    if (kind === "character" || kind === "characters") {
      dC(ck("ch", id1));
      return r("DELETE FROM g_characters WHERE id = ?", id1);
    }
    if (kind === "settings") {
      dC(ck("s", id1));
      return r("DELETE FROM g_settings WHERE id = ?", id1);
    }
    return { changes: 0 };
  },

  // La caché es de filas completas: si una cuenta se fusiona con otra
  // (LID -> teléfono) hay que vaciarla o se seguiría sirviendo la copia
  // vieja. La llama #storage/identities al terminar una fusión.
  limpiarCache() { mem.clear(); },

  /**
   * @param {{ chatId?: string, senderId?: string, botId?: string, pushName?: string, isGroup?: boolean, isCommand?: boolean, now?: number }} [opts]
   */
  recordActivity({ chatId = "", senderId = "", botId = "", pushName = "", isGroup = false, isCommand = false, now = Date.now() } = {}) {
    if (!senderId) return;
    try {
      const uid = claveUsuario(senderId);
      const u = this.getUser(uid);
      const cleanName = typeof pushName === "string" ? pushName.trim() : "";
      const nextExp = (u?.exp || 0) + (isCommand ? 15 : 8);
      const nextCmds = (u?.usedcommands || 0) + (isCommand ? 1 : 0);
      dC(ck("u", uid));
      if (cleanName && cleanName !== u?.name) {
        r("UPDATE g_users SET name = ?, exp = ?, usedcommands = ? WHERE id = ?", cleanName, nextExp, nextCmds, uid);
      } else {
        r("UPDATE g_users SET exp = ?, usedcommands = ? WHERE id = ?", nextExp, nextCmds, uid);
      }

      if (isGroup && chatId) {
        const cu = this.getChatUser(chatId, uid);
        const today = new Date(now).toISOString().slice(0, 10);
        const stats = cu?.stats && typeof cu.stats === "object" && !Array.isArray(cu.stats) ? { ...cu.stats } : {};
        const day = stats[today] || { msgs: 0, cmds: 0 };
        day.msgs = (day.msgs || 0) + 1;
        if (isCommand) day.cmds = (day.cmds || 0) + 1;
        stats[today] = day;
        const keys = Object.keys(stats).sort();
        if (keys.length > 35) {
          for (const old of keys.slice(0, keys.length - 35)) delete stats[old];
        }
        dC(ck("cu", chatId + ":" + uid));
        if (isCommand) {
          r(
            "UPDATE g_chat_users SET stats = ?, lastCmd = ?, usedTime = ? WHERE chat_id = ? AND user_id = ?",
            JSON.stringify(stats),
            now,
            String(now),
            chatId,
            uid
          );
        } else {
          r("UPDATE g_chat_users SET stats = ? WHERE chat_id = ? AND user_id = ?", JSON.stringify(stats), chatId, uid);
        }
      }

      if (isCommand && botId) {
        const st = this.getSettings(botId);
        dC(ck("s", botId));
        r("UPDATE g_settings SET commandsejecut = ? WHERE id = ?", (st?.commandsejecut || 0) + 1, botId);
      }
    } catch {}
  },
};

export default gdb;
