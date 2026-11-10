/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import { botJid } from "#serialize";
import {
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
} from "../../src/lib/contextBuilder.js";
import { resolveChannel } from "../../src/lib/channel.js";
import {
  CAT_LABELS,
  CAT_ORDER,
  localVersion,
  collectCategories,
  getRandomBanner,
  getVideoAsset,
} from "#lib/menu-shared";
import { sendInteractive, singleSelect, quickReply, ctaUrl, ctaCopy } from "#interactive";
import db from "../../src/services/ginko-db.js";

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

    const { cats, seenNames } = collectCategories(commands, { exclude: ["menu"] });
    const sub = (ctx.arg || "").toLowerCase().trim();

    // Submenú específico si se pasa argumento (.menu descargas)
    if (sub) {
      const matchedCat = Object.keys(CAT_LABELS).find(c => c === sub || sub.startsWith(c) || c.startsWith(sub)) || sub;
      const list = cats.get(matchedCat) || [];

      if (list.length === 0) {
        return `❌ La categoría *${sub}* no existe o está vacía.\n\n💡 *Categorías disponibles:*\n> ${CAT_ORDER.filter(c => cats.has(c)).join(", ")}`;
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

    // Recuperar variante de menú configurada usando JID normalizado del bot
    let menuVariant = 1;
    try {
      const botId = botJid(sock) || "default";
      const settings = db.getSettings(botId) || {};
      menuVariant = Number(settings.menu_variant || settings.menuVariant || 1);
    } catch {
      menuVariant = 1;
    }

    const ownerCheck = typeof ctx.isOwner === "function" ? ctx.isOwner() : !!ctx.isOwner;
    const userRole = ownerCheck ? "👑 Creador / Owner" : (ctx.isAdmin ? "🛡️ Administrador" : "👤 Usuario");
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

    const categoryRows = [];
    let fullCategoriesList = "";

    for (const catKey of CAT_ORDER) {
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

    const POPULARES = [
      { cmd: "play", titulo: "🎵 Descargar música", desc: "Pásame un nombre o un enlace" },
      { cmd: "sticker", titulo: "🖼️ Hacer sticker", desc: "Responde a una foto o vídeo" },
      { cmd: "traducir", titulo: "🌐 Traducir", desc: "Responde a un mensaje en otro idioma" },
      { cmd: "ia", titulo: "🤖 Preguntar a la IA", desc: "Escribe tu pregunta" },
    ];
    const existentes = new Set();
    for (const list of cats.values()) {
      for (const c of list || []) {
        existentes.add(c.name);
        for (const a of c.aliases || []) existentes.add(a);
      }
    }
    const popularRows = POPULARES
      .filter(p => existentes.has(p.cmd))
      .map(p => ({ id: p.cmd, title: p.titulo, description: p.desc }));

    const menuSections = [];
    if (popularRows.length) {
      menuSections.push({ title: "Lo más usado", highlight_label: "TOP", rows: popularRows });
    }
    menuSections.push({ title: "反魂 · Categorías", rows: categoryRows });

    const menuButtons = [
      singleSelect("📂 Explorar Categorías", menuSections),
      quickReply("🗂️ Categorías (.menucat)", "menucat"),
      quickReply("📜 Ver Todo (.allmenu)", "allmenu"),
      quickReply("🏓 Ping", "ping"),
      ctaUrl("📢 Canal Oficial", channelUrl),
      ctaCopy("📋 Copiar prefijo", prefix),
      ctaUrl("⭐ Código fuente", "https://github.com/riokuroxi-svg/Shin-MD"),
    ];
    const menuHoja = {
      titulo: "Shin-MD · más opciones",
      boton: "Ver todo",
      divisiones: [2],
    };

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });
    const banner = getRandomBanner();
    const videoAsset = getVideoAsset();

    // Variante 4: Compact Dashboard
    if (menuVariant === 4) {
      const ramMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      const compactBody =
        `📊 *SHIN-MD v${version} · Panel Rápido*\n` +
        `Hola *${pushName}* (${userRole})\n\n` +
        `• *Uptime:* ${uptimeFormatted}\n` +
        `• *RAM:* ${ramMb} MB · *Prefijo:* \`${prefix}\`\n` +
        `• *Comandos:* ${seenNames.size} en ${cats.size} categorías\n` +
        `• *Clima:* ${weather}\n\n` +
        `_Usa el selector o los botones para navegar._`;

      await sendInteractive(sock, ctx.chatId, {
        title: `📊 SHIN-MD ${version}`,
        body: compactBody,
        footer: "Shin-MD · Dashboard Compacto",
        buttons: menuButtons,
        hoja: menuHoja,
        quoted: ctx.full,
        fallbackText: compactBody + `\n\n${prefix}allmenu · ${prefix}menucat · ${prefix}ping`,
      });
      return null;
    }

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
        buttons: menuButtons,
        hoja: menuHoja,
        quoted: ctx.full,
        fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
      });
      return null;
    }

    // Variante 2: Menú de texto completo con ReadMore (sin botones)
    if (menuVariant === 2) {
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

    // Variante 1 (Por defecto): Tarjeta Interactiva con Banner Rotativo
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
      buttons: menuButtons,
      hoja: menuHoja,
      quoted: ctx.full,
      fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
    });

    return null;
  },
};
