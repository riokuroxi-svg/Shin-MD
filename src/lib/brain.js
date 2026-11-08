/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  brain.js — Clasificador anti-spam (migrado de Shin-Lab, experimento 01).
//
//  Decide por mensaje: ALLOW (dejar pasar) · SLOW (frenar) · BLOCK (ignorar),
//  con un score 0-100 y el motivo. Cero dependencias, memoria acotada
//  (64 marcas por usuario, se podan solas) y sin tocar la red.
//
//  En el bot se usa ANTES del antispam de siempre (10 mensajes/minuto), que
//  sigue igual: el brain añade lo que aquel no veía (ráfagas cortas, texto
//  repetido, inundación de comandos) sin sustituir el techo que ya existía.
//
//  Umbrales en DEFAULTS; se pueden cambiar al crear el cerebro:
//      createBrain({ rateSlowAt: 6 })
//  Se apaga entero con SHIN_BRAIN=0.
// ═══════════════════════════════════════════════════════════════════

const DEFAULTS = {
  windowMs: 10000,          // ventana deslizante para tasa de mensajes
  maxKeep: 64,              // máximo de marcas por usuario (memoria acotada)
  rateSlowAt: 4,            // msgs en la ventana → SLOW
  rateBlockAt: 8,           // msgs en la ventana → BLOCK
  dupeBlockAt: 3,           // mismo texto N veces seguidas → BLOCK
  cmdFloodAt: 5,            // comandos en la ventana → SLOW (10 → BLOCK)
  slowScore: 55,            // score mínimo cuando cae en SLOW
  blockScore: 85,           // score mínimo cuando cae en BLOCK
};

export function createBrain(opts) {
  opts = opts || {};
  const cfg = { ...DEFAULTS, ...opts };
  const users = new Map(); // userId → { ts: [], texts: [], cmds: [] }

  function state(userId) {
    let s = users.get(userId);
    if (!s) {
      s = { ts: [], texts: [], cmds: [] };
      users.set(userId, s);
    }
    return s;
  }

  function prune(arr, now) {
    const cut = now - cfg.windowMs;
    while (arr.length && arr[0] < cut) arr.shift();
    if (arr.length > cfg.maxKeep) arr.splice(0, arr.length - cfg.maxKeep);
  }

  /**
   * @param {object} msg { userId, text, isCommand, ts? }
   * @returns {{ action: "ALLOW"|"SLOW"|"BLOCK", score: number, reasons: string[] }}
   */
  function decide(msg) {
    const now = msg.ts ?? Date.now();
    const userId = msg.userId || "?";
    const text = String(msg.text ?? "").trim();
    const s = state(userId);

    prune(s.ts, now);
    prune(s.cmds, now);
    s.ts.push(now);
    if (msg.isCommand) s.cmds.push(now);
    s.texts.push(text.toLowerCase().slice(0, 200));
    if (s.texts.length > cfg.dupeBlockAt + 2) s.texts.shift();

    let score = 0;
    const reasons = [];
    let hardBlock = false;

    // 1) Tasa de mensajes en la ventana
    const rate = s.ts.length;
    if (rate >= cfg.rateBlockAt) {
      score += 60;
      hardBlock = true; // ráfaga evidente → BLOCK directo
      reasons.push("ráfaga: " + rate + " msgs/" + (cfg.windowMs / 1000) + "s");
    } else if (rate >= cfg.rateSlowAt) {
      score += 35;
      reasons.push("ritmo alto: " + rate + " msgs/" + (cfg.windowMs / 1000) + "s");
    }

    // 2) Texto repetido exactamente N veces seguidas
    const last = s.texts.slice(-cfg.dupeBlockAt);
    if (text && last.length >= cfg.dupeBlockAt && last.every(t => t === last[0])) {
      score += 50;
      hardBlock = true; // spam de repetición → BLOCK directo
      reasons.push("texto repetido x" + cfg.dupeBlockAt);
    }

    // 3) Inundación de comandos
    const cmdRate = s.cmds.length;
    if (cmdRate >= cfg.cmdFloodAt * 2) {
      score += 45;
      hardBlock = true; // el doble del umbral de flood → BLOCK directo
      reasons.push("flood de comandos: " + cmdRate);
    } else if (cmdRate >= cfg.cmdFloodAt) {
      score += 25;
      reasons.push("muchos comandos: " + cmdRate);
    }

    // 4) Señales suaves: mayúsculas sostenidas + mensaje largo
    if (text.length > 120) {
      const letters = text.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/g, "");
      const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "");
      if (letters.length > 30 && upper.length / letters.length > 0.85) {
        score += 10;
        reasons.push("mayúsculas sostenidas");
      }
    }

    // Decisión final: reglas duras primero, luego score
    /** @type {"ALLOW"|"SLOW"|"BLOCK"} */
    let action = "ALLOW";
    if (hardBlock || score >= cfg.blockScore) action = "BLOCK";
    else if (score >= cfg.slowScore) action = "SLOW";
    if (action === "SLOW") score = Math.max(score, cfg.slowScore);
    if (action === "BLOCK") score = Math.max(score, cfg.blockScore);

    return { action, score: Math.min(100, score), reasons };
  }

  function reset(userId) {
    if (userId) users.delete(userId);
    else users.clear();
  }

  function size() { return users.size; }

  return { decide, reset, size };
}

export default createBrain;
