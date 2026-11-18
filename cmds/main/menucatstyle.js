/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menucatstyle.js — Menú de categorías elegante
//  Lista desplegable nativa (single_select) + botón de enlace.
//  Solo usa botones estándar de WhatsApp (quick_reply, cta_url,
//  single_select) sin envoltorios viewOnce, con respaldo a texto,
//  para que el mensaje se vea en cualquier versión sin avisos.
//  Los ids `menucatstyle:<cat>` los convierte el router en
//  `.menucatstyle <cat>` automáticamente.
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
  ctaUrl,
} from "../../src/commands/interactive.js";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import {
  CAT_LABELS,
  CAT_ICONS,
  collectCategories,
  getRandomMenuImage,
} from "#lib/menu-shared";

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

export default {
  name: "menucatstyle",
  aliases: ["mcs"],
  category: "info",
  description: "Menú de categorías con diseño elegante y botones nativos",
  usage: ".menucatstyle [categoría]",
  cooldown: 2,
  priority: true,

  async handler(sock, ctx, engine, commands) {
    const prefix = ctx.usedPrefix || ".";
    const sub = (ctx.arg || "").toLowerCase().trim();
    const channelUrl =
      globalThis.links?.channel ||
      "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522";

    const { cats, pluginCount, caseCount, totalCommands } = collectCategories(commands, {
      exclude: ["menu", "menucat", "menucatstyle"],
    });
    const greeting = getTimeGreeting();
    const pushName = ctx.pushName || "Usuario";

    // ── .menucatstyle → selector de categorías ──
    if (!sub) {
      const image = getRandomMenuImage();
      const categoryRows = [];
      const sortedCats = Array.from(cats.entries()).sort((a, b) => b[1].length - a[1].length);
      for (const [cat, cmds] of sortedCats) {
        const emoji = CAT_ICONS[cat] || CATEGORY_EMOJIS[cat] || "📁";
        const label = CAT_LABELS[cat] || cat.toUpperCase();
        categoryRows.push({
          id: `menucatstyle:${cat}`,
          title: `${emoji} ${label}`,
          description: `${cmds.length} comandos`,
        });
      }

      const body =
        `✦ ${greeting}, *${pushName}*\n\n` +
        `╭──〔 *CATEGORÍAS* 〕──⬣\n` +
        `│ Selecciona una categoría en la\n` +
        `│ lista desplegable para ver sus\n` +
        `│ comandos disponibles.\n` +
        `╰──────────────⬣\n\n` +
        `◈ *Total:* ${totalCommands} comandos\n` +
        `◈ *Desglose:* ${pluginCount} plugin + ${caseCount} case`;

      const buttons = [
        singleSelect("Selecciona una categoría", [{ title: "Categorías", rows: categoryRows }]),
        ctaUrl("Visitar", channelUrl),
        quickReply("Ver todo", "allmenu"),
        quickReply("Menú", "menu"),
      ];

      try {
        await sendInteractive(sock, ctx.chatId, {
          title: `✦ ${toSmallCaps("shin-md")} · Categorías`,
          body,
          footer: `反魂 Shin-MD · github.com/riokuroxi-svg/Shin-MD`,
          image,
          buttons,
          contextInfo: getChannelContext({ mentionedJid: [ctx.senderId] }),
          fallbackText: body,
        });
      } catch {
        await sock.sendMessage(ctx.chatId, { text: body });
      }
      return null;
    }

    // ── .menucatstyle <categoría> → detalle ──
    const matchedCat =
      Object.keys(CAT_LABELS).find((c) => c === sub || sub.startsWith(c) || c.startsWith(sub)) || sub;
    const list = cats.get(matchedCat) || [];

    if (list.length === 0) {
      const available = Object.keys(CAT_LABELS)
        .filter((c) => cats.has(c))
        .map((c) => `• \`${prefix}menucatstyle ${c}\``)
        .join("\n");
      return `❌ Categoría *${sub}* no encontrada.\n\n📂 *Disponibles:*\n${available}`;
    }

    const emoji = CAT_ICONS[matchedCat] || CATEGORY_EMOJIS[matchedCat] || "📁";
    const label = CAT_LABELS[matchedCat] || matchedCat.toUpperCase();
    const image = getRandomMenuImage();
    const cmdLines = buildCommandList(list, prefix);

    const body =
      `╭──〔 ${emoji} *${label}* 〕──⬣\n` +
      cmdLines.join("\n") + "\n" +
      `╰──────────────⬣\n\n` +
      `◈ *Total:* ${list.length} comandos en esta categoría\n` +
      `◈ *Desglose:* ${pluginCount} plugin + ${caseCount} case\n\n` +
      `_Usa los botones para navegar._`;

    const buttons = [
      quickReply("Volver a categorías", "menucatstyle"),
      ctaUrl("Visitar", channelUrl),
      quickReply("Menú principal", "menu"),
    ];

    try {
      await sendInteractive(sock, ctx.chatId, {
        title: `${emoji} ${toSmallCaps("shin-md")} · ${label}`,
        body,
        footer: `反魂 Shin-MD · ${list.length} comandos en ${label}`,
        image,
        buttons,
        contextInfo: getChannelContext({ mentionedJid: [ctx.senderId] }),
        fallbackText: body,
      });
    } catch {
      await sock.sendMessage(ctx.chatId, { text: body });
    }
    return null;
  },
};
