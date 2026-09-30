/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import db from "../../src/services/ginko-db.js";

const VARIANTS = {
  v1: {
    id: 1,
    name: "INTERACTIVE BOTTOM SHEET",
    desc: "Menú interactivo con menú desplegable (Single Select), botones de acción y tarjeta rica",
    emoji: "📱",
  },
  v2: {
    id: 2,
    name: "AESTHETIC BANNER & READMORE",
    desc: "Banner de imagen con cabecera estética, cajas bracket y colapsado invisible (ReadMore)",
    emoji: "🖼️",
  },
};

export default {
  name: "setmenu",
  aliases: ["menuvariant", "menustyle", "cambiarmenu"],
  category: "owner",
  description: "Configura el estilo visual y la variante activa del menú principal",
  usage: ".setmenu <v1 | v2>",
  cooldown: 2,
  ownerOnly: true,

  async handler(sock, ctx) {
    const args = (ctx.arg || "").toLowerCase().trim().split(/\s+/);
    const target = args[0];

    const botJid = sock?.user?.id || "default";

    if (!target) {
      let list = `🎨 *CONFIGURACIÓN DE ESTILO DE MENÚ*\n\n`;
      list += `Uso: \`${ctx.usedPrefix}setmenu <variante>\`\n\n`;
      for (const [key, val] of Object.entries(VARIANTS)) {
        list += `${val.emoji} *${key.toUpperCase()}* — *${val.name}*\n`;
        list += `> _${val.desc}_\n\n`;
      }
      return list.trim();
    }

    const selected = VARIANTS[target];
    if (!selected) {
      return `❌ Variante inválida. Opciones válidas: *v1*, *v2*.\nEjemplo: \`${ctx.usedPrefix}setmenu v1\``;
    }

    try {
      db.setSettings(botJid, "menu_variant", selected.id);
      return `✅ *ESTILO DE MENÚ ACTUALIZADO*\n\n${selected.emoji} *Variante V${selected.id}: ${selected.name}*\n> ${selected.desc}`;
    } catch (err) {
      return `⚠️ Error al guardar la configuración: ${err.message}`;
    }
  },
};
