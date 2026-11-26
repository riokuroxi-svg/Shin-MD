/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readMore,
  createBracketBox,
  getCommandBadges,
  formatUptime,
  getTimeGreeting,
  CATEGORY_EMOJIS,
} from "../../src/lib/formatter.js";
import { getVerifiedQuoted, getChannelContext } from "../../src/lib/contextBuilder.js";
import { pickBanner } from "#lib/theme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Banner del listado completo: el de marca dibujado por tools/arte_marca.py
 * (día o noche) o, si el dueño dejó los suyos, los de media/banners/.
 */
function getRandomBanner() {
  try {
    const porHora = pickBanner();
    if (porHora) return fs.readFileSync(porHora);
  } catch {}
  const marca = path.resolve(__dirname, "../../assets/brand");
  const hora = new Date().getHours();
  const modo = hora >= 6 && hora < 19 ? "day" : "night";
  for (const p of [path.join(marca, `banner-${modo}.png`), path.join(marca, "banner-day.png")]) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}

const CAT_LABELS = {
  info: "INFORMACIÓN",
  main: "PRINCIPAL",
  utils: "UTILIDADES",
  utility: "HERRAMIENTAS",
  downloads: "DESCARGAS",
  anime: "ANIME",
  stickers: "STICKERS",
  economy: "ECONOMÍA",
  games: "JUEGOS",
  fun: "DIVERSIÓN",
  gacha: "GACHA & RPG",
  group: "GRUPOS & ADMIN",
  profile: "PERFIL",
  socket: "SOCKETS & BOTS",
  nsfw: "NSFW +18",
  owner: "CREADOR / OWNER",
  otros: "OTROS",
};

export default {
  name: "allmenu",
  aliases: ["fullmenu", "am", "comandos", "allcommands"],
  category: "info",
  description: "Muestra la lista completa de todos los comandos organizados por categorías",
  usage: ".allmenu",
  cooldown: 3,

  async handler(sock, ctx, engine, commands) {
    const prefix = ctx.usedPrefix || ".";
    const greeting = getTimeGreeting();
    const uptimeFormatted = formatUptime(engine?.getUptime?.() || (process.uptime() * 1000));
    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    const cats = new Map();
    const seenNames = new Set();
    for (const [, cmd] of commands || []) {
      if (!cmd || seenNames.has(cmd.name) || cmd.name === "menu") continue;
      seenNames.add(cmd.name);
      const c = (cmd.category || "otros").toLowerCase();
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
    }

    const catOrder = [
      "info", "main", "downloads", "stickers", "anime", "utils", "utility",
      "economy", "gacha", "games", "fun", "group", "profile", "socket", "nsfw", "owner", "otros"
    ];

    let header = `${greeting} *${ctx.pushName || "Usuario"}* 👋\n\n`;
    header += `╭┈┈⫹⫺ *CATÁLOGO GENERAL* ⫹⫺┈┈╮\n`;
    header += `│ ◈ Total Comandos: *${seenNames.size}*\n`;
    header += `│ ◈ Categorías: *${cats.size}*\n`;
    header += `│ ◈ Uptime: *${uptimeFormatted}*\n`;
    header += `│ ◈ Prefijo: \`${prefix}\`\n`;
    header += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;
    header += `_Presiona "Leer más" para ver todos los comandos_ ⬇️\n`;

    let body = "";
    for (const catKey of catOrder) {
      const list = cats.get(catKey);
      if (!list || list.length === 0) continue;
      const emoji = CATEGORY_EMOJIS[catKey] || "📁";
      const label = CAT_LABELS[catKey] || catKey.toUpperCase();
      const cmdLines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)}`);
      body += createBracketBox(label, cmdLines, emoji);
    }

    const fullText = header + readMore + body + `\n_Shin-MD • Desarrollado por riokuroxi-svg_`;
    const banner = getRandomBanner();

    if (banner) {
      await sock.sendMessage(ctx.chatId, { image: banner, caption: fullText, contextInfo: channelCtx }, { quoted: ctx.full });
      return null;
    }

    await sock.sendMessage(ctx.chatId, { text: fullText, contextInfo: channelCtx }, { quoted: ctx.full });
    return null;
  },
};
