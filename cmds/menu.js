// Menu — menú principal con estética 反魂 Shin-MD

export default {
  name: "menu",
  aliases: ["help", "ayuda", "h"],
  category: "info",
  description: "Muestra el menú del bot",
  usage: ".menu",
  cooldown: 3,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine, commands) {
    const uptime = engine.getUptime();
    const minutes = Math.floor(uptime / 60000);
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    const risk = engine.getHealth().getRiskScore();
    const unique = new Set();
    for (const [, cmd] of commands) unique.add(cmd.name);

    // Agrupar comandos únicos por categoría (ignorando aliases)
    const cats = new Map();
    const seenNames = new Set();
    for (const [, cmd] of commands) {
      if (seenNames.has(cmd.name) || cmd.name === "menu") continue;
      seenNames.add(cmd.name);
      const c = cmd.category || "otros";
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
    }

    const catLabel = {
      info: "✦ *INFORMACIÓN*",
      utility: "✦ *UTILIDAD*",
      admin: "✦ *ADMINISTRACIÓN*",
      owner: "✦ *OWNER*",
      otros: "✦ *OTROS*",
    };

    let body = "";
    for (const [cat, cmds] of cats) {
      body += "\n" + (catLabel[cat] || "✦ *" + cat.toUpperCase() + "*") + "\n";
      for (const c of cmds) {
        body += "│   " + "`." + c.name + "`" + (c.aliases && c.aliases.length ? " *" + c.aliases.map(a => "." + a).join(" ")+"*" : "") + "\n";
        if (c.description) body += "│   ⤷ " + c.description + "\n";
      }
    }

    const timeStr = hours > 0 ? hours + "h " + remMin + "m" : minutes + "m";
    const riskEmoji = risk >= 80 ? "🔴" : risk >= 50 ? "🟠" : risk >= 20 ? "🟡" : "🟢";

    return "╭───「 ✨ *SHIN-MD* 」───\n" +
      "│  反魂 · Bot WhatsApp superior\n" +
      "│  🏷️ *" + engine.getStateName() + "* · " + timeStr + " de actividad\n" +
      "│  🛡️ Riesgo: " + riskEmoji + " " + risk + "%\n" +
      "╰───────────────────\n" +
      body +
      "\n╭───────────────────\n" +
      "│  " + unique.size + " comandos · prefijo `.`\n" +
      "│  _Hecho desde cero · AGPL-3.0_\n" +
      "╰────「 反魂 」────";
  },
};
