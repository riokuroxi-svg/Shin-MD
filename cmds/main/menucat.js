/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menucat.js — Menú de categoría con eventMessage nativo + interactivo
//
//  Envía DOS mensajes apilados:
//    1. eventMessage nativo (etiqueta 🏷️ con saludo, fecha, crédito)
//    2. Tarjeta interactiva con imagen, lista de comandos, botones
//
//  El eventMessage usa la primitiva proto.Message.EventMessage de
//  Baileys, igual que el comando .evento — se renderiza como la
//  tarjeta nativa de evento de WhatsApp con su ícono 🏷️.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import log from "#logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const CAT_ICONS = {
  info: "ℹ️",
  main: "⭐",
  utils: "🔧",
  utility: "🛠️",
  downloads: "📥",
  anime: "🎌",
  stickers: "🎨",
  economy: "💰",
  games: "🎮",
  fun: "🎉",
  gacha: "🎰",
  group: "👥",
  profile: "👤",
  socket: "🔌",
  nsfw: "🔞",
  owner: "👑",
  otros: "📁",
};

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Busca imágenes en el pool local. Devuelve un Buffer aleatorio o null.
 */
function getRandomMenuImage() {
  const pools = [
    path.resolve(__dirname, "../../assets/menus"),
    path.resolve(__dirname, "../../assets/image/shuffle"),
    path.resolve(__dirname, "../../assets"),
  ];
  const candidates = [];
  for (const dir of pools) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
      for (const f of files) candidates.push(path.join(dir, f));
    } catch {}
  }
  if (candidates.length === 0) return null;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  try { return fs.readFileSync(chosen); } catch { return null; }
}

/**
 * Construye la lista de comandos decorada.
 */
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

/**
 * Envía el eventMessage nativo (etiqueta 🏷️).
 * Usa generateWAMessageFromContent + relayMessage, igual que .evento.
 * Lleva la etiqueta verde del canal si hay canal configurado. El
 * "reenviado muchas veces" (forwardingScore alto) solo con RICH_EXTRA=1,
 * igual que en el resto del bot, porque es una señal de bot detectable.
 */
async function sendEventHeader(sock, chatId, { name, description, startTime }) {
  try {
    const { generateWAMessageFromContent } = await import("baileys");
    const endTime = startTime + 2 * 60 * 60; // +2 horas
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

    // Inyectar contextInfo con etiqueta verde al eventMessage
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

// ── Handler ────────────────────────────────────────────────────────

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

    // ── Recopilar comandos por categoría ──
    const cats = new Map();
    const seenNames = new Set();
    let pluginCount = 0;
    let caseCount = 0;

    for (const [, cmd] of commands || []) {
      if (!cmd || seenNames.has(cmd.name) || cmd.name === "menu" || cmd.name === "menucat") continue;
      seenNames.add(cmd.name);
      const c = (cmd.category || "otros").toLowerCase();
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(cmd);
      if (typeof cmd.handler === "function") pluginCount++;
      else caseCount++;
    }

    const totalCommands = pluginCount + caseCount;

    // ── Calcular timestamps para eventMessage ──
    const now = new Date();
    const expirationTime = Math.floor((now.getTime() + 24 * 60 * 60 * 1000) / 1000);
    const greeting = getTimeGreeting();

    // ════════════════════════════════════════════════════════════════
    //  SIN ARGUMENTO → Lista de categorías
    // ════════════════════════════════════════════════════════════════
    if (!sub) {
      // ── 1. Enviar eventMessage nativo (etiqueta 🏷️) ──
      await sendEventHeader(sock, ctx.chatId, {
        name: greeting,
        description: `反魂 ${totalCommands} comandos · Creado por riokuroxi-svg`,
        startTime: expirationTime,
      });

      // ── 2. Enviar tarjeta interactiva con imagen + categorías ──
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

    // ════════════════════════════════════════════════════════════════
    //  CON ARGUMENTO → Comandos de la categoría
    // ════════════════════════════════════════════════════════════════
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

    // ── 1. Enviar eventMessage nativo (etiqueta 🏷️) ──
    await sendEventHeader(sock, ctx.chatId, {
      name: `${greeting} · ${emoji} ${label}`,
      description: `反魂 ${list.length} comandos · Creado por riokuroxi-svg`,
      startTime: expirationTime,
    });

    // ── 2. Enviar tarjeta interactiva con imagen + comandos ──
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