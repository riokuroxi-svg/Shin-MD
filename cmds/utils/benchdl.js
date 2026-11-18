/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// BenchDL — prueba de velocidad de descarga de los proveedores
// Mide latencia de las APIs de descarga configuradas

import { getAudioUrl } from "#downloader";

export default {
  name: "benchdl",
  aliases: [],
  category: "utility",
  description: "Prueba de velocidad de las APIs de descarga ⏱️",
  usage: ".benchdl <url de YouTube>",
  cooldown: 30,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const testUrl = ctx.arg?.trim() || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

    const sent = await sock.sendMessage(ctx.chatId, {
      text: `⏱️ *Benchmark de descarga*\n\nProbando proveedores con:\n\`${testUrl.slice(0, 60)}\`\n\n_Esto puede tomar hasta 30 segundos..._`
    }, { quoted: ctx.full });

    let key;
    if (sent && sent.key) key = sent.key;

    const attempts = [1, 2, 3];
    const results = [];

    for (const attempt of attempts) {
      const start = Date.now();
      try {
        const res = await getAudioUrl(testUrl);
        const ms = Date.now() - start;
        results.push(`✅ *#${attempt} (${res.provider})* → ${ms}ms`);
      } catch (e) {
        const ms = Date.now() - start;
        results.push(`❌ *#${attempt}* → ${ms}ms · ${e.message?.slice(0, 50)}`);
      }
    }

    const resultText = `⏱️ *Benchmark Resultados*\n\n` + results.join("\n");

    if (key) {
      try {
        await sock.sendMessage(ctx.chatId, { text: resultText, edit: key }, { _priority: true });
      } catch {}
      return null;
    }
    return resultText;
  }
};
