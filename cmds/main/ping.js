/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Ping — latencia de procesamiento + estado del motor (estilo nuevo).
// Devuelve UN solo texto: el router lo envía por la cola anti-ban.
// No usa sock.sendMessage directamente (evita saltarse el throttler/queue).

export default {
  name: "ping",
  aliases: ["p"],
  category: "info",
  description: "Mide la latencia y muestra el estado del bot",
  usage: ".ping",
  cooldown: 10,
  priority: true, // B1.4: el ping debe responder al instante, sin delay del throttler
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const t0 = process.hrtime.bigint();

    // Leer el estado del motor. Estas lecturas son baratas (Map y unos
    // contadores), así que lo que miden no es la red: miden lo que tarda
    // el bot en ARMAR la respuesta. Eso es lo que de verdad depende del
    // bot, y por eso es lo que se llama «latencia» aquí.
    //
    // Antes esto daba 0ms casi siempre y parecía roto. No lo estaba: era
    // una operación de menos de un milisegundo. Ahora se mide en
    // microsegundos y se enseña con dos decimales cuando baja de 1ms,
    // para que se vea que hubo trabajo aunque fuera rapidísimo.
    const q = engine.getSendQueue();
    const health = engine.getHealth();
    const status = health.getStatus();
    const riskEmoji = status.score >= 80 ? "🔴" : status.score >= 50 ? "🟠"
      : status.score >= 20 ? "🟡" : "🟢";

    const us = Number(process.hrtime.bigint() - t0) / 1000;
    const ms = Number(us / 1000);
    // Cómo se enseña: <1ms en microsegundos, si no en milisegundos.
    const latencia = ms >= 1 ? `${ms.toFixed(0)}ms` : `${us.toFixed(0)}µs`;

    // Y además, cuánto lleva el proceso trabajando: es el otro número que
    // la gente espera ver en un ping (cuánto aguanta sin reiniciar).
    const segundos = Math.floor(process.uptime());
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const vivo = dias > 0 ? `${dias}d ${horas}h`
      : horas > 0 ? `${horas}h ${minutos}m`
      : minutos > 0 ? `${minutos}m ${segundos % 60}s`
      : `${segundos}s`;

    const colaTxt = "📬 Cola › " + q.length() + " pendiente(s)" +
      (q.isPaused() ? " ⏸️ pausada" : "");

    const text =
      "╭───「 ✨ *SHIN-MD* 」───\n" +
      "│  ❏ *¡Pong!*\n" +
      "│  ⚡ Latencia › " + latencia + "\n" +
      "│  ⏱️ Encendido › " + vivo + "\n" +
      "│  " + colaTxt + "\n" +
      "│  🛡️ Riesgo › " + riskEmoji + " " + status.score + "%\n" +
      "╰────「 反魂 」────";

    return text;
  },
};
