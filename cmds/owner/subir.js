/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  subir.js — escribir un archivo del bot desde WhatsApp
//
//    .subir ruta | contenido
//    .subir cookies.txt | # Netscape HTTP Cookie File …
//
//  Sirve para lo que no se puede hacer desde el móvil: crear un comando
//  nuevo, corregir una línea o dejar un archivo de datos sin abrir Termux.
//
//  Lo que se endureció (y por qué):
//
//   1. La ruta se resuelve SIEMPRE dentro de la carpeta del bot. `..` y las
//      rutas absolutas se rechazan.
//   2. `.git/` queda protegido: escribir ahí rompe el repositorio sin que se
//      note hasta el siguiente `git status`.
//   3. Los enlaces simbólicos también cuentan. `path.resolve()` no sigue
//      enlaces, así que `datos -> /etc` pasaba el candado y escribía fuera.
//      Ahora se compara con la ruta real (`realpath`).
//   4. Solo se quita UN espacio o salto de línea tras la barra: la
//      indentación del código que se pega es parte del contenido.
//   5. Tope de 200 000 caracteres, con el número exacto en el aviso.
//
//  Las funciones están exportadas para poder probarlas sin WhatsApp.
// ═══════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(__dirname, "..", "..");
export const MAX_CARACTERES = 200000;

/** Corta `.subir ruta | contenido` en sus dos mitades. */
export function separar(argv) {
  const crudo = String(argv ?? "").trim();
  if (!crudo || !crudo.includes("|")) return null;
  const corte = crudo.indexOf("|");
  const ruta = crudo.slice(0, corte).trim();
  // Un solo espacio o salto de línea tras la barra, nunca más.
  const contenido = crudo.slice(corte + 1).replace(/^[ \t]?\n?/, "");
  return { ruta, contenido };
}

/**
 * Devuelve la ruta absoluta si escribe dentro de la carpeta del bot.
 * `{ ok: true, absoluta, relativa }` o `{ ok: false, motivo }`.
 */
export function resolverRuta(raiz, ruta) {
  const pedida = String(ruta ?? "").trim();
  if (!pedida) return { ok: false, motivo: "Falta la ruta." };
  if (pedida.includes("\0")) return { ok: false, motivo: "Ruta inválida." };

  const base = path.resolve(raiz);
  const absoluta = path.resolve(base, pedida);
  const dentro = (objetivo, referencia) =>
    objetivo === referencia || objetivo.startsWith(referencia + path.sep);

  if (!dentro(absoluta, base)) {
    return { ok: false, motivo: "Ruta no permitida: no puedes salir de la carpeta del bot." };
  }

  const relativa = path.relative(base, absoluta);
  const partes = relativa.split(path.sep);
  if (partes[0] === ".git") return { ok: false, motivo: "`.git/` está protegido." };

  // Enlaces simbólicos: se mira la carpeta real de la ruta, no la escrita.
  try {
    const baseReal = fs.realpathSync(base);
    let actual = absoluta;
    // El archivo puede no existir todavía: se comprueba el ancestro que sí.
    while (!fs.existsSync(actual) && actual !== path.dirname(actual)) actual = path.dirname(actual);
    const real = fs.realpathSync(actual);
    if (!dentro(real, baseReal)) {
      return { ok: false, motivo: "Ruta no permitida: esa carpeta es un enlace que sale del bot." };
    }
    if (fs.existsSync(absoluta) && fs.statSync(absoluta).isDirectory()) {
      return { ok: false, motivo: "Esa ruta es una carpeta, no un archivo." };
    }
  } catch (error) {
    return { ok: false, motivo: "No pude comprobar la ruta: " + (error.message || error) };
  }

  return { ok: true, absoluta, relativa };
}

/** Escribe el archivo. Devuelve `{ ok, relativa, caracteres }` o `{ ok:false, motivo }`. */
export function escribir(raiz, ruta, contenido) {
  const destino = resolverRuta(raiz, ruta);
  if (!destino.ok) return destino;
  try {
    fs.mkdirSync(path.dirname(destino.absoluta), { recursive: true });
    fs.writeFileSync(destino.absoluta, contenido, "utf8");
  } catch (error) {
    return { ok: false, motivo: "No se pudo escribir: " + (error.message || error) };
  }
  return { ok: true, relativa: destino.relativa, caracteres: contenido.length };
}

export default {
  name: "subir",
  aliases: ["upload", "escribir"],
  category: "owner",
  description: "Escribe/actualiza un archivo del bot sin tocar Termux",
  usage: ".subir ruta | contenido",
  cooldown: 3,
  ownerOnly: true,

  async handler(sock, ctx) {
    const partes = separar(ctx.arg || "");
    if (!partes) {
      return (
        "《✧》 Uso: *.subir ruta | contenido*\n" +
        "Ejemplo: `.subir notes.txt | hola mundo`\n" +
        "La ruta es relativa a la carpeta del bot (no puede salirse con `..`)."
      );
    }
    const { ruta, contenido } = partes;
    if (!ruta) return "《✧》 Falta la ruta. Uso: `.subir ruta | contenido`";
    if (contenido.length > MAX_CARACTERES) {
      return (
        "《✧》 Contenido demasiado largo (" +
        contenido.length +
        " caracteres, máx " +
        MAX_CARACTERES +
        "). Parte el archivo o usa `.subir` con el trozo que falta."
      );
    }

    const r = escribir(RAIZ, ruta, contenido);
    if (!r.ok) return "🚫 " + r.motivo;

    let extra = "";
    const prefijo = ctx.usedPrefix || ".";
    if (r.relativa.endsWith(".js") && r.relativa.startsWith("cmds" + path.sep)) {
      let recargado = false;
      try {
        const router = /** @type {any} */ (globalThis).__shinRouter;
        if (router && typeof router.reload === "function") {
          recargado = !!(await router.reload(path.join(RAIZ, r.relativa)));
        }
      } catch {}
      extra = recargado
        ? "\n♻️ Comando recargado al instante."
        : `\n💡 Si es un comando nuevo, usa *${prefijo}restart* o *${prefijo}fix* para cargarlo.`;
    }
    return "✓ Actualizado: `" + r.relativa + "` (" + r.caracteres + " caracteres)" + extra;
  },
};
