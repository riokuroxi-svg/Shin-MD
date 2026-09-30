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
  toSmallCaps,
  toMathSansBold,
  readMore,
  createBracketBox,
  getCommandBadges,
  formatUptime,
  getTimeGreeting,
  CATEGORY_EMOJIS,
} from "../../src/lib/formatter.js";
import {
  getWeatherSummary,
  getChannelContext,
  getVerifiedQuoted,
} from "../../src/lib/contextBuilder.js";
import { resolveChannel } from "../../src/lib/channel.js";
import { sendInteractive, singleSelect, quickReply, ctaUrl } from "#interactive";
import db from "../../src/services/ginko-db.js";
import { pickBanner } from "#lib/theme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Obtiene un banner aleatorio de la colección shuffle o assets por defecto
 */
function getRandomBanner() {
  // Tanda 1 del sistema de diseño: banner según la hora (día/noche).
  // media/banners/ manda sobre todo lo demás; si está vacía, se conserva
  // exactamente el comportamiento anterior (shuffle → assets → MENU_IMAGE).
  try {
    const porHora = pickBanner();
    if (porHora) return fs.readFileSync(porHora);
  } catch {}

  const shuffleDir = path.resolve(__dirname, "../../assets/image/shuffle");
  try {
    if (fs.existsSync(shuffleDir)) {
      const files = fs.readdirSync(shuffleDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length > 0) {
        const chosen = files[Math.floor(Math.random() * files.length)];
        return fs.readFileSync(path.join(shuffleDir, chosen));
      }
    }
  } catch {}

  const fallbackPaths = [
    process.env.MENU_IMAGE,
    path.resolve(__dirname, "../../assets/image/anita-landscape.jpg"),
    path.resolve(__dirname, "../../assets/image/anita.png"),
    path.resolve(__dirname, "../../assets/banner-default.png"),
    path.resolve(__dirname, "../../assets/bocchi-banner.png"),
  ].filter(Boolean);

  for (const p of fallbackPaths) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {}
  }
  return null;
}

/**
 * Obtiene el buffer del video animado para menús gifPlayback
 */
function getVideoAsset() {
  const videoPaths = [
    process.env.MENU_VIDEO_PATH,
    path.resolve(__dirname, "../../assets/video/anita-mp4.mp4"),
  ].filter(Boolean);

  for (const p of videoPaths) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {}
  }
  return null;
}

let __localVersion = null;
function localVersion() {
  if (__localVersion) return __localVersion;
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    __localVersion = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "3.0.3";
  } catch {
    __localVersion = "3.0.3";
  }
  return __localVersion;
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
  name: "menu",
  aliases: ["help", "ayuda", "h", "menupanel"],
  category: "info",
  description: "Muestra el menú interactivo principal y estético de Shin-MD",
  usage: ".menu [categoría]",
  cooldown: 2,
  priority: true,

  async handler(sock, ctx, engine, commands) {
    resolveChannel(sock, db).catch(() => {});
    const uptimeMs = engine?.getUptime?.() || (process.uptime() * 1000);
    const uptimeFormatted = formatUptime(uptimeMs);
    const greeting = getTimeGreeting();
    const version = localVersion();
    const prefix = ctx.usedPrefix || ".";
    const weather = await getWeatherSummary();
    const channelUrl = globalThis.links?.channel || "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522";

    // ── Clasificación de Comandos ──
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

    const sub = (ctx.arg || "").toLowerCase().trim();

    // ── Submenú específico si se pasa argumento (.menu descargas) ──
    if (sub) {
      const matchedCat = Object.keys(CAT_LABELS).find(c => c === sub || sub.startsWith(c) || c.startsWith(sub)) || sub;
      const list = cats.get(matchedCat) || [];

      if (list.length === 0) {
        return `❌ La categoría *${sub}* no existe o está vacía.\n\n💡 *Categorías disponibles:*\n> ${catOrder.filter(c => cats.has(c)).join(", ")}`;
      }

      const emoji = CATEGORY_EMOJIS[matchedCat] || "📁";
      const catTitle = CAT_LABELS[matchedCat] || matchedCat.toUpperCase();
      const lines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)} — ${c.description || "Sin descripción"}`);
      const text = `${greeting}\n\n` + createBracketBox(catTitle, lines, emoji) + `\n_Shin-MD v${version} · AGPL-3.0_`;

      const banner = getRandomBanner();
      if (banner) {
        await sock.sendMessage(ctx.chatId, { image: banner, caption: text }, { quoted: ctx.full });
        return null;
      }
      return text;
    }

    // ── Recuperar Variante de Menú Configurada ──
    let menuVariant = 1;
    try {
      const botJid = sock?.user?.id || "default";
      const settings = db.getSettings(botJid) || {};
      menuVariant = Number(settings.menu_variant || settings.menuVariant || 1);
    } catch {
      menuVariant = 1;
    }

    // ── Ficha de Usuario y Estado del Bot ──
    const userRole = ctx.isOwner ? "👑 Creador / Owner" : (ctx.isAdmin ? "🛡️ Administrador" : "👤 Usuario");
    const pushName = ctx.pushName || "Usuario";
    const senderNumber = (ctx.senderId || "").split("@")[0].split(":")[0];

    let headerText = `${greeting}\n\n`;
    headerText += `      *${pushName}*\n\n`;
    headerText += `╭┈┈⫹⫺ *INFORMACIÓN SHIN-MD* ⫹⫺┈┈╮\n`;
    headerText += `│ ◈ *Nombre* : *SHIN-MD*\n`;
    headerText += `│ ◈ *Versión* : *${version}*\n`;
    headerText += `│ ◈ *Motor* : \`Baileys Multi-Device\`\n`;
    headerText += `│ ◈ *Uptime* : *${uptimeFormatted}*\n`;
    headerText += `│ ◈ *Clima* : ${weather}\n`;
    headerText += `│ ◈ *Comandos* : *${seenNames.size} únicos*\n`;
    headerText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;

    headerText += `╭┈┈⫹⫺ *INFORMACIÓN USUARIO* ⫹⫺┈┈╮\n`;
    headerText += `│ ◈ *Nombre* : *${pushName}*\n`;
    headerText += `│ ◈ *Rango* : *${userRole}*\n`;
    headerText += `│ ◈ *Número* : +${senderNumber}\n`;
    headerText += `│ ◈ *Prefijo* : \`${prefix}\`\n`;
    headerText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;

    // ── Construcción de Lista de Categorías ──
    const categoryRows = [];
    let fullCategoriesList = "";

    for (const catKey of catOrder) {
      const list = cats.get(catKey);
      if (!list || list.length === 0) continue;
      const emoji = CATEGORY_EMOJIS[catKey] || "📁";
      const label = CAT_LABELS[catKey] || catKey.toUpperCase();

      categoryRows.push({
        id: `menucat:${catKey}`,
        title: `${emoji} ${label}`,
        description: `${list.length} comandos disponibles`,
      });

      const cmdLines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)}`);
      fullCategoriesList += createBracketBox(label, cmdLines, emoji);
    }

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });
    const banner = getRandomBanner();
    const videoAsset = getVideoAsset();

    // ── VARIANTES DE RENDERIZADO ──

    // Variante 3: Video Animado GifPlayback
    if (menuVariant === 3 && videoAsset) {
      const interactiveBody = headerText +
        `╭──〔 📌 *GUÍA RÁPIDA* 〕──⬣\n` +
        `│ 🅞 Dueño • 🅟 Premium • 🅐 Admin\n` +
        `│ 🅖 Grupos • 🅛 Límite\n` +
        `╰─────────────────────────⬣\n\n` +
        `_Selecciona una categoría en el botón desplegable de abajo._\n\n` +
        `📢 *Canal:* ${channelUrl}`;

      await sendInteractive(sock, ctx.chatId, {
        title: "✨ SHIN-MD " + version,
        body: interactiveBody,
        footer: "Shin-MD • Bot de WhatsApp Profesional\ngithub.com/riokuroxi-svg/Shin-MD",
        video: videoAsset,
        gifPlayback: true,
        buttons: [
          singleSelect("📂 Explorar Categorías", [{ title: "反魂 · Categorías", rows: categoryRows }]),
          quickReply("📜 Ver Todo (.allmenu)", "allmenu"),
          quickReply("🏓 Ping", "ping"),
          ctaUrl("📢 Canal Oficial", channelUrl),
        ],
        quoted: ctx.full,
        fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
      });
      return null;
    }

    // Variante 2 (o en Grupos de WhatsApp): Formato visual estético garantizado 100% visible
    if (ctx.isGroup || menuVariant === 2) {
      const finalContent = headerText +
        `_Toca "Leer más" para desplegar todas las categorías_ ⬇️\n` +
        readMore +
        fullCategoriesList +
        `\n📢 *Canal Oficial:* ${channelUrl}\n_Shin-MD v${version} · Desarrollado por riokuroxi-svg_`;

      if (banner) {
        await sock.sendMessage(
          ctx.chatId,
          { image: banner, caption: finalContent, contextInfo: channelCtx },
          { quoted: ctx.full }
        );
        return null;
      }

      await sock.sendMessage(
        ctx.chatId,
        { text: finalContent, contextInfo: channelCtx },
        { quoted: ctx.full }
      );
      return null;
    }

    // Variante 1 (Por defecto en DM): Tarjeta Interactiva con Banner Rotativo
    const interactiveBody = headerText +
      `╭──〔 📌 *GUÍA RÁPIDA* 〕──⬣\n` +
      `│ 🅞 Dueño • 🅟 Premium • 🅐 Admin\n` +
      `│ 🅖 Grupos • 🅛 Límite\n` +
      `╰─────────────────────────⬣\n\n` +
      `_Selecciona una categoría en el botón desplegable de abajo para ver sus comandos._\n\n` +
      `📢 *Canal:* ${channelUrl}`;

    await sendInteractive(sock, ctx.chatId, {
      title: "✨ SHIN-MD " + version,
      body: interactiveBody,
      footer: "Shin-MD • Bot de WhatsApp Profesional\ngithub.com/riokuroxi-svg/Shin-MD",
      image: banner,
      buttons: [
        singleSelect("📂 Explorar Categorías", [{ title: "反魂 · Categorías", rows: categoryRows }]),
        quickReply("📜 Ver Todo (.allmenu)", "allmenu"),
        quickReply("🏓 Ping", "ping"),
        ctaUrl("📢 Canal Oficial", channelUrl),
      ],
      quoted: ctx.full,
      fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
    });

    return null;
  },
};
