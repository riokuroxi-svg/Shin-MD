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

    const sent = await engine.getSendQueue().enqueue(
      () => sock.sendMessage(ctx.chatId, {
        text: `⏱️ *Benchmark de descarga*\n\nProbando proveedores con:\n\`${testUrl.slice(0, 60)}\`\n\n_Esto puede tomar hasta 30 segundos..._`
      }, { quoted: ctx.full }),
      { messageLength: 60 }
    );

    let key;
    if (sent && sent.key) key = sent.key;

    const providers = ["ytdl-core", "custom", "nikkatools", "ytmp3convert"];
    const results = [];

    for (const provider of providers) {
      const start = Date.now();
      try {
        if (provider === "ytdl-core" && process.env.YTDL_ENABLED !== "1" && process.env.YTDL_ENABLED !== "true") {
          results.push(`⏭️ *ytdl-core:* desactivado (.env)`);
          continue;
        }

        const res = await getAudioUrl(testUrl);
        const ms = Date.now() - start;
        results.push(`✅ *${res.provider}* → ${ms}ms`);
      } catch (e) {
        const ms = Date.now() - start;
        results.push(`❌ *${provider}* → ${ms}ms · ${e.message?.slice(0, 50)}`);
      }
    }

    const resultText = `⏱️ *Benchmark Resultados*\n\n` + results.join("\n") + `\n\n_Nota: ytdl-core solo funciona si YTDL_ENABLED=1_`;

    if (key) {
      try {
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(ctx.chatId, { text: resultText, edit: key }, {}),
          { messageLength: resultText.length }
        );
      } catch {}
      return null;
    }
    return resultText;
  }
};