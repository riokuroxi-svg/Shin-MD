/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  guardar.js — Rescatar un mensaje temporal antes de que se borre
//
//  En los chats con mensajes temporales todo desaparece a los 7 días
//  (o a las 24 h, o a los 90). WhatsApp deja salvar mensajes sueltos
//  manteniéndolos pulsados → "Mantener en el chat". Eso es un mensaje
//  del protocolo, `keepInChatMessage`, y se puede mandar desde el bot:
//
//    keepInChatMessage: { key, keepType, timestampMs }
//      keepType 1 = GUARDAR · 2 = DESHACER
//
//  Uso:  responde al mensaje que quieras salvar y escribe  .guardar
//        para soltarlo otra vez:                           .soltar
//
//  Ojo con lo que NO es: esto no descarga nada ni lo reenvía. Solo le
//  dice a WhatsApp que ese mensaje no caduque. Si el chat no tiene
//  mensajes temporales, no hay nada que rescatar y se avisa.
// ═══════════════════════════════════════════════════════════════════

import { buildKeep, sendNative } from "#lib/native-actions";
import { state, footer } from "#lib/theme";

/**
 * ¿Se puede rescatar este mensaje? Pura, para poder probarla sin sesión.
 *
 * @param {object} citado  mensaje al que se responde (ctx.replyMsg)
 * @param {number} expira  segundos de caducidad del chat (0 = sin temporales)
 * @returns {{si:boolean, motivo?:string}}
 *   motivo: "sin-cita" | "sin-temporales" | "es-del-bot"
 */
export function puedeGuardarse(citado, expira = 0) {
  if (!citado?.key?.id) return { si: false, motivo: "sin-cita" };
  if (!Number.isFinite(expira) || expira <= 0) return { si: false, motivo: "sin-temporales" };
  return { si: true };
}

/** Lee la caducidad del chat mirando el propio mensaje citado. */
export function caducidadDelMensaje(citado) {
  const ctx = citado?.message?.[Object.keys(citado.message || {})[0]]?.contextInfo
    || citado?.contextInfo
    || {};
  const n = Number(ctx.expiration ?? ctx.ephemeralDuration ?? citado?.ephemeralDuration ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Días bonitos a partir de los segundos, para explicárselo a la gente. */
export function enPalabras(segundos = 0) {
  if (segundos >= 86400) {
    const d = Math.round(segundos / 86400);
    return d === 1 ? "24 horas" : `${d} días`;
  }
  if (segundos >= 3600) return `${Math.round(segundos / 3600)} horas`;
  return `${segundos} segundos`;
}

export default {
  name: "guardar",
  aliases: ["keep", "salvar", "soltar", "unkeep"],
  category: "grupo",
  description: "Rescata un mensaje temporal para que no se borre (o lo suelta)",
  usage: ".guardar  ·  .soltar",
  cooldown: 5,
  groupOnly: false,

  async handler(sock, ctx) {
    const soltar = ["soltar", "unkeep"].includes(String(ctx.command || "").toLowerCase());
    const citado = ctx.replyMsg;

    if (!citado?.key?.id) {
      return state("needQuote", { action: soltar ? "soltar" : "guardar" });
    }

    const expira = caducidadDelMensaje(citado);

    if (!soltar) {
      const veredicto = puedeGuardarse(citado, expira);
      if (!veredicto.si && veredicto.motivo === "sin-temporales") {
        return (
          `🕊️ *Este mensaje no caduca.*\n` +
          `> Los mensajes temporales están apagados en este chat, así que no hay nada que rescatar.\n` +
          footer()
        );
      }
    }

    const r = await sendNative(sock, ctx.chatId, buildKeep(citado.key, { deshacer: soltar }));
    if (!r.sent) {
      return state("error", { detail: "WhatsApp no aceptó la petición. Inténtalo de nuevo." });
    }

    return soltar
      ? `⏳ *Soltado.*\n> Vuelve a caducar con el resto del chat.\n${footer()}`
      : `🕊️ *Mensaje rescatado.*\n` +
        `> No se borrará cuando pasen ${enPalabras(expira)}.\n` +
        `> Para soltarlo: responde con \`${ctx.usedPrefix || "."}soltar\`\n` +
        footer();
  },
};
