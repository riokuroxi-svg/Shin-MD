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
import { enviarMenu } from "#menu-kit";
import db from "../../src/services/ginko-db.js";
import { pickBanner } from "#lib/theme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Banner del menú, según la hora (día/noche).
 *
 * Ya no hay colección de fotos: los banners los dibuja tools/arte_marca.py
 * con formas y curvas, y son los mismos para todos. Si el dueño quiere los
 * suyos, los deja en media/banners/banner-day.* o banner-night.* y mandan
 * esos (theme.js ya busca primero ahí).
 */
function getMenuBanner() {
  try {
    const porHora = pickBanner();
    if (porHora) return fs.readFileSync(porHora);
  } catch {}

  const marca = path.resolve(__dirname, "../../assets/brand");
  const modo = new Date().getHours() >= 6 && new Date().getHours() < 19 ? "day" : "night";
  for (const p of [path.join(marca, `banner-${modo}.png`), path.join(marca, "banner-day.png")]) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
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

      const banner = getMenuBanner();
      if (banner) {
        await sock.sendMessage(ctx.chatId, { image: banner, caption: text }, { quoted: ctx.full });
        return null;
      }
      return text;
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

    // ── Botonera ──────────────────────────────────────────────────
    // WhatsApp solo dibuja TRES botones: el cuarto se caía sin avisar.
    // Ahora los de más viajan en la hoja desplegable (bottom_sheet),
    // y la lista lleva una primera sección destacada con lo que de
    // verdad usa la gente, para no obligar a bajar por categorías.
    const POPULARES = [
      { cmd: "play", titulo: "🎵 Descargar música", desc: "Pásame un nombre o un enlace" },
      { cmd: "sticker", titulo: "🖼️ Hacer sticker", desc: "Responde a una foto o vídeo" },
      { cmd: "traducir", titulo: "🌐 Traducir", desc: "Responde a un mensaje en otro idioma" },
      { cmd: "ia", titulo: "🤖 Preguntar a la IA", desc: "Escribe tu pregunta" },
    ];
    const existentes = new Set();
    for (const list of cats.values()) for (const c of (list || [])) {
      existentes.add(c.name);
      for (const a of (c.aliases || [])) existentes.add(a);
    }
    const popularRows = POPULARES
      .filter(p => existentes.has(p.cmd))
      .map(p => ({ id: p.cmd, title: p.titulo, description: p.desc }));

    const menuSections = [];
    if (popularRows.length) {
      menuSections.push({ title: "Lo más usado", highlight_label: "TOP", rows: popularRows });
    }
    menuSections.push({ title: "反魂 · Categorías", rows: categoryRows });

    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });
    const banner = getMenuBanner();

    // ── MENÚ ÚNICO (menu-kit) ─────────────────────────────────────
    // Una sola burbuja: vídeo en bucle + texto + botones + oferta.
    // Reemplaza las variantes 1/2/3/4: el «estilo» ya no son ramas de
    // código distintas, es el mismo envío con distinto contenido.
    // Se puede apagar con MENU_MODO=clasico o MENU_BOTONES=off.
    {
      const enviado = await enviarMenu(sock, ctx.chatId, {
        cuerpo: headerText +
          `╭──〔 📌 *GUÍA RÁPIDA* 〕──⬣\n` +
          `│ 🅞 Dueño • 🅟 Premium • 🅐 Admin\n` +
          `│ 🅖 Grupos • 🅛 Límite\n` +
          `╰─────────────────────────⬣\n\n` +
          `_Elige una categoría en el botón de abajo._\n\n` +
          `📢 *Canal:* ${channelUrl}`,
        pie: `Shin-MD v${version} • 反魂`,
        selector: { title: "📂 Explorar Categorías", sections: menuSections },
        botones: [
          { text: "📜 Ver todos los comandos", id: `${prefix}allmenu` },
          { text: "🏓 Ping", id: `${prefix}ping` },
          { text: "📢 Canal Oficial", url: channelUrl },
        ],
        cita: ctx.full,
        prefijo: prefix,
        notaDeVoz: true,
      });
      if (enviado) return null;
      // si el kit devolvió null (sin botones), sigue el texto de abajo
    }

    // La rama de variantes 1/2/3 ya no existe: si el kit no pudo mandar
    // la tarjeta (MENU_BOTONES=off, sin assets…), sale el texto completo.
    await sock.sendMessage(
      ctx.chatId,
      {
        text:
          headerText +
          readMore +
          fullCategoriesList +
          `\n📢 *Canal Oficial:* ${channelUrl}\n_Shin-MD v${version} · Desarrollado por riokuroxi-svg_`,
        contextInfo: channelCtx,
      },
      { quoted: ctx.full },
    );

    return null;
  },
};
