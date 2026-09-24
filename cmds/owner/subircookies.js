/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ── .subircookies (B3) — guarda el cookies.txt de YouTube por WhatsApp ──
// Envía el archivo cookies.txt como DOCUMENTO con caption .subircookies
// (o responde al documento con .subircookies). El bot lo guarda en
// ./cookies.txt y el downloader lo usa con YTDL_ENABLED=1.
// Las cookies expiran cada 1-2 meses: cuando .play vuelva a fallar en el
// servidor, exportas de nuevo y repites el comando.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadMediaMessage } from "baileys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const TARGET = path.join(ROOT, "cookies.txt");
const MAX_BYTES = 256 * 1024;

async function downloadDocument(msg) {
  try {
    const buf = await downloadMediaMessage(msg, "buffer", {});
    return Buffer.isBuffer(buf) ? buf : null;
  } catch {
    return null;
  }
}

export default {
  name: "subircookies",
  aliases: ["cookies", "ytcookies"],
  category: "owner",
  description: "Sube tu cookies.txt de YouTube enviándolo como documento",
  usage: ".subircookies (enviando el .txt como documento)",
  cooldown: 5,
  ownerOnly: true,

  async handler(sock, ctx) {
    // 1) Documento directo con caption, 2) documento citado (reply)
    let buf = await downloadDocument(ctx.full);
    if (!buf && ctx.replyMsg) buf = await downloadDocument(ctx.replyMsg);

    if (!buf) {
      return "《✧》 Envíame el archivo *cookies.txt* como *documento* y ponle de caption `.subircookies` " +
        "(o responde al archivo con este comando).\n\n" +
        "Cómo sacarlo: extensión _Get cookies.txt LOCALLY_ en Chrome → youtube.com " +
        "logueado con una cuenta secundaria → Export. Ideal: cuenta fake solo para el bot.";
    }

    if (buf.length > MAX_BYTES) {
      return "🚫 Archivo demasiado grande (" + Math.round(buf.length / 1024) + " KB, máx 256 KB). ¿Seguro que es un cookies.txt?";
    }

    const text = buf.toString("utf8");
    if (!/youtube\.com|google\.com/i.test(text)) {
      return "🚫 Esto no parece un cookies.txt de YouTube (no encontré dominios youtube/google).";
    }

    fs.writeFileSync(TARGET, buf);
    return "✓ Cookies guardadas (`cookies.txt`, " + buf.length + " bytes).\n" +
      "· Se usan en `.play` con `YTDL_ENABLED=1` en .env.\n" +
      "· Expiran cada 1-2 meses: cuando falle de nuevo, exporta y repite.\n" +
      "· El archivo NUNCA se sube a GitHub (.gitignore).";
  },
};
