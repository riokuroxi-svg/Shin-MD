/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  actualizar.js — actualizar el código sin perder lo que había a medias
//
//  Un `git pull` a secas (o peor, `git reset --hard origin/main`) se lleva
//  por delante lo que el bot tenía sin subir: archivos a medio editar,
//  pruebas a medio escribir. Y aquí hay una trampa más: `data/shin.db.json`
//  está versionado, así que un `reset --hard` devuelve la base de datos a la
//  del repositorio y se lleva por delante a los usuarios del bot.
//
//  Este módulo hace tres cosas antes de tocar nada:
//
//    1. mira el árbol y separa dos cosas: lo que de verdad es trabajo sin
//       subir y los archivos de datos, que se protegen aparte;
//    2. si hay trabajo sin subir, guarda un parche en `tmp/` y NO toca nada
//       hasta que el dueño repita el comando (5 minutos);
//    3. solo entonces hace fetch + reset, y devuelve la base de datos tal
//       como estaba. Lo que no hay que perder no se pierde.
//
//  No habla con WhatsApp: recibe y devuelve texto. Así se puede probar con
//  un repositorio de mentira, sin cuenta ni conexión.
// ═══════════════════════════════════════════════════════════════════

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const correr = promisify(execFile);

/** Cuánto dura la confirmación, en milisegundos. */
export const VENTANA_MS = 5 * 60_000;

/** Cuántas líneas del `git status` se enseñan antes de resumir. */
export const MAX_LISTADOS = 12;

/**
 * Archivos que cambian solos (la base de datos del bot) y que no son «trabajo
 * sin subir». Se conservan siempre: se leen antes de actualizar y se
 * reescriben después.
 */
export const DATOS_PROTEGIDOS = ["data/shin.db.json"];

/**
 * Ejecuta git en la carpeta indicada y devuelve la salida sin espacios.
 * Con `crudo` se respetan los espacios del principio: `git status --porcelain`
 * empieza por un espacio cuando el archivo está modificado pero no preparado
 * (`" M archivo"`) y recortarlo lo dejaría con un formato distinto.
 */
export async function git(raiz, argumentos, { crudo = false } = {}) {
  const { stdout } = await correr("git", argumentos, { cwd: raiz, maxBuffer: 8 * 1048576 });
  return crudo ? stdout.replace(/\r?\n+$/, "") : stdout.trim();
}

/** Separa el `git status` en datos protegidos y trabajo propio. */
export async function revisarArbol(raiz) {
  let crudo = "";
  try {
    crudo = await git(raiz, ["status", "--porcelain"], { crudo: true });
  } catch (error) {
    return { error: error.message, propios: [], datos: [], todos: [] };
  }
  const todos = crudo.split("\n").filter(Boolean);
  const rutaDe = (linea) => linea.slice(3).trim().replace(/^"|"$/g, "");
  const esDato = (linea) => DATOS_PROTEGIDOS.some((d) => rutaDe(linea) === d);
  const datos = todos.filter(esDato);
  const propios = todos.filter((l) => !esDato(l));
  return { propios, datos, todos, error: null };
}

/** `2026-11-10T09:57:22.656Z` → `2026-11-10T09-57-22-656Z`, apto para un nombre. */
export function marcaDe(fecha) {
  return new Date(fecha).toISOString().replace(/[:.]/g, "-");
}

/**
 * Guarda en `tmp/parche-<marca>.patch` lo que hay sin confirmar.
 * Los archivos nuevos (`??`) no entran en un diff normal: se avisa en el texto.
 */
export async function guardarParche(raiz, { ahora = Date.now(), carpeta = "tmp" } = {}) {
  const directorio = path.join(raiz, carpeta);
  fs.mkdirSync(directorio, { recursive: true });
  const nombre = `parche-${marcaDe(ahora)}.patch`;
  const destino = path.join(directorio, nombre);
  let diff = "";
  try {
    diff = await git(raiz, ["diff", "HEAD"]);
  } catch {
    diff = "";
  }
  fs.writeFileSync(destino, diff.endsWith("\n") || !diff ? diff : diff + "\n", "utf8");
  return {
    nombre,
    ruta: destino,
    relativa: `${carpeta}/${nombre}`,
    bytes: Buffer.byteLength(diff),
  };
}

/** Texto del aviso, con la misma forma que el mensaje de siempre. */
export function avisoDeCambios({
  sucios = [],
  parche = null,
  prefijo = ".",
  comando = "fix",
} = {}) {
  const lista = sucios
    .slice(0, MAX_LISTADOS)
    .map((l) => `> ${l}`)
    .join("\n");
  const resto = sucios.length > MAX_LISTADOS ? `\n> …y ${sucios.length - MAX_LISTADOS} más` : "";
  const guardado = parche ? `\n\nHe guardado un parche en \`${parche.relativa}\`.` : "";
  return (
    `⚠️ *Hay ${sucios.length} archivo(s) con cambios sin subir.*\n\n${lista}${resto}` +
    guardado +
    `\n\n> Si sigo, *esos cambios se pierden* (el código queda igual que en GitHub).` +
    `\n> Los archivos nuevos (\`??\`) no se borran, pero tampoco van en el parche.` +
    `\n> Para seguir, escribe otra vez *${prefijo}${comando}* en los próximos 5 minutos.` +
    `\n> Si no, no se toca nada.`
  );
}

/** ¿La petición guardada sigue valiendo? */
export function confirmacionVigente(pedido, { ahora = Date.now(), ventanaMs = VENTANA_MS } = {}) {
  const marca = Number(pedido) || 0;
  return Boolean(marca) && ahora - marca < ventanaMs;
}

/**
 * Lo hace todo y devuelve qué pasó, en texto.
 *
 *   estado: "espera" | "actualizado" | "alDia" | "error"
 */
export async function actualizar({
  raiz = process.cwd(),
  remoto = "origin",
  rama = "main",
  prefijo = ".",
  comando = "fix",
  confirmado = false,
  carpeta = "tmp",
  ahora = Date.now(),
} = {}) {
  const arbol = await revisarArbol(raiz);
  if (arbol.error) {
    return {
      estado: "error",
      texto: `❌ No pude leer el repositorio:\n_${arbol.error}_\n\n> No se ha tocado nada.`,
    };
  }

  if (arbol.propios.length && !confirmado) {
    let parche = null;
    try {
      parche = await guardarParche(raiz, { ahora, carpeta });
    } catch {
      parche = null;
    }
    return {
      estado: "espera",
      texto: avisoDeCambios({ sucios: arbol.propios, parche, prefijo, comando }),
      sucios: arbol.propios,
      parche,
    };
  }

  // Lo que no se puede perder, guardado en memoria antes de tocar el árbol.
  const respaldo = new Map();
  for (const relativa of DATOS_PROTEGIDOS) {
    const absoluta = path.join(raiz, relativa);
    try {
      if (fs.existsSync(absoluta)) respaldo.set(relativa, fs.readFileSync(absoluta));
    } catch {
      /* si no se puede leer, no se inventa: se sigue y se avisa al final */
    }
  }

  let antes = "";
  try {
    await git(raiz, ["fetch", remoto, rama]);
    antes = await git(raiz, ["rev-parse", "--short", "HEAD"]);
    await git(raiz, ["reset", "--hard", `${remoto}/${rama}`]);
  } catch (error) {
    const mensaje = String(error?.stderr || error?.message || error)
      .trim()
      .split("\n")[0];
    return {
      estado: "error",
      texto: `❌ No pude actualizar:\n_${mensaje}_\n\n> El código no se ha tocado.`,
    };
  }

  let despues = antes;
  let cambiosNucleo = [];
  try {
    despues = await git(raiz, ["rev-parse", "--short", "HEAD"]);
    if (antes && despues && antes !== despues) {
      const diff = await git(raiz, ["diff", "--name-only", antes, despues]);
      cambiosNucleo = diff
        .split("\n")
        .filter((f) => /^(src|boot)\/|^index\.js$|^package(-lock)?\.json$/.test(f));
    }
  } catch {
    /* nos quedamos con el de antes */
  }

  // Devolver la base de datos tal y como estaba.
  const datos = [];
  for (const [relativa, contenido] of respaldo) {
    const absoluta = path.join(raiz, relativa);
    try {
      fs.mkdirSync(path.dirname(absoluta), { recursive: true });
      fs.writeFileSync(absoluta, contenido);
      datos.push({ archivo: relativa, conservado: true });
    } catch {
      datos.push({ archivo: relativa, conservado: false });
    }
  }

  const perdidos = respaldo.size - datos.filter((d) => d.conservado).length;
  return {
    estado: antes === despues ? "alDia" : "actualizado",
    antes,
    despues,
    datos,
    necesitaReinicio: cambiosNucleo.length > 0,
    cambiosNucleo,
    texto: antes === despues ? `ya estaba al día (*${antes}*)` : `*${antes}* → *${despues}*`,
    avisoDatos: perdidos > 0 ? "⚠️ no pude reescribir la base de datos (revisa data/)" : null,
  };
}
