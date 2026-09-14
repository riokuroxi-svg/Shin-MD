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
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const start = process.hrtime.bigint();

    // Leer el estado del motor (la medición incluye estas lecturas:
    // refleja el tiempo real que tarda el bot en armar la respuesta).
    const q = engine.getSendQueue();
    const health = engine.getHealth();
    const status = health.getStatus();
    const riskEmoji = status.score >= 80 ? "🔴" : status.score >= 50 ? "🟠"
      : status.score >= 20 ? "🟡" : "🟢";

    const ns = process.hrtime.bigint() - start;
    const ms = Number(ns / 1000000n);

    const colaTxt = "📬 Cola › " + q.length() + " pendiente(s)" +
      (q.isPaused() ? " ⏸️ pausada" : "");

    const text =
      "╭───「 ✨ *SHIN-MD* 」───\n" +
      "│  ❏ *¡Pong!*\n" +
      "│  ⚡ Latencia › " + ms + "ms\n" +
      "│  " + colaTxt + "\n" +
      "│  🛡️ Riesgo › " + riskEmoji + " " + status.score + "%\n" +
      "╰────「 反魂 」────";

    return text;
  },
};
