/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Demo — muestra las capacidades visuales, interactivas y multimedia de Shin-MD.

import { sendCarousel, quickReply, ctaUrl } from "#interactive";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BANNER_PATHS = [
  process.env.MENU_IMAGE,
  path.resolve(__dirname, "../../assets/banner-default.png"),
  path.resolve(__dirname, "../../assets/bocchi-banner.png"),
  path.resolve(__dirname, "../../media/menu.jpg"),
].filter(Boolean);

let _bannerCache = null;
function getBanner() {
  if (_bannerCache) return _bannerCache;
  for (const p of BANNER_PATHS) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) {
        _bannerCache = fs.readFileSync(p);
        return _bannerCache;
      }
    } catch {}
  }
  return null;
}

export default {
  name: "demo",
  aliases: ["showcase", "carousel", "reels", "demostracion"],
  category: "info",
  description: "Muestra la suite estética e interactiva de Shin-MD 🎠",
  usage: ".demo",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const banner = getBanner();
    const channelCtx = getChannelContext({ mentionedJid: [ctx.senderId] });

    const cards = [
      {
        image: banner,
        title: "✨ 反魂 Shin-MD Engine",
        body: "Arquitectura moderna Baileys MD sobre SQLite WAL.\nCero pérdida de sesión y anti-ban con jitter gaussiano.",
        footer: "Tecnología de última generación",
        buttons: [
          quickReply("📋 Menú Principal", "menu"),
          quickReply("🏓 Latencia / Ping", "ping"),
        ],
      },
      {
        image: banner,
        title: "🎵 Audio & Descargas Vreden",
        body: "Motor de música multi-origen (YouTube, SoundCloud, Spotify).\nStreaming sin binarios locales con fallback multi-servidor.",
        footer: "Soporte Opus HQ y MP3 320kbps",
        buttons: [
          quickReply("🎵 Probar Play", "play anime chill"),
          quickReply("☁️ SoundCloud", "playsc lofi beats"),
        ],
      },
      {
        image: banner,
        title: "🛡️ CAI Cyber-Security Shield",
        body: "Defensa contra inyecciones de prompt, fuzzing de memoria RAG\ny aislamiento de fallos con fail-safe garantizado.",
        footer: "Inmunidad CVE-2025-67511",
        buttons: [
          ctaUrl("📢 Canal Oficial", globalThis.links?.channel || "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522"),
        ],
      },
    ];

    if (ctx.isGroup) {
      let showcaseText = `╭┈┈⫹⫺ *SHOWCASE · SHIN-MD v3.0* ⫹⫺┈┈╮\n`;
      showcaseText += `│ ◈ *Motor* : Baileys Multi-Device NATIVO\n`;
      showcaseText += `│ ◈ *Almacenamiento* : SQLite WAL + Checkpoint\n`;
      showcaseText += `│ ◈ *Anti-Ban* : Jitter Gaussiano 1200ms\n`;
      showcaseText += `│ ◈ *Descargas* : Multi-API (Vreden + SoundCloud)\n`;
      showcaseText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯\n\n`;

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        showcaseText += `╭──〔 📌 *${c.title}* 〕──⬣\n`;
        showcaseText += `│ ${c.body.replace(/\n/g, "\n│ ")}\n`;
        showcaseText += `│ _${c.footer}_\n`;
        showcaseText += `╰─────────────────────────⬣\n\n`;
      }

      showcaseText += `_Usa \`.menu\` para explorar los 201+ comandos disponibles._`;

      if (banner) {
        await sock.sendMessage(
          ctx.chatId,
          { image: banner, caption: showcaseText, contextInfo: channelCtx },
          { quoted: ctx.full }
        );
        return null;
      }
      return showcaseText;
    }

    await sendCarousel(sock, ctx.chatId, {
      title: "反魂 Shin-MD Showcase",
      body: "✨ *Demostración interactiva de capacidades*",
      footer: "Shin-MD • Powered by riokuroxi-svg",
      cards,
      quoted: ctx.full,
    });
    return null;
  },
};
