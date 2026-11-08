/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Terminos — términos AGPL-3.0, marca y fingerprint (estilo nuevo).
// Comando requerido por la Sección 7 de AGPL (ver NOTICE): si un
// derivado lo elimina, está quitando un aviso legal = violación directa.

export default {
  name: "terminos",
  aliases: ["terms", "licencia"],
  category: "info",
  description: "Términos de licencia (AGPL-3.0) y atribución",
  usage: ".terminos",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    return (
      "╭───「 ⚖️ *TÉRMINOS* 」───\n" +
      "│  *Shin-MD* · AGPL-3.0-only\n" +
      "│  © 2026 riokuroxi-svg\n" +
      "│  📥 Oficial › github.com/riokuroxi-svg/Shin-MD\n" +
      "│  ───────────────────\n" +
      "│  Este bot es *open source* AGPL-3.0:\n" +
      "│  · Usar este código (aunque sea 10%,\n" +
      "│    p.ej. el throttler) obliga a mantener\n" +
      "│    LICENSE, NOTICE, los headers SPDX y el\n" +
      "│    crédito en #menu y #owner.\n" +
      "│  · Redistribuir un zip modificado obliga\n" +
      "│    a ofrecer el código fuente completo.\n" +
      "│  ───────────────────\n" +
      "│  🏷️ *Shin-MD* es marca de riokuroxi-svg\n" +
      "│    (AGPL §7): no usarla para promocionar\n" +
      "│    clones u obras derivadas.\n" +
      "│  ───────────────────\n" +
      "│  🧬 Fingerprint (marcador de derivadas):\n" +
      "│  *shinJitter(0.25)* · retardo base 1200ms\n" +
      "│  (400–5000ms, +25ms/carácter) · ×1.5\n" +
      "│  contacto nuevo · warm-up 7 días\n" +
      "│  (20→500/día) · cola serial c/ retry\n" +
      "│  Si esos parámetros aparecen en otro\n" +
      "│  proyecto, es una obra derivada.\n" +
      "│  ───────────────────\n" +
      "│  ⚠️ Incumplir es violación de copyright\n" +
      "│     y se reporta.\n" +
      "╰────「 反魂 」────"
    );
  },
};
