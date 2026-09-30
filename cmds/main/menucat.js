/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import {
  createBracketBox,
  getCommandBadges,
  CATEGORY_EMOJIS,
} from "../../src/lib/formatter.js";
import { getChannelContext } from "../../src/lib/contextBuilder.js";

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
  name: "menucat",
  aliases: ["mc", "category", "cat"],
  category: "info",
  description: "Muestra los comandos de una categoría específica",
  usage: ".menucat <categoría>",
  cooldown: 2,

  async handler(sock, ctx, engine, commands) {
    const prefix = ctx.usedPrefix || ".";
    const sub = (ctx.arg || "").toLowerCase().trim();

    const cats = new Map();
    const seenNames = new Set();
    for (const [, cmd] of commands || []) {
      if (!cmd || seenNames.has(cmd.name) || cmd.name === "menu") continue;
      seenNames.add(cmd.name);
      const c = (cmd.category || "otros").toLowerCase();
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
    }

    if (!sub) {
      const available = Array.from(cats.keys()).map(c => `• \`${prefix}menucat ${c}\``).join("\n");
      return `📂 *CATEGORÍAS DISPONIBLES EN SHIN-MD*\n\n${available}\n\n💡 *Ejemplo:* \`${prefix}menucat downloads\``;
    }

    const matchedCat = Object.keys(CAT_LABELS).find(c => c === sub || sub.startsWith(c) || c.startsWith(sub)) || sub;
    const list = cats.get(matchedCat) || [];

    if (list.length === 0) {
      return `❌ No se encontraron comandos en la categoría *${sub}*.\n\nEscribe \`${prefix}menucat\` para ver las disponibles.`;
    }

    const emoji = CATEGORY_EMOJIS[matchedCat] || "📁";
    const label = CAT_LABELS[matchedCat] || matchedCat.toUpperCase();
    const cmdLines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)} — ${c.description || "Sin descripción"}`);

    let text = `✨ *SHIN-MD · ${label}*\n\n`;
    text += createBracketBox(label, cmdLines, emoji);
    text += `\nTotal: *${list.length}* comandos en esta categoría.\n`;
    text += `_Leyenda: 🅞 Dueño • 🅟 Premium • 🅐 Admin • 🅖 Grupos • 🅛 Límite_`;

    await sock.sendMessage(
      ctx.chatId,
      {
        text,
        contextInfo: getChannelContext({ mentionedJid: [ctx.senderId] }),
      },
      { quoted: ctx.full }
    );
    return null;
  },
};
