/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveFfmpeg } from "../../src/lib/mp3Utils.js";

const FILTERS = {
  bass: ["-af", "equalizer=f=40:width_type=h:width=50:g=15"],
  nightcore: ["-filter_complex", "asetrate=44100*1.25,aresample=44100,atempo=1.06"],
  slow: ["-filter_complex", "asetrate=44100*0.8,aresample=44100,atempo=1.0"],
  robot: ["-filter_complex", "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"],
  reverse: ["-filter_complex", "areverse"],
  blown: ["-af", "volume=25dB,acrossover=split=500[low][high];[low]volume=10dB[low];[low][high]amix=inputs=2"],
};

export default {
  command: ["audioeffect", "bass", "nightcore", "slow", "robot", "reverse", "blown"],
  category: "media",
  description: "Aplica efectos de sonido a notas de voz o archivos de audio",
  usage: ".bass (respondiendo a un audio)",

  async run({ msg, sock, command, usedPrefix }) {
    const q = msg.quoted ? msg.quoted : msg;
    const mime = q.mimetype || "";

    if (!mime.includes("audio") && !mime.includes("video")) {
      return msg.reply(
        `🎵 *EFECTOS DE AUDIO DISPONIBLES*\n\n` +
        `Responde a una nota de voz o audio con alguno de estos comandos:\n` +
        `• \`${usedPrefix}bass\` — Realce de graves profundos\n` +
        `• \`${usedPrefix}nightcore\` — Acelerado y tono anime\n` +
        `• \`${usedPrefix}slow\` — Ralentizado suave\n` +
        `• \`${usedPrefix}robot\` — Voz robótica\n` +
        `• \`${usedPrefix}reverse\` — Reproducido al revés\n` +
        `• \`${usedPrefix}blown\` — Volumen y graves al máximo`
      );
    }

    const effectKey = command === "audioeffect" ? "bass" : command;
    const filterArgs = FILTERS[effectKey] || FILTERS.bass;

    const ffmpegBin = (await resolveFfmpeg()) || "ffmpeg";

    await msg.react("⏳");
    if (typeof msg.simulateRecording === "function") {
      await msg.simulateRecording(1000);
    }

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `in_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    const outputPath = path.join(tmpDir, `out_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

    try {
      const audioBuffer = await q.download();
      if (!audioBuffer || audioBuffer.length === 0) {
        await msg.react("❌");
        return msg.reply("❌ No se pudo descargar el audio para procesarlo.");
      }

      await fs.promises.writeFile(inputPath, audioBuffer);

      const args = ["-y", "-i", inputPath, ...filterArgs, "-b:a", "128k", outputPath];

      await new Promise((resolve, reject) => {
        const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        const timer = setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch {}
          reject(new Error("FFmpeg tardó demasiado (timeout)"));
        }, 60_000);
        proc.stderr?.on("data", (d) => { stderr += d.toString(); });
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `FFmpeg finalizó con código de error ${code}`));
        });
        proc.on("error", (err) => { clearTimeout(timer); reject(err); });
      });

      const processedBuffer = await fs.promises.readFile(outputPath);

      await sock.sendMessage(
        msg.chat,
        {
          audio: processedBuffer,
          mimetype: "audio/mpeg",
          ptt: mime.includes("audio/ogg") || mime.includes("opus"),
        },
        { quoted: msg.quoted ? msg.quoted : msg }
      );

      await msg.react("✅");
    } catch (err) {
      await msg.react("❌").catch(() => {});
      await msg.reply(`❌ Error al aplicar efecto de audio: ${err.message}`);
    } finally {
      fs.rmSync(inputPath, { force: true });
      fs.rmSync(outputPath, { force: true });
    }
  },
};
