// Runtime — estado del bot

import os from "os";

export default {
  name: "runtime",
  aliases: ["status", "uptime", "estado"],
  category: "info",
  description: "Estado y tiempo de actividad del bot",
  usage: ".runtime",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const uptime = engine.getUptime();
    const days = Math.floor(uptime / 86400000);
    const hours = Math.floor((uptime % 86400000) / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    const memMB = Math.round(process.memoryUsage().rss / 1048576);
    const risk = engine.getHealth().getStatus();
    const queue = engine.getSendQueue().length();

    const timeStr = (days ? days + "d " : "") + (hours ? hours + "h " : "") + minutes + "m " + seconds + "s";

    const riskEmoji = risk.score >= 80 ? "🔴" : risk.score >= 50 ? "🟠" : risk.score >= 20 ? "🟡" : "🟢";

    return "📊 *Estado · 反魂 Shin-MD*\n" +
      "╭───────────────────\n" +
      "│  ⏱️ *Activo:* " + timeStr + "\n" +
      "│  🧠 *RAM:* " + memMB + " MB\n" +
      "│  🖥️ *Node:* " + process.version + " · " + process.platform + "\n" +
      "│  🛡️ *Riesgo:* " + riskEmoji + " " + risk.score + "% (" + risk.level + ")\n" +
      "│  ⏳ *Cola:* " + queue + " mensajes\n" +
      "│  🏷️ *Estado:* " + engine.getStateName() + "\n" +
      "╰────「 反魂 」────";
  },
};
