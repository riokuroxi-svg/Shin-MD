/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  gacha-shared.js — Utilidades del gacha, en un solo sitio.
//
//  ANTES: `loadCharacters` estaba copiada 18 veces (5 variantes),
//  `flattenCharacters` 6 veces y `getSeriesNameByCharacter` 4 veces,
//  todas dentro de cmds/gacha/.
//
//  ⚠️ HALLAZGO IMPORTANTE: las 18 copias leían `./core/characters.json`
//  y ese archivo NO existe en el repositorio (ni está en .gitignore, ni
//  lo genera ningún script, ni está documentado). Un clon limpio tiene
//  el gacha entero roto con ENOENT. Aquí el catálogo se busca en una
//  ruta configurable y, si falta, se avisa UNA vez y se sigue con una
//  lista vacía en vez de reventar en 18 comandos distintos.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import log from "#logger";

/**
 * Ruta del catálogo de personajes.
 * Se puede sacar del repo con CHARACTERS_FILE=/ruta/a/characters.json
 * (útil para hosting donde el catálogo va en un volumen aparte).
 */
export const CHARACTERS_FILE = process.env.CHARACTERS_FILE
  ? path.resolve(process.env.CHARACTERS_FILE)
  : path.resolve(process.cwd(), "core", "characters.json");

let _cache = null; // { file, mtimeMs, data }
let _avisoDado = false;

/**
 * Lee el catálogo de personajes. Cachea por mtime: si el archivo no
 * cambió, no se vuelve a leer (rollwaifu ya hacía esto a mano).
 *
 * Nunca lanza: devuelve `{}` si el catálogo falta o está corrupto, y
 * avisa una sola vez. Antes, la ausencia del archivo producía un error
 * genérico distinto en cada uno de los 18 comandos del gacha.
 *
 * @param {string} [filePath] ruta explícita (por defecto CHARACTERS_FILE)
 * @returns {Promise<object>}
 */
export async function loadCharacters(filePath = CHARACTERS_FILE) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (_cache && _cache.file === filePath && _cache.mtimeMs === stat.mtimeMs) {
      return _cache.data;
    }
    const data = JSON.parse(await fs.promises.readFile(filePath, "utf-8"));
    _cache = { file: filePath, mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (err) {
    if (!_avisoDado) {
      _avisoDado = true;
      const faltante = err?.code === "ENOENT";
      log.warn(
        faltante
          ? `Catálogo del gacha no encontrado en ${filePath}. Los comandos de gacha funcionarán vacíos. Ponlo ahí o define CHARACTERS_FILE en el .env.`
          : `Catálogo del gacha ilegible (${err?.message || err}). Se sigue con lista vacía.`
      );
    }
    return {};
  }
}

/** Aplana {serie: {characters:[...]}} en una sola lista de personajes. */
export function flattenCharacters(structure) {
  return Object.values(structure).flatMap((s) => (Array.isArray(s.characters) ? s.characters : []));
}

/**
 * Nombre de la serie a la que pertenece un personaje.
 * Antes: 4 copias de la misma búsqueda, con distintos nombres de
 * parámetro. @returns {string} nombre de la serie o "Desconocido".
 */
export function getSeriesNameByCharacter(structure, id) {
  return (
    Object.values(structure).find(
      (s) => Array.isArray(s.characters) && s.characters.some((c) => String(c.id) === String(id))
    )?.name || "Desconocido"
  );
}

/** Da formato a un tag/normaliza un texto de búsqueda del gacha. */
export function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, "_");
}

export default { loadCharacters, flattenCharacters, getSeriesNameByCharacter, formatTag, CHARACTERS_FILE };
