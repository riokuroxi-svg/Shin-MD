/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  warmup.js — Ver el tope diario del warm-up (anti-ban)
//
//  Existe porque el tope diario era INVISIBLE: al alcanzarlo, el bot
//  simplemente dejaba de responder los comandos normales (.play sobre
//  todo) mientras .menu y .ping seguían contestando, y el único rastro
//  era una línea en el log. Esto lo pone a la vista en 3 segundos.
//
//  Solo lectura: no cambia nada. Los topes se ajustan en el .env
//  (WARMUP, WARMUP_START_MSGS, WARMUP_MAX_MSGS, WARMUP_DAYS).
//
//  priority: true → responde incluso con el tope alcanzado.
// ═══════════════════════════════════════════════════════════════════

const SIN_TOPE = 1e9; // por encima de esto se considera WARMUP=off

function barra(usados, tope, ancho = 12) {
  if (!Number.isFinite(tope) || tope <= 0) return "";
  const llenos = Math.max(0, Math.min(ancho, Math.round((usados / tope) * ancho)));
  return "▰".repeat(llenos) + "▱".repeat(ancho - llenos);
}

function faltaParaReinicio() {
  // El contador diario se reinicia a las 00:00 UTC (checkReset usa
  // toISOString), no a medianoche local. Se informa tal cual para que
  // nadie espere a la hora equivocada.
  const ms = new Date().setUTCHours(24, 0, 0, 0) - Date.now();
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default {
  name: "warmup",
  aliases: ["tope", "limite", "limit"],
  category: "main",
  description: "Muestra el tope diario de mensajes del warm-up anti-ban",
  usage: ".warmup",
  cooldown: 5,
  priority: true,
  ownerOnly: true,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const throttler = engine?.getThrottler?.();
    if (!throttler?.getStats) return "❌ El motor no expone el throttler.";

    const s = throttler.getStats();
    const cola = engine?.getSendQueue?.();
    const sinTope = s.dailyLimit >= SIN_TOPE;

    const lineas = [
      "╭───「 🛡️ *WARM-UP ANTI-BAN* 」───",
    ];

    if (sinTope) {
      lineas.push("│  ⚠️ Tope diario › *DESACTIVADO*");
      lineas.push("│  _WARMUP=off en el .env_");
      lineas.push("│  📤 Enviados hoy › *" + s.msgsToday + "*");
    } else {
      const restantes = Math.max(0, s.dailyLimit - s.msgsToday);
      lineas.push("│  📊 Hoy › *" + s.msgsToday + " / " + s.dailyLimit + "* mensajes");
      lineas.push("│  " + barra(s.msgsToday, s.dailyLimit));
      lineas.push("│  ✅ Te quedan › *" + restantes + "*");
      lineas.push("│  🎵 ≈ *" + Math.floor(restantes / 3) + "* usos de .play");
      if (restantes === 0) lineas.push("│  🔴 *TOPE ALCANZADO* — el bot solo responde .menu/.ping");
    }

    lineas.push("│  📅 Día › *" + s.day + "*" + (s.warmUpComplete ? " (warm-up completo)" : " del warm-up"));
    lineas.push("│  🔄 Se reinicia en › *" + faltaParaReinicio() + "* (00:00 UTC)");
    lineas.push("│  📨 Total enviado › *" + s.totalSent + "*");
    if (cola) lineas.push("│  📬 Cola › *" + cola.length() + "* pendiente(s)");
    lineas.push("╰────「 反魂 」────");
    lineas.push("");
    lineas.push("> Las reacciones, borrados y ediciones *no* gastan cuota.");
    lineas.push("> Ajusta en el `.env`: `WARMUP_START_MSGS`, `WARMUP_MAX_MSGS`, `WARMUP_DAYS` o `WARMUP=off`.");

    return lineas.join("\n");
  },
};
