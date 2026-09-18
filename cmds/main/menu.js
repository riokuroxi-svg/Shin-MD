/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Menu — Menú principal de comandos de Shin-MD
// Envía un mensaje rico y compatible con TODOS los clientes de WhatsApp (Android, iOS, Web, Desktop)
// usando imagen de cabecera (banner) + texto estructurado por categorías.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANNER_PATHS = [
  process.env.MENU_IMAGE,
  path.resolve(__dirname, "../../assets/banner-default.png"),
  path.resolve(__dirname, "../../assets/bocchi-banner.png"),
  path.resolve(__dirname, "../../media/menu.jpg"),
].filter(Boolean);

let _bannerCache = null;
function getBanner() {
  if (_bannerCache) return _bannerCache;
  for (const p of BANNER_PATHS) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) {
        _bannerCache = fs.readFileSync(p);
        return _bannerCache;
      }
    } catch {}
  }
  return null;
}

// ─── Versión local ──────────────────────────────────────────────
let __localVersion = null;
function localVersion() {
  if (__localVersion) return __localVersion;
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    __localVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "3.0.2";
  } catch { __localVersion = "3.0.2"; }
  return __localVersion;
}

const catMeta = {
  info: { label: "✦ *INFORMACIÓN*", emoji: "📋" },
  main: { label: "✦ *PRINCIPAL*", emoji: "🌸" },
  utils: { label: "✦ *UTILIDADES*", emoji: "🛠️" },
  utility: { label: "✦ *HERRAMIENTAS*", emoji: "⚙️" },
  downloads: { label: "✦ *DESCARGAS*", emoji: "📥" },
  anime: { label: "✦ *ANIME & REACCIONES*", emoji: "🍥" },
  stickers: { label: "✦ *STICKERS*", emoji: "🎭" },
  economy: { label: "✦ *ECONOMÍA*", emoji: "💰" },
  games: { label: "✦ *JUEGOS*", emoji: "🎮" },
  fun: { label: "✦ *DIVERSIÓN*", emoji: "🎲" },
  gacha: { label: "✦ *GACHA & RPG*", emoji: "🎴" },
  group: { label: "✦ *GRUPOS & ADMIN*", emoji: "🛡️" },
  profile: { label: "✦ *PERFIL*", emoji: "👤" },
  socket: { label: "✦ *SOCKETS & BOTS*", emoji: "🤖" },
  nsfw: { label: "✦ *NSFW +18*", emoji: "🔞" },
  owner: { label: "✦ *CREADOR / OWNER*", emoji: "👑" },
  otros: { label: "✦ *OTROS*", emoji: "📦" },
};

export default {
  name: "menu",
  aliases: ["help", "ayuda", "h", "allmenu", "menumanual"],
  category: "info",
  description: "Muestra el menú principal de comandos del bot",
  usage: ".menu [categoría]",
  cooldown: 3,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine, commands) {
    const uptime = engine ? engine.getUptime() : 0;
    const minutes = Math.floor(uptime / 60000);
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${remMin}m` : `${minutes}m`;

    const health = engine?.getHealth?.();
    const risk = health ? health.getRiskScore() : 0;
    const riskEmoji = risk >= 80 ? "🔴" : risk >= 50 ? "🟠" : risk >= 20 ? "🟡" : "🟢";

    const sub = (ctx.arg || "").toLowerCase().trim();

    // ─── Submenú por categoría específica: .menu descargas ──────
    if (sub) {
      const matchedCat = Object.keys(catMeta).find(c => c === sub || sub.startsWith(c) || c.startsWith(sub));
      const targetCat = matchedCat || sub;

      const inCat = [];
      const seen = new Set();
      for (const [, cmd] of commands || []) {
        if (!cmd || seen.has(cmd.name) || cmd.name === "menu") continue;
        const c = (cmd.category || "otros").toLowerCase();
        if (c === targetCat || (targetCat === "utilidades" && (c === "utils" || c === "utility")) || (targetCat === "descargas" && c === "downloads")) {
          seen.add(cmd.name);
          inCat.push(cmd);
        }
      }

      if (inCat.length === 0) {
        const available = Object.keys(catMeta).filter(c => c !== "otros").join(", ");
        return `❌ La categoría *${sub}* no existe.\n\n📂 *Categorías disponibles:*\n> ${available}\n\n💡 *Ejemplo:* \`.menu descargas\``;
      }

      const meta = catMeta[targetCat] || { label: `✦ *${targetCat.toUpperCase()}*`, emoji: "📂" };
      let subBody = `╭───「 ${meta.emoji} *SHIN-MD · ${meta.label.replace(/[✦*]/g, "").trim()}* 」───\n`;
      subBody += `│  👤 Comandos disponibles: *${inCat.length}*\n`;
      subBody += `╰──────────────────────────────────\n\n`;

      for (const c of inCat) {
        subBody += `● \`.${c.name}\``;
        if (c.aliases && c.aliases.length > 0) {
          subBody += ` _(${c.aliases.slice(0, 3).map(a => `.${a}`).join(", ")})_`;
        }
        subBody += `\n`;
        if (c.description) subBody += `  ⤷ ${c.description}\n`;
        if (c.usage) subBody += `  ▸ _Uso:_ \`${c.usage}\`\n`;
        subBody += `\n`;
      }

      subBody += `╭──────────────────────────────────\n`;
      subBody += `│  _Para ver el menú completo escribe .menu_\n`;
      subBody += `│  _Shin-MD v${localVersion()} · AGPL-3.0_\n`;
      subBody += `╰────「 反魂 」────────────────────`;

      const banner = getBanner();
      if (banner) {
        await sock.sendMessage(ctx.chatId, { image: banner, caption: subBody.trim() }, { quoted: ctx.full });
        return null;
      }
      return subBody.trim();
    }

    // ─── Menú Principal Completo ─────────────────────────────────
    const cats = new Map();
    const seenNames = new Set();
    for (const [, cmd] of commands || []) {
      if (!cmd || seenNames.has(cmd.name) || cmd.name === "menu") continue;
      seenNames.add(cmd.name);
      const c = (cmd.category || "otros").toLowerCase();
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
    }

    let categoriesBody = "";
    // Orden de visualización prioritario
    const catOrder = ["info", "main", "downloads", "stickers", "anime", "utils", "utility", "economy", "gacha", "games", "fun", "group", "profile", "socket", "nsfw", "owner", "otros"];

    for (const catKey of catOrder) {
      const list = cats.get(catKey);
      if (!list || list.length === 0) continue;
      const meta = catMeta[catKey] || { label: `✦ *${catKey.toUpperCase()}*`, emoji: "📦" };
      categoriesBody += `\n${meta.emoji} ${meta.label} (${list.length})\n`;
      const cmdList = list.map(c => `\`${c.name}\``).join(" • ");
      categoriesBody += `> ${cmdList}\n`;
    }

    const stateName = engine?.getStateName ? engine.getStateName() : "RUNNING";
    const totalCommands = seenNames.size;

    const fullMenuText =
      `╭───「 ✨ *SHIN-MD ${localVersion()}* 」───\n` +
      `│  反魂 · Bot WhatsApp Superior\n` +
      `│  🏷️ *Estado:* ${stateName} · *Uptime:* ${timeStr}\n` +
      `│  🛡️ *Riesgo:* ${riskEmoji} ${risk}%\n` +
      `│  👤 *Comandos:* ${totalCommands} únicos\n` +
      `│  ⚡ *Prefijo:* \`.\`\n` +
      `╰────────────────────────────\n` +
      categoriesBody +
      `\n╭────────────────────────────\n` +
      `│ 💡 _Escribe .menu <categoría> para detalle_\n` +
      `│ 📌 _Ejemplo: .menu descargas_\n` +
      `│ _Basado en Shin-MD por riokuroxi-svg_\n` +
      `│ _github.com/riokuroxi-svg/Shin-MD · AGPL-3.0_\n` +
      `╰────「 反魂 」─────────────`;

    const banner = getBanner();
    if (banner) {
      await sock.sendMessage(ctx.chatId, { image: banner, caption: fullMenuText }, { quoted: ctx.full });
      return null;
    } else {
      await sock.sendMessage(ctx.chatId, { text: fullMenuText }, { quoted: ctx.full });
      return null;
    }
  },
};
