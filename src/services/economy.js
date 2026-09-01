// Economy helpers — capa sobre SQLite para economía/gacha
import { getDatabase } from "#db";

const COOLDOWNS = {
  daily: 24 * 60 * 60 * 1000,
  work: 3 * 60 * 1000,
  fish: 5 * 60 * 1000,
  hunt: 5 * 60 * 1000,
  mine: 5 * 60 * 1000,
  crime: 10 * 60 * 1000,
  rob: 15 * 60 * 1000,
  slot: 30 * 1000,
  rt: 10 * 1000,
};

export function getUserCoins(userJid) {
  const db = getDatabase();
  const r = db.prepare("SELECT coins, bank, health, stamina, inventory, tools, weapons, streak, last_daily_global FROM users WHERE jid = ?").get(userJid);
  return r || { coins: 0, bank: 0, health: 100, stamina: 100, inventory: '{}', tools: '{}', weapons: '{}', streak: 0, last_daily_global: 0 };
}

export function updateUserCoins(userJid, delta) {
  const db = getDatabase();
  const cur = getUserCoins(userJid);
  const newCoins = Math.max(0, (cur.coins || 0) + delta);
  db.db.prepare("INSERT INTO users (jid, coins, bank, health, stamina, inventory, tools, weapons, streak, last_daily_global, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(jid) DO UPDATE SET coins = excluded.coins, last_seen = ?")
    .run(userJid, newCoins, cur.bank||0, cur.health||100, cur.stamina||100, cur.inventory||'{}', cur.tools||'{}', cur.weapons||'{}', cur.streak||0, cur.last_daily_global||0, Date.now(), Date.now(), Date.now());
  return newCoins;
}

export function getTimer(chatId, sender) {
  const db = getDatabase();
  const id = chatId + ':' + sender;
  const r = db.db.prepare("SELECT * FROM economy_timers WHERE id = ?").get(id);
  return r || { id, chat_id: chatId, sender, last_daily: 0, last_work: 0, last_fish: 0, last_hunt: 0, last_mine: 0, last_crime: 0, last_rob: 0, last_slot: 0, last_rt: 0 };
}

export function setTimer(chatId, sender, type) {
  const db = getDatabase();
  const id = chatId + ':' + sender;
  const timer = getTimer(chatId, sender);
  timer[type] = Date.now();
  db.db.prepare(`INSERT INTO economy_timers (id, chat_id, sender, last_daily, last_work, last_fish, last_hunt, last_mine, last_crime, last_rob, last_slot, last_rt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ${type} = ?`)
    .run(id, chatId, sender, timer.last_daily, timer.last_work, timer.last_fish, timer.last_hunt, timer.last_mine, timer.last_crime, timer.last_rob, timer.last_slot, timer.last_rt, Date.now());
}

export function formatTime(ms) {
  if (ms <= 0) return 'ahora';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

export function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export { COOLDOWNS };
export default { getUserCoins, updateUserCoins, getTimer, setTimer, formatTime, random, pickRandom, COOLDOWNS };