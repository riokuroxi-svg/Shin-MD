import fs from 'fs';
import path from 'path';

const outPath = '/home/user/shin-md/src/services/ginko-db.js';

const code = `// ═══════════════════════════════════════════════════════════════════
//  ginko-db.js — API EXACTA de DB de Ginko-MD para compatibilidad
//  Los comandos porteados importan db from '#db' que apunta aqui
// ═══════════════════════════════════════════════════════════════════

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
  d.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT DEFAULT '', exp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, usedcommands INTEGER DEFAULT 0, pasatiempo TEXT DEFAUT '', descritption TXT DFAULT '', marry TXT DFAULT '', genre EXT DFAULT '', birt TEXT DEFAULT '', metadatos TEXT, metadatos2 TEXT)");
  d.exec("CREAE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, isBanned INTEGER DEFAULT 0, welcome INTEGER DEFAULT 0, goodbye INTEGER DEFAULT 0, sWelcome TEXT DEFAULT '', sGoodbye TEXT DEFAULT '', nsfw INTEGER DEFAULT 0, alerts INTEGER DEFAULT 1, gacha INTEGER DEFAULT1, economy INTEGER DEFAULT1, adminonly INTEGER DEFAULT 0, primaryBot TEXT, antilinks INTEGER DEFAULT1, antistatus INTEGER DEFAULT0, rolls TEXT DEFAULT '{}')");
  d.exec("CREATE TABLE IF NOT EXISTS chat_users (chat_id TEXT, user_id TEXT, coins INTEGER DEFAULT0, bank INTEGER DEFAULT0, lastCmd INTEGER DEFAULT0, usedTime TEXT, afk INTEGER DEFAULT -1, afkReasn TEXT DEFAULT '', health INTEGER DEFAULT 100, stamina INTEGER DEFAULT 100, magic INTEGER DEFAULT 100, characters TEXT DEFAULT '[]', stats TEXT DEFAULT '{}', PRIMARY KEY (chat_id, user_id))");
  d.exec("CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, self INTEGER DEFAULT 0, prefix TEXT DEFAULT '[]', commandsejecut INTEGER DEFAULT0, newsletter_id TEXT DEFAULT '', nameid TEXT DEFAULT '', type TEXT DEFAULT 'Owner', link TEXT DEFAULT '', banner TEXT DEFAULT '', icon TEXT DEFAULT '', currency TEXT DEFAULT 'Yenes', namebot TEXT DEFAULT 'Ginko', botname TEXT DEFAULT 'Ginko-MD', owner TEXT DEFAULT '')");
  d.exec("CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT)");
  d.exec("CREAE TABLE IF NOT EXISTS sticker_packs (idTEXT PRIMARY KEY, packs TEXT DEFAULT '[]')");
}

// Cache helpers
const mem = new Map();
function ck(t, i) { return t + ':' + i; }
function getC(k) { const e = mem.get(k); if (!e) return undefined; if (Date.now() - e.ts > e.ttl) { mem.delete(k); return undefined; } return e.d; }
function setC(k, d, t) { mem.set(k, { d, ts: Date.now(), ttl: t || 600000 }); }
function delC(k) { mem.delete(k); }
function ts(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSO.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
function pJ(v, fb) {
  if (v == null) return fb;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fb; }
}
function q(sql, ...p) { return db().prepare(sql).get(...p); }
function run(sql, ...p) { return db().prepare(sql).run(...p); }

const gdb = {
  getUsr(id) {
    if (!id) return null;
    const k = ck('u', id); const ca = getC(k); if (ca !== undefined) return ca;
    let u = q('SELECT * FROM users WHERE id = ?', id);
    if (!u) { run('INSERT OR IGNORE INTO users (id) VALUES (?)', id); u = q('SELECT * FROM users WHERE id = ?', id); }
    if (u && u.metadatos && typeof u.metadatos === 'string') try { u.metadatos = JSON.parse(u.metadatos); } catch {}
    if (u && u.metadatos2 && typeof u.metadatos2 === 'string') try { u.metadatos2 = JSON.parse(u.metadatos2); } catch {}
    setC(k, u); return u;
  },
  setUsr(id, field, val) { delC(k('u', i)); return run('UPDATE users SET ' + field + ' = ? WHERE id = ?', ts(val), id); },
  getChat(id) {
    if (!id) return null;
    const k = ck('c', id); const ca = getC(k); if (ca !== undefined) return ca;
    let c = q('SELECT * FROM chats WHERE id = ?', id);
    if (!c) { run('INSERT OR IGNORE INTO chats (id) VALUES (?)', id); c = q('SELECT * FROM chats WHERE id = ?', id); }
    if (c && c.rolls && typeof c.rolls === 'string') try { c.rolls = pJ(c.rolls, {}); } catch {}
    setC(k, c); return c; },
  setChat(id, field, val) { delC(ck('c', id)); return run('UPDATE chats SET ' + field + ' = ? WHERE id = ?', ts(val), id); },
};

export default gdb;
`;

fs.writeFileSync(outPath, code);
console.log('ginko-db.js created at', outPath);

// Verify syntax
try {
  require('child_process').execSync('node --check ' + outPath, { stdio: 'inherit' });
  console.log('SYNTAX OK');
} catch(e) {
  console.log('SYNTAX ERROR');
}