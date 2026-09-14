/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Menu — menú principal, Plantilla A (反魂 elegante) + banner + botones
// Envía un mensaje interactivo con botones por categoría; si WhatsApp
// no lo renderiza, hace fallback a texto plano (nunca rompe).

import { sendInteractive, quickReply } from "#interactive";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BANNER_URL = process.env.MENU_IMAGE || ""; // opcional, URL de imagen

// ─── Versión + aviso de desactualización ────────────────────────
// Aviso transparente (no manda datos): solo compara la versión local
// con la del repo oficial y, si hay una más nueva, la muestra en el
// menú. Si no hay red, no pasa nada (el menú sale igual).
let __localVersion = null;
function localVersion() {
  if (__localVersion) return __localVersion;
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    __localVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "0.0.0";
  } catch { __localVersion = "0.0.0"; }
  return __localVersion;
}

function versionIsNewer(a, b) {
  const pa = String(a).split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function checkForUpdate() {
  try {
    const local = localVersion();
    const res = await fetch(
      "https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/main/package.json",
      { signal: AbortSignal.timeout(2500) }
    );
    const remote = await res.json();
    if (remote && remote.version && versionIsNewer(remote.version, local)) {
      return (
        "⚠️ Desactualizado: v" + local + " → v" + remote.version +
        "\n📥 Oficial: github.com/riokuroxi-svg/Shin-MD"
      );
    }
  } catch { /* sin red: el menú se muestra igual */ }
  return "";
}

const catLabel = {
  info: "✦ *INFORMACIÓN*",
  utility: "✦ *UTILIDAD*",
  admin: "✦ *ADMINISTRACIÓN*",
  owner: "✦ *OWNER*",
  games: "✦ *JUEGOS* 🎮",
  otros: "✦ *OTROS*",
};

const catEmoji = {
  info: "📋",
  utility: "🛠️",
  admin: "🛡️",
  owner: "👑",
  games: "🎮",
  otros: "📦",
};

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

    // Submenú por categoría: .menu juegos
    const sub = (ctx.arg || "").toLowerCase().trim();
    if (sub) {
      const wanted = Object.keys(catLabel).find(c => c === sub) || sub;
      const inCat = [];
      const seen = new Set();
      for (const [, cmd] of commands) {
        if (seen.has(cmd.name) || cmd.name === "menu") continue;
        seen.add(cmd.name);
        const c = cmd.category || "otros";
        if (c === wanted) inCat.push(cmd);
      }
      if (inCat.length === 0) {
        return "❌ Categoría *" + sub + "* no existe.\n\n" +
          "Categorías: " + Object.keys(catLabel).join(", ");
      }
      let subBody = "╭───「 ✨ *SHIN-MD* 」───\n│  " +
        (catLabel[wanted] || "✦ *" + wanted.toUpperCase() + "*") + "\n" +
        "╰───────────────────\n";
      for (const c of inCat) {
        subBody += "\n`." + c.name + "`" +
          (c.aliases && c.aliases.length ? " *" + c.aliases.map(a => "." + a).join(" ") + "*" : "") + "\n";
        if (c.description) subBody += "│  ⤷ " + c.description + "\n";
        if (c.usage) subBody += "│  ▸ Uso: `" + c.usage + "`\n";
      }
      subBody +=
        "\n╭───────────────────\n" +
        "│  _Basado en Shin-MD por riokuroxi-svg_\n" +
        "│  _github.com/riokuroxi-svg/Shin-MD · AGPL-3.0_\n" +
        "╰────「 反魂 」────";
      return subBody;
    }

    // Agrupar comandos únicos por categoría (ignorando aliases y menu)
    const cats = new Map();
    const seenNames = new Set();
    for (const [, cmd] of commands) {
      if (seenNames.has(cmd.name) || cmd.name === "menu") continue;
      seenNames.add(cmd.name);
      const c = cmd.category || "otros";
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
    }

    let body = "";
    for (const [cat, cmds] of cats) {
      body += "\n" + (catLabel[cat] || "✦ *" + cat.toUpperCase() + "*") + "\n";
      for (const c of cmds) {
        body += "│   " + "`." + c.name + "`" +
          (c.aliases && c.aliases.length ? " *" + c.aliases.map(a => "." + a).join(" ") + "*" : "") + "\n";
        if (c.description) body += "│   ⤷ " + c.description + "\n";
      }
    }

    const timeStr = hours > 0 ? hours + "h " + remMin + "m" : minutes + "m";
    const riskEmoji = risk >= 80 ? "🔴" : risk >= 50 ? "🟠" : risk >= 20 ? "🟡" : "🟢";
    const total = seenNames.size;

    // Aviso de desactualización (transparente, nunca bloquea) + crédito
    // fijo requerido por AGPL §7 / NOTICE.
    const upd = await checkForUpdate();
    let footer =
      "╭───────────────────\n" +
      "│  Escribe `menu <categoría>` para detalle\n" +
      "│  _Basado en Shin-MD por riokuroxi-svg_\n" +
      "│  _github.com/riokuroxi-svg/Shin-MD · AGPL-3.0_\n";
    if (upd) footer = "╭───────────────────\n" + upd.replace(/\n/g, "\n│  ") + "\n" + footer;

    const text = "╭───「 ✨ *SHIN-MD* 」───\n" +
      "│  反魂 · Bot WhatsApp superior\n" +
      "│  🏷️ *" + engine.getStateName() + "* · " + timeStr + " de actividad\n" +
      "│  🛡️ Riesgo: " + riskEmoji + " " + risk + "%\n" +
      "│  👤 " + total + " comandos · prefijo `.`\n" +
      "╰───────────────────\n" +
      body +
      "\n" + footer +
      "╰────「 反魂 」────";

    // Botones por categoría
    const buttons = [...cats.keys()].map(cat => quickReply(catEmoji[cat] + " " + (catLabel[cat] || cat).replace(/[✦*]/g, "").trim(), "menu " + cat));

    // Enviar interactivo con banner (si hay) o texto
    try {
      const sent = await sendInteractive(sock, ctx.chatId, {
        body: text,
        footer: "反魂 Shin-MD · AGPL-3.0",
        image: BANNER_URL || undefined,
        buttons: buttons.slice(0, 4),
        quoted: ctx.full,
      });
      // Si envió interactivo, el botón "menu <cat>" será capturado por el router
      return sent ? null : text;
    } catch {
      return text; // fallback texto plano
    }
  },
};
