/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Owner — tarjeta del owner + crédito fijo requerido por AGPL §7.
// El texto "Basado en Shin-MD por riokuroxi-svg" es obligatorio en
// este comando (ver NOTICE): cada bot, incluso clonado, lo muestra.

export default {
  name: "owner",
  aliases: ["creator", "creador", "padre"],
  category: "info",
  description: "Muestra al owner del bot",
  usage: ".owner",
  cooldown: 5,
  priority: true, // B1.4: respuesta inmediata
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const ownerJid = engine.getOwnerJid() || "";
    // "521234567890:12@s.whatsapp.net" → "+521234567890"
    let ownerNum = "";
    if (ownerJid) {
      const digits = String(ownerJid).split("@")[0].split(":")[0].replace(/\D/g, "");
      ownerNum = digits ? "+" + digits : "";
    }
    const ownerName =
      (ctx.senderId && ctx.isOwner && ctx.full?.pushName) ? ctx.full.pushName
        : (engine.getOwnerName ? engine.getOwnerName() : "El Owner");

    return (
      "╭───「 👑 *OWNER* 」───\n" +
      "│  ⚔️ " + ownerName + "\n" +
      (ownerNum ? "│  📱 " + ownerNum + "\n" : "") +
      "│  ───────────────────\n" +
      "│  *Basado en Shin-MD* por\n" +
      "│  *riokuroxi-svg*\n" +
      "│  📥 github.com/riokuroxi-svg/Shin-MD\n" +
      "│  📜 AGPL-3.0-only · ver .terminos\n" +
      "╰────「 反魂 」────"
    );
  },
};
