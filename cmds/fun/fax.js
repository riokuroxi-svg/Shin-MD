/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  fax.js — Dato curioso + frase + estado del bot, con botones.
//  Si los botones fallan, se manda lo mismo en texto plano.
// ═══════════════════════════════════════════════════════════════════

import { sendInteractive, quickReply, ctaUrl } from "#interactive";
import { pickRandom, randomInt } from "#lib/random";
import { tiempoCorto } from "#lib/tiempo";

const DATOS = [
  "El pulpo tiene 3 corazones y sangre azul.",
  "La miel no caduca. Se han encontrado tarros de 3000 años todavía comestibles.",
  "Un rayo es 5 veces más caliente que la superficie del sol.",
  "Los flamencos nacen blancos. Se vuelven rosados por su dieta.",
  "Los plátanos son bayas, pero las fresas no.",
  "El WiFi no significa \"Wireless Fidelity\". Es solo un nombre comercial.",
  "Los delfines duermen con un ojo abierto.",
  "La Torre Eiffel crece 15 cm en verano por la dilatación térmica.",
  "Un día en Venus dura más que un año en Venus.",
  "Las vacas tienen mejores amigas y se estresan cuando las separan.",
  "El sonido viaja 4.3 veces más rápido en el agua que en el aire.",
  "Un astronauta no puede eructar en el espacio (sin gravedad).",
  "Las nutrias se sujetan de la mano al dormir para no separarse.",
  "En Júpiter y Saturno podrían llover diamantes.",
  "Tu nariz puede distinguir más de 1 billón de olores.",
];

const FRASES = [
  "\"El único modo de hacer un gran trabajo es amar lo que haces.\" — Steve Jobs",
  "\"No cuentes los días, haz que los días cuenten.\" — Muhammad Ali",
  "\"La simplicidad es la máxima sofisticación.\" — Leonardo da Vinci",
  "\"El futuro pertenece a quienes creen en la belleza de sus sueños.\" — Eleanor Roosevelt",
  "\"Sé tú mismo; todos los demás ya están tomados.\" — Oscar Wilde",
  "\"La vida es lo que pasa mientras estás ocupado haciendo otros planes.\" — John Lennon",
];

/** Barra de progreso de texto. El valor se acota a 0..max. */
function barra(valor, max = 100, largo = 10) {
  const v = Math.min(Math.max(Number(valor) || 0, 0), max);
  const llenos = Math.round((v / max) * largo);
  return "█".repeat(llenos) + "░".repeat(largo - llenos);
}

export default {
  name: "fax",
  aliases: ["facts", "datos"],
  category: "fun",
  description: "Dato curioso, frase y estado del bot con botones",
  usage: ".fax",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const uptime = tiempoCorto(Math.floor(process.uptime()) * 1000);
    const mem = process.memoryUsage();
    const rssMB = (mem.rss / 1024 / 1024).toFixed(0);
    const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(0);

    const riesgo = Number(engine?.getHealth?.()?.getRiskScore?.() ?? 0) || 0;
    const emoji = riesgo >= 80 ? "🔴" : riesgo >= 50 ? "🟠" : riesgo >= 20 ? "🟡" : "🟢";

    const dato = pickRandom(DATOS);
    const frase = pickRandom(FRASES);
    const num = randomInt(1, 9999);

    const body =
      `🎲 *Dato random #${num}*\n` +
      `${dato}\n\n` +
      `💬 *Frase del momento*\n` +
      `_${frase}_\n\n` +
      `⚙️ *Estado del bot*\n` +
      `⏱️ Uptime › ${uptime}\n` +
      `🧠 RAM › ${rssMB}MB (heap ${heapMB}MB)\n` +
      `${emoji} Riesgo › ${riesgo}% ${barra(riesgo, 100, 8)}\n` +
      `👤 ${ctx.pushName || "Anónimo"}`;

    try {
      await sendInteractive(sock, ctx.chatId, {
        body,
        footer: "反魂 Shin-MD — No es un bot, es infraestructura.",
        buttons: [
          quickReply("🎲 Nuevo dato", "fax"),
          quickReply("📋 Menú", "menu"),
          ctaUrl("🌐 GitHub", "https://github.com/riokuroxi-svg/Shin-MD"),
        ],
        quoted: ctx.full,
      });
    } catch {
      const text =
        `┏━━ SHIN-MD — FAX ━━┓\n\n` +
        `🎲 *Dato random #${num}*\n${dato}\n\n` +
        `💬 _${frase}_\n\n` +
        `⚙️ Uptime ${uptime} · RAM ${rssMB}MB · ${emoji} ${riesgo}%\n\n` +
        `> 反魂 Shin-MD`;
      await sock.sendMessage(ctx.chatId, { text }, { quoted: ctx.full });
    }
  },
};
