/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import {
  readMore,
  createBracketBox,
  getCommandBadges,
  formatUptime,
  getTimeGreeting,
  CATEGORY_EMOJIS,
} from "../../src/lib/formatter.js";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import {
  CAT_LABELS,
  CAT_ORDER,
  collectCategories,
  getRandomBanner,
} from "#lib/menu-shared";

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
    const { cats, seenNames } = collectCategories(commands, { exclude: ["menu"] });

    let header = `${greeting} *${ctx.pushName || "Usuario"}* 👋\n\n`;
    header += `╭┈┈⫹⫺ *CATÁLOGO GENERAL* ⫹⫺┈┈╮\n`;
    header += `│ ◈ Total Comandos: *${seenNames.size}*\n`;
    header += `│ ◈ Categorías: *${cats.size}*\n`;
    header += `│ ◈ Uptime: *${uptimeFormatted}*\n`;
    header += `│ ◈ Prefijo: \`${prefix}\`\n`;
    header += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;
    header += `_Presiona "Leer más" para ver todos los comandos_ ⬇️\n`;

    let body = "";
    for (const catKey of CAT_ORDER) {
      const list = cats.get(catKey);
      if (!list || list.length === 0) continue;
      const emoji = CATEGORY_EMOJIS[catKey] || "📁";
      const label = CAT_LABELS[catKey] || catKey.toUpperCase();
      const cmdLines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)}`);
      body += createBracketBox(label, cmdLines, emoji);
    }

    const fullText = header + readMore + body + `\n_Shin-MD • Desarrollado por riokuroxi-svg_`;
    const banner = getRandomBanner({ useHourly: false });

    if (banner) {
      await sock.sendMessage(ctx.chatId, { image: banner, caption: fullText, contextInfo: channelCtx }, { quoted: ctx.full });
      return null;
    }

    await sock.sendMessage(ctx.chatId, { text: fullText, contextInfo: channelCtx }, { quoted: ctx.full });
    return null;
  },
};
