/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  payment.js — Métodos de pago con botones de copiar (cta_copy)
//  Los métodos se guardan en la base de datos (settings.payments),
//  sin números escritos en el código. Solo botones estándar de
//  WhatsApp, con respaldo a texto.
// ═══════════════════════════════════════════════════════════════════

import { botJid } from "#serialize";
import { toSmallCaps } from "../../src/lib/formatter.js";
import { sendInteractive, ctaCopy, quickReply } from "../../src/commands/interactive.js";
import { getChannelContext } from "../../src/lib/contextBuilder.js";
import { getRandomMenuImage } from "#lib/menu-shared";
import db from "../../src/services/ginko-db.js";

const MAX_METODOS = 6;

function leerPagos(botId) {
  try {
    const raw = db.getSettings(botId)?.payments;
    const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export default {
  name: "payment",
  aliases: ["pay", "pagos", "donar"],
  category: "info",
  description: "Muestra los métodos de pago con botones para copiar",
  usage: ".payment [set <método> <número> | del <método>]",
  cooldown: 2,
  priority: true,

  async handler(sock, ctx, engine, commands) {
    const prefix = ctx.usedPrefix || ".";
    const parts = (ctx.arg || "").trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || "").toLowerCase();
    const botId = botJid(sock) || "default";
    const isOwnerUser = typeof ctx.isOwner === "function" ? ctx.isOwner() : !!ctx.isOwner;

    // ── .payment set <método> <número> (owner) ──
    if (sub === "set") {
      if (!isOwnerUser) return "❌ Solo el creador puede configurar los pagos.";
      const metodo = (parts[1] || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20);
      const numero = (parts.slice(2).join(" ") || "").trim().slice(0, 40);
      if (!metodo || !numero) {
        return `❌ Uso: \`${prefix}payment set <método> <número>\`\nEjemplo: \`${prefix}payment set dana 1234567890\``;
      }
      const pagos = leerPagos(botId);
      if (!pagos[metodo] && Object.keys(pagos).length >= MAX_METODOS) {
        return `❌ Ya hay ${MAX_METODOS} métodos. Borra uno con \`${prefix}payment del <método>\`.`;
      }
      pagos[metodo] = numero;
      try {
        db.setSettings(botId, "payments", JSON.stringify(pagos));
        return `✅ Método *${metodo.toUpperCase()}* guardado.`;
      } catch (err) {
        return `⚠️ Error al guardar: ${err.message}`;
      }
    }

    // ── .payment del <método> (owner) ──
    if (sub === "del") {
      if (!isOwnerUser) return "❌ Solo el creador puede configurar los pagos.";
      const metodo = (parts[1] || "").toLowerCase();
      const pagos = leerPagos(botId);
      if (!metodo || !pagos[metodo]) return `❌ Método no encontrado. Uso: \`${prefix}payment del <método>\``;
      delete pagos[metodo];
      try {
        db.setSettings(botId, "payments", JSON.stringify(pagos));
        return `✅ Método *${metodo.toUpperCase()}* eliminado.`;
      } catch (err) {
        return `⚠️ Error al guardar: ${err.message}`;
      }
    }

    // ── .payment → mostrar métodos ──
    const pagos = leerPagos(botId);
    const entradas = Object.entries(pagos);
    const pushName = ctx.pushName || "Usuario";

    if (entradas.length === 0) {
      return `💳 *MÉTODOS DE PAGO*\n\nHola *${pushName}*, aún no hay métodos configurados.\nEl creador puede añadirlos con \`${prefix}payment set <método> <número>\`.`;
    }

    const lineas = entradas.map(([metodo, numero]) => `│ ◈ *${metodo.toUpperCase()}* : \`${numero}\``);
    const body =
      `✦ Hola, *${pushName}*\n\n` +
      `╭──〔 💳 *MÉTODOS DE PAGO* 〕──⬣\n` +
      lineas.join("\n") + "\n" +
      `╰──────────────⬣\n\n` +
      `_Toca un botón para copiar el número._`;

    const buttons = entradas.map(([metodo, numero]) => ctaCopy(`Copiar ${metodo.toUpperCase()}`, numero));
    buttons.push(quickReply("Menú principal", "menu"));

    try {
      await sendInteractive(sock, ctx.chatId, {
        title: `✦ ${toSmallCaps("shin-md")} · Pagos`,
        body,
        footer: `反魂 Shin-MD · Métodos de pago`,
        image: getRandomMenuImage(),
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
