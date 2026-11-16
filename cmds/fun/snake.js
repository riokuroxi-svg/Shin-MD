/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Snake adaptado de wa-games-kit de TEAM ABIX (MIT): extras/licencias/wa-games-kit-MIT.txt.
 */
import { readFile } from "node:fs/promises";
import { enviarJuegoHtml } from "#lib/juego-html";

const archivo = new URL("../../src/lib/juegos/snake.html", import.meta.url);

export default {
  name: "snake",
  aliases: ["snakehtml"],
  category: "fun",
  description: "Prueba experimental de Snake interactivo dentro del chat",
  usage: ".snake",
  cooldown: 10,
  async handler(sock, ctx) {
    const html = await readFile(archivo, "utf8");
    await enviarJuegoHtml(sock, ctx.chatId, html, "🐍 Snake · juego experimental");
    return null;
  },
};
