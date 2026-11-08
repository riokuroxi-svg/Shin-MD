/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { randomInt } from "#lib/random";
import db from '../src/services/ginko-db.js';
import { xpRange, CRECIMIENTO_LEVEL } from "#lib/xp";

function findLevel(xp, multiplier = global.multiplier || 2) {
  if (xp === Infinity) return Infinity;
  if (isNaN(xp)) return NaN;
  if (xp <= 0) return -1;
  let level = 0;
  do { level++; } while (xpRange(level, multiplier, CRECIMIENTO_LEVEL).min <= xp);
  return --level;
}

function canLevelUp(level, xp, multiplier = global.multiplier || 2) {
  if (level < 0) return false;
  if (xp === Infinity) return true;
  if (isNaN(xp)) return false;
  if (xp <= 0) return false;
  return level < findLevel(xp, multiplier);
}

export async function before({ msg }) {
  db.setCreate('users', msg.sender, 'minxp', 0);
  db.setCreate('users', msg.sender, 'maxxp', 0);
  const user = db.getUser(msg.sender);
  const users = db.getChatUser(msg.chat, msg.sender);
  let before = user.level || 0;
  while (canLevelUp(user.level || 0, user.exp || 0, global.multiplier)) {
    db.setUser(msg.sender, 'level', (user.level || 0) + 1);
    user.level = (user.level || 0) + 1;
  }
  if (before !== user.level) {
    const coinBonus = randomInt(5000, 8000);
    const expBonus = randomInt(100, 500);
    if (user.level % 5 === 0) {
      db.setChatUser(msg.chat, msg.sender, 'coins', (users.coins || 0) + coinBonus);
      db.setUser(msg.sender, 'exp', (user.exp || 0) + expBonus);
    }
    const { min, max } = xpRange(user.level, global.multiplier, CRECIMIENTO_LEVEL);
    db.setUser(msg.sender, 'minxp', min);
    db.setUser(msg.sender, 'maxxp', max);
  }
}
