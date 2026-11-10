/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Transferir monedas a otro usuario
import { getUserCoins, updateUserCoins } from "#economy";
import { getDatabase } from "#db";
import { mismaPersona } from "#lib/lid";

export default {
  // "pay" y "givecoins" son de cmds/economy/givecoins.js
  name: "transfer",
  aliases: ["transferir", "enviarcoins"],
  category: "economy",
  description: "Transferir monedas 💸",
  cooldown: 5,
  async handler(sock, ctx) {
    if (!ctx.arg || !ctx.mentions?.length) return "💸 .transfer @user <cant>";
    const currency = getDatabase().settings.get("currency") || "🪙";
    const parts = ctx.arg.trim().split(/\s+/);
    const amount = parseInt(parts[parts.length - 1], 10);
    if (isNaN(amount) || amount <= 0) return '❌ Cantidad inválida.';
    const target = ctx.mentions[0];
    if (mismaPersona(target, ctx.senderId)) return '❌ No puedes transferirte a ti mismo.';
    if ((getUserCoins(ctx.senderId).coins || 0) < amount) return '❌ No tienes suficiente.';
    // updateUserCoins crea la fila si no existe; un UPDATE a pelo no haría nada
    // y las monedas desaparecerían por el camino.
    updateUserCoins(ctx.senderId, -amount);
    updateUserCoins(target, amount);
    return `💸 Transferido ¥${amount.toLocaleString()} ${currency} a @${target.split('@')[0]}`;
  }
};
