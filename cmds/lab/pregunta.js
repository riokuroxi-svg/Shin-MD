/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Pregunta nativa del grupo (isQuestion) — solo dueño, en verificación.
// Antes: `.lab pregunta`. Nombre propio para que no choque con nadie.

import { sendPregunta, VARIANTE } from "#lib/preguntas";

export default {
  name: "pregunta",
  category: "owner",
  description: "Lanza una pregunta con la etiqueta oficial de «pregunta» de WhatsApp",
  usage: ".pregunta ¿tu pregunta? · (sin texto manda una de muestra)",
  cooldown: 10,
  ownerOnly: true,

  async handler(sock, ctx) {
    const texto = String(ctx.arg || "").trim() || "¿Qué anime maratoneamos este finde?";
    const r = await sendPregunta(sock, ctx.chatId, { texto }, {
      variante: VARIANTE.FLAG,
      quoted: ctx.full,
    });
    if (!r.sent) return `🧪 No se pudo mandar la pregunta.\n> ${r.error?.message || r.error}`;
    return "❓ Pregunta enviada con la etiqueta oficial: si tu WhatsApp la soporta, las respuestas se agrupan solas debajo.";
  },
};
