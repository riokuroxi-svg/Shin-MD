// ═══════════════════════════════════════════════════════════════════
//  cooldown.js — Middleware de cooldown + antispam
//  · Cooldown por comando y usuario (ej: 5s entre .ping)
//  · Antispam global: si un usuario spamea, se le ignora unos segundos
//  Usa la caché TTL de #cache para no acumular memoria.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { getCache } from "#cache";

const ONE_MIN = 60000;

export function createCooldown(opts) {
  opts = opts || {};
  const cache = opts.cache || getCache(ONE_MIN * 5);
  const MAX_REQUESTS = opts.maxRequests || 10;   // por minuto por usuario
  const WINDOW_MS = opts.windowMs || ONE_MIN;

  /**
   * @returns {boolean} true si está en cooldown (bloqueado)
   */
  function isOnCooldown(userId, cmdName, cooldownSec) {
    if (!cooldownSec || cooldownSec <= 0) return false;
    const key = "cd:" + userId + ":" + cmdName;
    const last = cache.get(key);
    const now = Date.now();
    if (last && (now - last) < cooldownSec * 1000) return true;
    cache.set(key, now, cooldownSec * 1000);
    return false;
  }

  /**
   * Antispam global por usuario. Devuelve true si excedió el límite.
   */
  function isSpamming(userId) {
    if (!userId) return false;
    const key = "spam:" + userId;
    const count = cache.get(key) || 0;
    if (count >= MAX_REQUESTS) return true;
    cache.set(key, count + 1, WINDOW_MS);
    return false;
  }

  /**
   * Inyecta el middleware de cooldown en el router.
   * Retorna true si debe bloquearse la ejecución.
   */
  function check({ senderId, cmd }) {
    if (cmd && cmd.ownerOnly) return false; // el owner no se limita
    if (isSpamming(senderId)) {
      log.gray("Antispam: bloqueado " + (senderId || "?"));
      return true;
    }
    if (cmd && isOnCooldown(senderId, cmd.name, cmd.cooldown)) {
      log.gray("Cooldown activo: " + cmd.name + " (" + senderId + ")");
      return true;
    }
    return false;
  }

  return { check, isOnCooldown, isSpamming };
}

export default createCooldown;
