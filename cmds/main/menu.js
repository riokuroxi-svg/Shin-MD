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
  listMenuPosters,
  getMenuImagePath,
} from "#lib/menu-shared";
import { sendInteractive, sendVoiceNote, singleSelect, quickReply, ctaUrl, ctaCopy } from "#interactive";
import { sendMenuCard } from "#lib/menu-card";
import { getVideoPath } from "#lib/menu-shared";
import db from "../../src/services/ginko-db.js";

/**
 * Nota de voz del menú: solo suena si el dueño dejó una música puesta en
 * data/menu-vn.*. No es obligatoria y nunca rompe el menú (falla en
 * silencio si no hay archivo o no hay ffmpeg).
 */
async function mandarNotaDeVoz(sock, ctx) {
  try {
    const { ROOT_DIR: raiz } = await import("#lib/menu-shared");
    const [fsMod, pathMod] = await Promise.all([import("node:fs"), import("node:path")]);
    const dir = pathMod.join(raiz, "data");
    if (!fsMod.existsSync(dir)) return;
    const archivo = fsMod.readdirSync(dir).find((f) => /^menu-vn\.(mp3|ogg|opus|m4a|wav)$/i.test(f));
    if (!archivo) return;
    await sendVoiceNote(sock, ctx.chatId, pathMod.join(dir, archivo), { quoted: ctx.full });
  } catch {
    /* la guarnición nunca rompe el menú */
  }
}

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
    // El clima es un extra, no el menú: si tarda, se usa un valor neutro.
    // Antes getWeatherSummary() podía colgar la respuesta hasta 6 s.
    const weather = await Promise.race([
      getWeatherSummary().catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 1200)),
    ]).then((w) => w || "—");
    const channelUrl = globalThis.links?.channel || "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522";

    const { cats, seenNames } = collectCategories(commands, { exclude: ["menu"] });
    const sub = (ctx.arg || "").toLowerCase().trim();

    // El menú se reconstruye entero (222 comandos, cajas, badges) en cada
    // invocación y el comando es `priority: true`: un atacante que lo repite
    // obliga a ese trabajo por cada mensaje, saltándose el tope diario.
    // Se cachea 60 s POR USUARIO (el menú lleva su nombre, su rango y su
    // número: cachearlo por chat se los enseñaría a otro). Solo se cachean
    // las respuestas de TEXTO: las tarjetas llevan un token de un solo uso.
    const __claveMenu = "menu:" + (ctx.senderId || ctx.chatId || "?") + ":" + prefix + ":" + sub + ":" + (ctx.pushName || "");
    const __cache = globalThis.__shinMenuCache || (globalThis.__shinMenuCache = new Map());
    const __hit = __cache.get(__claveMenu);
    if (__hit && !__hit.esTarjeta && Date.now() - __hit.ts < 60000) return __hit.valor;
    const __guardarMenu = (valor, esTarjeta) => {
      try {
        if (__cache.size > 400) __cache.clear();
        __cache.set(__claveMenu, { valor, ts: Date.now(), esTarjeta: !!esTarjeta });
      } catch { /* la caché nunca debe tumbar el menú */ }
      return valor;
    };

    // Submenú específico si se pasa argumento (.menu descargas)
    if (sub) {
      const matchedCat = Object.keys(CAT_LABELS).find(c => c === sub || sub.startsWith(c) || c.startsWith(sub)) || sub;
      const list = cats.get(matchedCat) || [];

      if (list.length === 0) {
        return __guardarMenu(`❌ La categoría *${sub}* no existe o está vacía.\n\n💡 *Categorías disponibles:*\n> ${CAT_ORDER.filter(c => cats.has(c)).join(", ")}`, false);
      }

      const emoji = CATEGORY_EMOJIS[matchedCat] || "📁";
      const catTitle = CAT_LABELS[matchedCat] || matchedCat.toUpperCase();
      const lines = list.map(c => `\`${prefix}${c.name}\`${getCommandBadges(c)} — ${c.description || "Sin descripción"}`);
      const text = `${greeting}\n\n` + createBracketBox(catTitle, lines, emoji) + `\n_Shin-MD v${version} · AGPL-3.0_`;

      const banner = getRandomBanner();
      if (banner) {
        await sock.sendMessage(ctx.chatId, { image: banner, caption: text }, { quoted: ctx.full });
        return __guardarMenu(null, true);
      }
      return __guardarMenu(text, false);
    }

    // Recuperar variante de menú configurada usando JID normalizado del bot.
    // Por defecto se usa la 3 (tarjeta con video en bucle): la variante 1 con
    // botones sueltos ya no se ve en los clientes nuevos.
    // 5 = tarjeta única (viewOnce + video + single_select), el formato que
    // se ve completo en Android. Es la que va por defecto.
    const VARIANTE_POR_DEFECTO = 5;
    let menuVariant = VARIANTE_POR_DEFECTO;
    try {
      const botId = botJid(sock) || "default";
      const settings = db.getSettings(botId) || {};
      menuVariant = Number(settings.menu_variant || settings.menuVariant || VARIANTE_POR_DEFECTO);
    } catch {
      menuVariant = VARIANTE_POR_DEFECTO;
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

    // El póster que acompaña al selector: el primer archivo de assets/menus.
    const [posterPath] = listMenuPosters();

    const menuButtons = [
      singleSelect("📂 Explorar Categorías", menuSections, { thumbnailPath: posterPath || undefined }),
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
    // OJO: ni el banner ni el video se cargan aquí. Antes getVideoAsset()
    // leía 3 MB de disco en CADA .menu para nada (la variante 5 ni lo usa
    // en memoria: usa la ruta con caché). Eso era parte del "no responde".
    // Cada variante pide lo suyo justo antes de enviarlo (carga perezosa).

    // Variante 5 (por defecto): tarjeta única con botones nativos.
    // Un solo mensaje: header de video en bucle + body + single_select.
    // El video se sube una vez y queda cacheado: si ya está en caché,
    // el mensaje sale al instante (antes tardaba 10-18 s por la subida).
    if (menuVariant === 5) {
      // La variante 5 responde con el selector completo, pero cacheado por
      // usuario: no se rearma ni se vuelve a subir el video en cada .menu.
      // OJO: la tarjeta NO se cachea. Durante un tiempo se guardó un
      // `null` 60 s para no rearmar el mensaje, y el efecto era que el
      // segundo .menu seguido no enviaba NADA (parecía que el bot se
      // había muerto). Lo único caro —subir el video— ya está cacheado
      // aparte en data/media-cache.json, así que rearmar la tarjeta
      // cuesta menos de un milisegundo.
      // Imagen por defecto. Con `MENU_MEDIA=video` se puede volver al
      // video en bucle, pero un video en el encabezado depende de que el
      // cliente lo reproduzca: en cuanto el mismo chat tiene otro
      // reproductor abierto se queda congelado en el primer fotograma y
      // además se descarga antes de verse. La imagen se pinta siempre.
      const usarVideo = String(process.env.MENU_MEDIA || "").toLowerCase() === "video";
      const videoPath = usarVideo ? getVideoPath() : null;
      const imagePath = usarVideo ? null : getMenuImagePath();
      const cardBody =
        `${greeting}\n\n*${pushName}*\n` +
        `╭┈┈ *SHIN-MD v${version}* ┈┈╮\n` +
        `│ ◈ Uptime: *${uptimeFormatted}*\n` +
        `│ ◈ Comandos: *${seenNames.size}* en *${cats.size}* categorías\n` +
        `│ ◈ Rango: *${userRole}*\n` +
        `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n` +
        `_Elige una categoría en el botón de abajo._\n` +
        `📢 *Canal:* ${channelUrl}`;

      const enviado = await sendMenuCard(sock, ctx.chatId, {
        body: cardBody,
        footer: "Shin-MD • Bot de WhatsApp Profesional",
        title: `✨ SHIN-MD ${version}`,
        ...(usarVideo ? { videoPath } : { imagePath }),
        selector: { title: "📂 Explorar Categorías", sections: menuSections },
        contextInfo: getChannelContext({ mentionedJid: [ctx.senderId] }),
        quoted: ctx.full,
      });
      if (enviado) {
        void mandarNotaDeVoz(sock, ctx);
        return null;
      }
      // si la tarjeta falló, seguimos abajo con la variante 3
    }

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
      void mandarNotaDeVoz(sock, ctx);
      return null;
    }

    // Variante 3: Video Animado GifPlayback (buffer leído solo al usarse)
    const videoParaV3 = menuVariant === 3 ? getVideoAsset() : null;
    if (menuVariant === 3 && videoParaV3) {
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
        video: videoParaV3,
        gifPlayback: true,
        buttons: menuButtons,
        hoja: menuHoja,
        quoted: ctx.full,
        fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
      });
      void mandarNotaDeVoz(sock, ctx);
      return null;
    }

    // Variante 2: Menú de texto completo con ReadMore (sin botones)
    if (menuVariant === 2) {
      const finalContent = headerText +
        `_Toca "Leer más" para desplegar todas las categorías_ ⬇️\n` +
        readMore +
        fullCategoriesList +
        `\n📢 *Canal Oficial:* ${channelUrl}\n_Shin-MD v${version} · Desarrollado por riokuroxi-svg_`;

      const bannerV2 = getRandomBanner();
      if (bannerV2) {
        await sock.sendMessage(
          ctx.chatId,
          { image: bannerV2, caption: finalContent, contextInfo: channelCtx },
          { quoted: ctx.full }
        );
        void mandarNotaDeVoz(sock, ctx);
        return null;
      }

      await sock.sendMessage(
        ctx.chatId,
        { text: finalContent, contextInfo: channelCtx },
        { quoted: ctx.full }
      );
      void mandarNotaDeVoz(sock, ctx);
      return null;
    }

    // Variante 1: Tarjeta Interactiva con Banner Rotativo
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
      image: getRandomBanner(),
      buttons: menuButtons,
      hoja: menuHoja,
      quoted: ctx.full,
      fallbackText: headerText + readMore + fullCategoriesList + `\n📢 *Canal Oficial:* ${channelUrl}`,
    });

    void mandarNotaDeVoz(sock, ctx);
    return null;
  },
};
