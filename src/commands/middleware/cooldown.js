/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  cooldown.js — Middleware de cooldown + antispam
//  · Cooldown por comando y usuario (ej: 5s entre .ping)
//  · Antispam global: si un usuario spamea, se le ignora unos segundos
//  · Brain (#lib/brain, venido de Shin-Lab): mira ráfagas cortas, texto
//    repetido e inundación de comandos. SLOW = unos segundos de freno,
//    BLOCK = se ignora. Se apaga con SHIN_BRAIN=0.
//  Usa la caché TTL de #cache para no acumular memoria.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { getCache } from "#cache";
import { createBrain } from "#lib/brain";

const ONE_MIN = 60000;

export function createCooldown(opts) {
  opts = opts || {};
  const cache = opts.cache || getCache(ONE_MIN * 5);
  const MAX_REQUESTS = opts.maxRequests || 10;   // por minuto por usuario
  const WINDOW_MS = opts.windowMs || ONE_MIN;
  // El brain es un filtro EXTRA: el techo de 10/min de arriba sigue igual.
  const brain = opts.brain || createBrain();
  const SLOW_WAIT_MS = opts.slowWaitMs || 3000;  // lo que dura el freno

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
  /**
   * @param {{ senderId?: string, cmd?: { name?: string, cooldown?: number, ownerOnly?: boolean },
   *           text?: string, ahora?: number }} opciones
   *   `text` es lo que escribió el usuario (para el brain) y `ahora` solo lo
   *   usan las pruebas para simular el paso del tiempo.
   * @returns {boolean} true si hay que ignorar el mensaje
   */
  function check({ senderId, cmd, text, ahora }) {
    if (cmd && cmd.ownerOnly) return false; // el owner no se limita

    // Capa nueva (Shin-Lab): ráfagas, texto repetido y flood de comandos.
    // `ahora` solo lo usan las pruebas para simular el paso del tiempo.
    if (process.env.SHIN_BRAIN !== "0") {
      const v = brain.decide({ userId: senderId, text: text || "", isCommand: !!cmd, ts: ahora });
      if (v.action === "BLOCK") {
        log.gray("Brain: ignorando a " + (senderId || "?") + " (" + v.reasons.join(", ") + ")");
        return true;
      }
      if (v.action === "SLOW") {
        const key = "brain:" + senderId;
        if (cache.get(key)) {
          log.gray("Brain: frenando a " + (senderId || "?") + " (" + v.reasons.join(", ") + ")");
          return true;
        }
        cache.set(key, 1, SLOW_WAIT_MS); // el primer aviso no corta; el siguiente sí
      }
    }

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
