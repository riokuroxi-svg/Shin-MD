/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Panel «pensando…» estilo Meta AI con pasos y fuentes reales — solo dueño.
// Las fuentes llevan favicon: viajan por richResponseSourcesMetadata
// (testeado contra el proto en test/tanda7.test.js).

import { PASO, PROVEEDOR, PROVEEDOR_FUENTE, buildStepsContent } from "#lib/bot-steps";

export default {
  name: "pensando",
  category: "owner",
  description: "Envía el panel «pensando…» de Meta AI con pasos y fuentes clicables",
  usage: ".pensando · .pensando <tema a «investigar»>",
  cooldown: 10,
  ownerOnly: true,

  async handler(sock, ctx) {
    const tema = String(ctx.arg || "").trim() || "Naruto";
    const contenido = buildStepsContent({
      descripcion: `Pensando sobre ${tema}…`,
      pasos: [
        { titulo: "Entendiendo la pregunta", estado: PASO.HECHO, razonando: true },
        {
          titulo: "Buscando en fuentes", estado: PASO.EJECUTANDO,
          fuentes: [{ titulo: "wiki.anime.com", url: "https://wiki.anime.com", proveedor: PROVEEDOR.GOOGLE }],
        },
        { titulo: "Escribiendo la respuesta", estado: PASO.PLANEADO },
      ],
      fuentes: [
        {
          url: "https://wiki.anime.com",
          favicon: "https://wiki.anime.com/favicon.ico",
          proveedor: PROVEEDOR_FUENTE.GOOGLE,
          consulta: tema,
        },
        {
          url: "https://www.reddit.com/r/anime",
          favicon: "https://www.reddit.com/favicon.ico",
          proveedor: PROVEEDOR_FUENTE.BING,
        },
      ],
    });

    try {
      const { generateWAMessageFromContent } = await import("baileys");
      const generado = generateWAMessageFromContent(ctx.chatId, contenido, {
        userJid: sock.user?.id,
        quoted: ctx.full,
        timestamp: new Date(),
      });
      if (!generado?.key?.id) return "🧪 No se generó el panel.";
      await sock.relayMessage(ctx.chatId, generado.message, { messageId: generado.key.id });
      return "✦ Panel «pensando» enviado con pasos y dos fuentes con favicon. Si el cliente no lo dibuja, se lee el texto normal.";
    } catch (e) {
      return `🧪 No se pudo mandar el panel.\n> ${e?.message || e}`;
    }
  },
};
