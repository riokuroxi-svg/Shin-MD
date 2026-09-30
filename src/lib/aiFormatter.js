/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  aiFormatter.js — Formateador estético para respuestas de IA (Meta AI Style)
// ═══════════════════════════════════════════════════════════════════

import { getChannelContext } from "./contextBuilder.js";
import { quickReply, ctaCopy, sendInteractive } from "#interactive";

/**
 * Formatea una respuesta de Inteligencia Artificial con encabezado estético,
 * bloque de pensamiento (reasoning) y botones nativos interactivos.
 */
export async function sendAiResponse(sock, chatId, {
  model = "DeepSeek-R1 / Gemini 1.5",
  query = "",
  answer = "",
  reasoning = "",
  latencyMs = 350,
  senderId = null,
  senderName = "Usuario",
  quoted = null,
}) {
  const channelUrl = globalThis.links?.channel || "https://whatsapp.com/channel/0029VbDVFpSGJP89hfZUe522";
  const cleanAnswer = String(answer || "").trim();

  let bodyText = `╭──〔 🤖 *SHIN-MD AI INTELLIGENCE* 〕──⬣\n`;
  bodyText += `│ 🧠 *Modelo*   : \`${model}\`\n`;
  bodyText += `│ ⏱️ *Latencia* : \`${latencyMs}ms\`\n`;
  bodyText += `│ 👤 *Usuario*  : *${senderName}*\n`;
  bodyText += `╰──────────────────────────────────────⬣\n\n`;

  if (reasoning && reasoning.trim().length > 0) {
    const cleanReasoning = reasoning.trim().slice(0, 1000);
    bodyText += `💭 *Proceso de Razonamiento:*\n`;
    bodyText += `> ${cleanReasoning.replace(/\n/g, "\n> ")}\n\n`;
    bodyText += `📝 *Respuesta Final:*\n`;
  }

  bodyText += cleanAnswer;

  const channelCtx = getChannelContext({
    mentionedJid: senderId ? [senderId] : [],
  });

  const buttons = [];
  if (cleanAnswer.length > 0 && cleanAnswer.length < 900) {
    buttons.push(ctaCopy("📋 Copiar Texto", cleanAnswer));
  }
  if (query) {
    buttons.push(quickReply("🔄 Regenerar", `ai ${query.slice(0, 30)}`));
  }
  buttons.push(quickReply("🗑️ Limpiar Memoria", "ai reset"));

  return await sendInteractive(sock, chatId, {
    title: "⚡ SHIN-MD AI",
    body: bodyText,
    footer: `Shin-MD Intelligence • github.com/riokuroxi-svg/Shin-MD`,
    buttons,
    quoted,
    contextInfo: {
      ...channelCtx,
      externalAdReply: {
        title: "✨ SHIN-MD ARTIFICIAL INTELLIGENCE",
        body: `⚡ Modelo: ${model} • ⏱️ ${latencyMs}ms`,
        mediaType: 1,
        previewType: 0,
        sourceUrl: channelUrl,
        renderLargerThumbnail: false,
        showAdAttribution: true,
      },
    },
    fallbackText: bodyText + `\n\n_⚡ Powered by Shin-MD AI Intelligence_`,
  });
}

export default {
  sendAiResponse,
};
