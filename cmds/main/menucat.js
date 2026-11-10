/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menucat.js — Menú de categoría con eventMessage nativo + interactivo
// ═══════════════════════════════════════════════════════════════════

import {
  getCommandBadges,
  CATEGORY_EMOJIS,
  getTimeGreeting,
  toSmallCaps,
} from "../../src/lib/formatter.js";
import {
  sendInteractive,
  quickReply,
  singleSelect,
} from "../../src/commands/interactive.js";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import {
  CAT_LABELS,
  CAT_ICONS,
  collectCategories,
  getRandomMenuImage,
} from "#lib/menu-shared";
import log from "#logger";

function buildCommandList(commands, prefix) {
  const lines = [];
  for (const cmd of commands) {
    const badges = getCommandBadges(cmd);
    const hasInfo = cmd.description && cmd.description.length > 5;
    const suffix = hasInfo ? " ⓘ" : "";
    lines.push(`│ >${prefix}${cmd.name}${badges}${suffix}`);
  }
  return lines;
}

async function sendEventHeader(sock, chatId, { name, description, startTime }) {
  try {
    const { generateWAMessageFromContent } = await import("baileys");
    const endTime = startTime + 2 * 60 * 60;
    const channelCtx = getChannelContext({ mentionedJid: [] });

    const contenido = {
      eventMessage: {
        isCanceled: false,
        name: String(name),
        description: String(description),
        startTime: Math.floor(startTime),
        endTime: Math.floor(endTime),
        extraGuestsAllowed: false,
      },
    };

    if (channelCtx.forwardedNewsletterMessageInfo) {
      contenido.eventMessage.contextInfo = {
        isForwarded: true,
        forwardingScore: process.env.RICH_EXTRA === "1" ? 9999 : 1,
        forwardedNewsletterMessageInfo: channelCtx.forwardedNewsletterMessageInfo,
      };
    }

    const generado = generateWAMessageFromContent(chatId, contenido, {
      userJid: sock.user?.id,
      timestamp: new Date(),
    });

    if (!generado?.key?.id) throw new Error("no se generó eventMessage");

    await sock.relayMessage(chatId, generado.message, { messageId: generado.key.id });
    return true;
  } catch (err) {
    log.warn("menucat: no se pudo mandar la etiqueta de evento (" + (err.message || err) + ")");
    return false;
  }
}

export default {
  name: "menucat",
  aliases: ["mc", "category", "cat"],
  category: "info",
  description: "Muestra los comandos de una categoría con estilo enriquecido",
  usage: ".menucat <categoría>",
  cooldown: 2,
  priority: true,

  async handler(sock, ctx, engine, commands) {
    const prefix = ctx.usedPrefix || ".";
    const sub = (ctx.arg || "").toLowerCase().trim();
    const { cats, pluginCount, caseCount, totalCommands } = collectCategories(commands, {
      exclude: ["menu", "menucat"],
    });

    const expirationTime = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);
    const greeting = getTimeGreeting();

    if (!sub) {
      await sendEventHeader(sock, ctx.chatId, {
        name: greeting,
        description: `反魂 ${totalCommands} comandos · Creado por riokuroxi-svg`,
        startTime: expirationTime,
      });

      const image = getRandomMenuImage();
      const categoryRows = [];
      const sortedCats = Array.from(cats.entries()).sort((a, b) => b[1].length - a[1].length);
      for (const [cat, cmds] of sortedCats) {
        const emoji = CAT_ICONS[cat] || CATEGORY_EMOJIS[cat] || "📁";
        const label = CAT_LABELS[cat] || cat.toUpperCase();
        categoryRows.push({
          id: `menucat:${cat}`,
          title: `${emoji} ${label}`,
          description: `${cmds.length} comandos`,
        });
      }

      const body =
        `╭──〔 ℹ *CATEGORÍAS* 〕──⬣\n` +
        `│ Selecciona una categoría del botón\n` +
        `│ desplegable para ver sus comandos.\n` +
        `╰──────────────⬣\n\n` +
        `📊 *Total:* ${totalCommands} comandos\n` +
        `📦 *Desglose:* ${pluginCount} plugin + ${caseCount} case`;

      const menuSections = [{ title: "反魂 · Categorías", rows: categoryRows }];
      const buttons = [
        singleSelect("📂 Explorar Categorías", menuSections),
        quickReply("📜 Ver Todo", "allmenu"),
        quickReply("🏓 Ping", "ping"),
      ];

      try {
        await sendInteractive(sock, ctx.chatId, {
          title: `✨ ${toSmallCaps("shin-md")} · Categorías`,
          body,
          footer: `反魂 Shin-MD · github.com/riokuroxi-svg/Shin-MD\nCódigo: Creado por riokuroxi-svg`,
          image,
          buttons,
          contextInfo: getChannelContext({ mentionedJid: [ctx.senderId], channelName: "🤖 Texto generado por AI" }),
          fallbackText: body,
        });
      } catch {
        await sock.sendMessage(ctx.chatId, { text: body });
      }
      return null;
    }

    const matchedCat = Object.keys(CAT_LABELS).find(
      c => c === sub || sub.startsWith(c) || c.startsWith(sub)
    ) || sub;
    const list = cats.get(matchedCat) || [];

    if (list.length === 0) {
      const available = Object.keys(CAT_LABELS)
        .filter(c => cats.has(c))
        .map(c => `• \`${prefix}menucat ${c}\``)
        .join("\n");
      return `❌ Categoría *${sub}* no encontrada.\n\n📂 *Disponibles:*\n${available}`;
    }

    const emoji = CAT_ICONS[matchedCat] || CATEGORY_EMOJIS[matchedCat] || "📁";
    const label = CAT_LABELS[matchedCat] || matchedCat.toUpperCase();

    await sendEventHeader(sock, ctx.chatId, {
      name: `${greeting} · ${emoji} ${label}`,
      description: `反魂 ${list.length} comandos · Creado por riokuroxi-svg`,
      startTime: expirationTime,
    });

    const image = getRandomMenuImage();
    const cmdLines = buildCommandList(list, prefix);

    const body =
      `╭──〔 ${emoji} *${label}* 〕──⬣\n` +
      cmdLines.join("\n") + "\n" +
      `╰──────────────⬣\n\n` +
      `📊 *Total:* ${list.length} comandos en esta categoría\n` +
      `📦 *Desglose:* ${pluginCount} plugin + ${caseCount} case\n\n` +
      `_Selecciona un botón para volver._`;

    const buttons = [
      quickReply("↩ 📁 Volver a Categorías", "menucat"),
      quickReply("↩ 🏠 Menú Principal", "menu"),
    ];

    try {
      await sendInteractive(sock, ctx.chatId, {
        title: `${emoji} ${toSmallCaps("shin-md")} · ${label}`,
        body,
        footer: `反魂 Shin-MD · Creado por riokuroxi-svg\n${list.length} comandos en ${label}`,
        image,
        buttons,
        contextInfo: getChannelContext({ mentionedJid: [ctx.senderId], channelName: "🔍 Buscando en la web..." }),
        fallbackText: body,
      });
    } catch {
      await sock.sendMessage(ctx.chatId, { text: body });
    }
    return null;
  },
};
