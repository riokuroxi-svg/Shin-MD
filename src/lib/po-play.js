/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Riokuroxi — adaptación opcional del laboratorio al flujo de .play.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPoDownloader } from "#lib/po-audio";

let client;
function obtenerCliente() {
  if (!client) {
    client = createPoDownloader({
      ytdlp: process.env.SHIN_PO_YTDLP,
      pluginSource: process.env.SHIN_PO_PLUGIN_DIR,
      ffmpeg: process.env.SHIN_PO_FFMPEG || "ffmpeg",
      ffprobe: process.env.SHIN_PO_FFPROBE || "ffprobe",
      nodePath: process.env.SHIN_PO_NODE || process.execPath,
      concurrency: 2,
    });
  }
  return client;
}

/** Devuelve solo un MP3 validado; nunca usa las fuentes de respaldo de .play. */
export async function obtenerAudioPo(job = {}) {
  const downloader = obtenerCliente();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "shin-po-play-"));
  try {
    const output = path.join(temp, "audio.mp3");
    const result = await downloader.download({
      video: job.videoId || job.url,
      output,
      quality: "192k",
      maxBytes: 50 * 1024 * 1024,
      maxInputBytes: 100 * 1024 * 1024,
      timeoutMs: 180_000,
    });
    const buffer = await fs.readFile(output);
    if (!buffer.length || buffer.length !== result.bytes) throw new Error("MP3 validado no disponible");
    return { buffer, seconds: Math.round(result.decodedDuration), origen: "po-experimental" };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
