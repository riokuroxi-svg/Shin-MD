/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ── .subir (B3) — escribe/actualiza un archivo del bot desde WhatsApp ──
// Uso: .subir ruta | contenido
// Ej:  .subir cookies.txt | # Netscape HTTP Cookie File ...
// Seguridad: solo owner; la ruta SIEMPRE se resuelve dentro del repo
// (nada de ../ para escapar) y .git/ queda protegido.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const MAX_CHARS = 200000;

export default {
  name: "subir",
  aliases: ["upload", "escribir"],
  category: "owner",
  description: "Escribe/actualiza un archivo del bot sin tocar Termux",
  usage: ".subir ruta | contenido",
  cooldown: 3,
  ownerOnly: true,

  async handler(sock, ctx) {
    const raw = (ctx.arg || "").trim();
    if (!raw || !raw.includes("|")) {
      return "《✧》 Uso: *.subir ruta | contenido*\n" +
        "Ejemplo: `.subir notes.txt | hola mundo`\n" +
        "La ruta es relativa a la carpeta del bot (no puede salirse con `..`).";
    }

    const sep = raw.indexOf("|");
    const rawPath = raw.slice(0, sep).trim();
    // Se quita UN espacio y/o salto de línea tras el pipe (estética de
    // ".subir ruta | contenido"), pero NUNCA más: la indentación del
    // código es parte del contenido.
    const content = raw.slice(sep + 1).replace(/^[ \t]?\n?/, "");

    if (!rawPath) return "《✧》 Falta la ruta. Uso: `.subir ruta | contenido`";
    if (content.length > MAX_CHARS) {
      return "《✧》 Contenido demasiado largo (" + content.length + " chars, máx " + MAX_CHARS + ").";
    }

    // ── Candado anti-escape: la ruta resuelta debe quedar DENTRO del repo ──
    if (rawPath.includes("\0")) return "🚫 Ruta inválida.";
    const target = path.resolve(ROOT, rawPath);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      return "🚫 Ruta no permitida: no puedes salir de la carpeta del bot.";
    }
    const rel = path.relative(ROOT, target);
    if (rel.startsWith(".git" + path.sep) || rel === ".git") {
      return "🚫 `.git/` está protegido.";
    }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      return "🚫 Esa ruta es una carpeta, no un archivo.";
    }

    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    } catch (e) {
      return "⚠️ No se pudo escribir: " + (e.message || e);
    }

    const extra = rel.endsWith(".js") && rel.startsWith("cmds" + path.sep)
      ? "\n💡 Es un comando: usa `.reload " + path.basename(rel, ".js") + "` para cargarlo sin reiniciar."
      : "";
    return "✓ Actualizado: `" + rel + "` (" + content.length + " chars)" + extra;
  },
};
