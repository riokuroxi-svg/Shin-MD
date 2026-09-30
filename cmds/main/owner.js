/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  owner.js — Tarjeta del owner + crédito fijo requerido por AGPL §7
//
//  Hueco #3 del sistema de diseño: además de la tarjeta con botones
//  nativos, se manda un vCard REAL (`contacts`, soportado por baileys
//  6.7.24). WhatsApp lo dibuja como tarjeta de contacto de verdad, con
//  sus botones nativos "Mensaje" y "Guardar": un toque y te agendan.
//
//  ⚖️ El texto "Basado en Shin-MD por riokuroxi-svg" es OBLIGATORIO en
//  este comando (ver NOTICE). No se quita por estética: va en el pie,
//  visible siempre, incluso en el camino de respaldo.
// ═══════════════════════════════════════════════════════════════════

import { sendNativeQuickReply } from "#lib/native-reply";
import { boxMain, footer } from "#lib/theme";

const REPO = "https://github.com/riokuroxi-svg/Shin-MD";
const CREDITO = "Basado en Shin-MD por riokuroxi-svg";

/** "521234567890:12@s.whatsapp.net" → "521234567890" (solo dígitos) */
export function ownerDigits(ownerJid = "") {
  return String(ownerJid).split("@")[0].split(":")[0].replace(/\D/g, "");
}

/**
 * vCard 3.0 del owner. Formato exacto que espera WhatsApp.
 * Puro y exportado para poder verificarlo sin sesión.
 */
export function buildOwnerVCard({ name = "Owner", digits = "", org = "Shin-MD" } = {}) {
  const safe = String(name).replace(/[\r\n;]/g, " ").trim() || "Owner";
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${safe};;;`,
    `FN:${safe}`,
    `ORG:${org};`,
    digits ? `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}` : "",
    `URL:${REPO}`,
    "END:VCARD",
  ].filter(Boolean).join("\n");
}

/** Botones de la tarjeta. Los tres tipos ya los soporta native-reply. */
export function buildOwnerButtons(digits) {
  const botones = [];
  if (digits) {
    botones.push({ text: "💬 Escribirle", url: `https://wa.me/${digits}` });
    botones.push({ text: "📋 Copiar número", copy_code: `+${digits}` });
  }
  botones.push({ text: "📥 Código fuente", url: REPO });
  return botones;
}

export default {
  name: "owner",
  aliases: ["creator", "creador", "padre"],
  category: "info",
  description: "Muestra al owner del bot",
  usage: ".owner",
  cooldown: 5,
  priority: true,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const ownerJid = engine?.getOwnerJid?.() || "";
    const digits = ownerDigits(ownerJid);
    const ownerNum = digits ? "+" + digits : "";
    const ownerName =
      (ctx?.senderId && ctx?.isOwner && ctx?.full?.pushName) ? ctx.full.pushName
        : (engine?.getOwnerName ? engine.getOwnerName() : "El Owner");

    const cuerpo = boxMain("Owner", [
      `👑 *${ownerName}*`,
      ownerNum ? `📱 ${ownerNum}` : null,
      "───────────────",
      `*${CREDITO}*`,
      `📥 ${REPO}`,
      `📜 AGPL-3.0-only · ${ctx?.usedPrefix || "."}terminos`,
    ]);

    // Camino de respaldo: mismo contenido, sin botones.
    const textoPlano = cuerpo + "\n" + footer();

    // 1) Tarjeta con botones nativos. Si algo falla, se cae al texto.
    let enviado = false;
    try {
      const r = await sendNativeQuickReply({
        sock,
        jid: ctx.chatId,
        title: "👑 Owner",
        body: cuerpo,
        footer: CREDITO,
        quoted: ctx.full,
        buttons: buildOwnerButtons(digits),
      });
      enviado = !!r?.sent;
    } catch { enviado = false; }

    // 2) vCard real: tarjeta de contacto con "Mensaje" y "Guardar".
    //    Es un extra; si falla, no arruina la respuesta principal.
    if (enviado && digits) {
      try {
        await sock.sendMessage(ctx.chatId, {
          contacts: {
            displayName: ownerName,
            contacts: [{ vcard: buildOwnerVCard({ name: ownerName, digits }) }],
          },
        });
      } catch { /* el vCard es opcional */ }
    }

    // El router envía el string devuelto; null = ya se respondió.
    return enviado ? null : textoPlano;
  },
};
