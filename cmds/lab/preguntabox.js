/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Pregunta en contenedor nativo (questionMessage/FutureProof) — solo dueño.
// Antes: `.lab preguntabox`. Nombre propio para que no choque con nadie.

import { sendPregunta, VARIANTE } from "#lib/preguntas";

export default {
  name: "preguntabox",
  category: "owner",
  description: "Lanza la pregunta dentro del contenedor nativo questionMessage",
  usage: ".preguntabox ¿tu pregunta? · (sin texto manda una de muestra)",
  cooldown: 10,
  ownerOnly: true,

  async handler(sock, ctx) {
    const texto = String(ctx.arg || "").trim() || "¿Equipo subtítulos o doblaje?";
    const r = await sendPregunta(sock, ctx.chatId, { texto }, {
      variante: VARIANTE.CAJA,
      quoted: ctx.full,
    });
    if (!r.sent) return `🧪 No se pudo mandar la caja de pregunta.\n> ${r.error?.message || r.error}`;
    return "📦 Pregunta en contenedor nativo enviada: dependiendo de tu versión sale a pantalla propia.";
  },
};
