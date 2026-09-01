// ginko-db.js — API DB de Ginko-MD para comandos porteados
import { getDatabase } from "#db";

let _d = null;
function db() {
  if (!_d) {
    const d = getDatabase();
    _d = d.db;
    _d.exec("PRAGMA journal_mode = WAL");
    _d.exec("PRAGMA synchronous = NORMAL");
    init(_d);
  }
  return _d;
}

function init(d) {
  d.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, usedcommands INTEGER DEFAULT 0, pasatiempo TEXT DEFAULT '', description TEXT DEFAULT '', marry TEXT DEFAULT '', genre TEXT DEFAULT '', birth TEXT DEFAULT '', metadatos TEXT, metadatos2 TEXT)");
  d.exec("CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, isBanned INTEGER DEFAULT 0, welcome INTEGER DEFAULT 0, goodbye INTEGER DEFAULT 0, sWelcome TEXT DEFAULT '', sGoodbye TEXT DEFAULT '', nsfw INTEGER DEFAULT 0, alerts INTEGER DEFAULT 1, gacha INTEGER DEFAULT 1, economy INTEGER DEFAULT 1, adminonly INTEGER DEFAULT 0, primaryBot TEXT, antilinks INTEGER DEFAULT 1, antistatus INTEGER DEFAULT 0, rolls TEXT DEFAULT '{}')");
  d.exec("CREATE TABLE IF NOT EXISTS chat_users (chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT 0, bank INTEGER DEFAULT 0, lastCmd INTEGER DEFAULT 0, usedTime TEXT, afk INTEGER DEFAULT -1, afkReason TEXT DEFAULT '', health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100, magic INTEGER DEFAULT 100, characters TEXT DEFAULT '[]', stats TEXT DEFAULT '{}', PRIMARY KEY (chat_id, user_id))");
  d.exec("CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, self INTEGER DEFAULT 0, prefix TEXT DEFAULT '[]', commandsejecut INTEGER DEFAULT 0, newsletter_id TEXT DEFAULT '', nameid TEXT DEFAULT '', type TEXT DEFAULT 'Owner', link TEXT DEFAULT '', banner TEXT DEFAULT '', icon TEXT DEFAULT '', currency TEXT DEFAULT 'Yenes', namebot TEXT DEFAULT 'Shin', botname TEXT DEFAULT 'Shin-MD', owner TEXT DEFAULT '')");
  d.exec("CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT)");
  d.exec("CREATE TABLE IF NOT EXISTS sticker_packs (id TEXT PRIMARY KEY, packs TEXT DEFAULT '[]')");
}

const mem = new Map();
function ck(t, i) { return t + ':' + i; }
function gC(k) { const e = mem.get(k); if (!e) return undefined; if (Date.now() - e.ts > e.ttl) { mem.delete(k); return undefined; } return e.d; }
function sC(k, d, t) { mem.set(k, {d, ts: Date.now(), ttl: t || 600000}); }
function dC(k) { mem.delete(k); }
function sv(v) { if (v===null||v===undefined) return null; if (typeof v==='object') return JSON.stringify(v); if (typeof v==='boolean') return v?1:0; return v; }
function pj(v, f) { if (v==null) return f; if (typeof v!='string') return v; try { return JSON.parse(v); } catch { return f; } }
function q(sql, ...p) { return db().prepare(sql).get(...p); }
function r(sql, ...p) { return db().prepare(sql).run(...p); }

const gdb = {
  getUser(id) {
    if (!id) return null;
    const key = ck('u', id); const ca = gC(key); if (ca !== undefined) return ca;
    let u = q('SELECT * FROM users WHERE id = ?', id);
    if (!u) { r('INSERT OR IGNORE INTO users (id) VALUES (?)', id); u = q('SELECT * FROM users WHERE id = ?', id); }
    if (u && u.metadatos && typeof u.metadatos == 'string') try { u.metadatos = JSON.parse(u.metadatos); } catch {}
    if (u && u.metadatos2 && typeof u.metadatos2 == 'string') try { u.metadatos2 = JSON.parse(u.metadatos2); } catch {}
    sC(key, u); return u;
  },
  setUser(id, field, val) { dC(ck('u', id)); return r('UPDATE users SET ' + field + ' = ? WHERE id = ?', sv(val), id); },
  getChat(id) {
    if (!id) return null;
    const key = ck('c', id); const ca = gC(key); if (ca !== undefined) return ca;
    let c = q('SELECT * FROM chats WHERE id = ?', id);
    if (!c) { r('INSERT OR IGNORE INTO chats (id) VALUES (?)', id); c = q('SELECT * FROM chats WHERE id = ?', id); }
    if (c && c.rolls && typeof c.rolls == 'string') try { c.rolls = pj(c.rolls, {}); } catch {}
    sC(key, c); return c;
  },
  setChat(id, field, val) { dC(ck('c', id)); return r('UPDATE chats SET ' + field + ' = ? WHERE id = ?', sv(val), id); },
  getChatUser(chatId, userId) {
    if (!chatId || !userId) return null;
    const key = ck('cu', chatId + ':' + userId); const ca = gC(key); if (ca !== undefined) return ca;
    let cu = q('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?', chatId, userId);
    if (!cu) { r('INSERT OR IGNORE INTO chat_users (chat_id, user_id) VALUES (?, ?)', chatId, userId); cu = q('SELECT * FROM chat_users WHERE chat_id = ? AND user_id = ?', chatId, userId); }
    if (cu && cu.characters && typeof cu.characters == 'string') try { cu.characters = pj(cu.characters, []); } catch {}
    if (cu && cu.stats && typeof cu.stats == 'string') try { cu.stats = pj(cu.stats, {}); } catch {}
    sC(key, cu); return cu;
  },
  setChatUser(chatId, userId, field, val) { dC(ck('cu', chatId + ':' + userId)); return r('UPDATE chat_users SET ' + field + ' = ? WHERE chat_id = ? AND user_id = ?', sv(val), chatId, userId); },
  getSettings(id) {
    if (!id) return null;
    const key = ck('s', id); const ca = gC(key); if (ca !== undefined) return ca;
    let s = q('SELECT * FROM settings WHERE id = ?', id);
    if (!s) { r('INSERT OR IGNORE INTO settings (id) VALUES (?)', id); s = q('SELECT * FROM settings WHERE id = ?', id); }
    if (s && s.prefix && typeof s.prefix == 'string') try { s.prefix = pj(s.prefix, []); } catch {}
    sC(key, s, 300000); return s;
  },
  setSettings(id, field, val) {
    dC(ck('s', id));
    let st = val; if (val === true) st = '1'; else if (Array.isArray(val) || typeof val == 'object') st = JSON.stringify(val);
    return r('UPDATE settings SET ' + field + ' = ? WHERE id = ?', st, id);
  },
  setCreate(tbl, identifier, field, value) {
    const methods = {
      users: { get: (i) => this.getUser(i), set: (i,f,v) => this.setUser(i,f,v) },
      chats: { get: (i) => this.getChat(i), set: (i,f,v) => this.setChat(i,f,v) },
      chat_users: { get: (i) => this.getChatUser(i[0], i[1]), set: (i,f,v) => this.setChatUser(i[0], i[1], f, v) },
      settings: { get: (i) => this.getSettings(i), set: (i,f,v) => this.setSettings(i,f,v) },
    };
    const m = methods[tbl]; if (!m) return value;
    m.set(identifier, field, value); return value;
  },
  deletedb(type, ...ids) {
    if (!type || !ids || ids.length === 0) return false;
    switch(type) {
      case 'user': dC(ck('u', ids[0])); return r('DELETE FROM users WHERE id = ?', ids[0]).changes > 0;
      case 'chat': dC(ck('c', ids[0])); return r('DELETE FROM chats WHERE id = ?', ids[0]).changes > 0;
      case 'chatuser': if (ids.length < 2) return false; dC(ck('cu', ids[0] + ':' + ids[1])); return r('DELETE FROM chat_users WHERE chat_id = ? AND user_id = ?', ids[0], ids[1]).changes > 0;
      case 'settings': dC(ck('s', ids[0])); return r('DELETE FROM settings WHERE id = ?', ids[0]).changes > 0;
      default: return false;
    }
  },
};

export default gdb;