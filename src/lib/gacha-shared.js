/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Utilidades compartidas del gacha: antes estaban copiadas a mano
// en 10+ comandos (cualquier arreglo habría que hacerlo 10 veces).

/** Aplana {serie: {characters:[...]}} en una sola lista de personajes. */
export function flattenCharacters(structure) {
  return Object.values(structure).flatMap(s => Array.isArray(s.characters) ? s.characters : []);
}

/** Da formato a un tag/normaliza un texto de búsqueda del gacha. */
export function formatTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '_');
}
