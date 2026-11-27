/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-lista.js — el menú de dos niveles con 👍
//
//  NIVEL 1  el menú principal: una fila por CATEGORÍA
//             👍 main Menú      · 12 comandos
//             👍 utility Menú   ·  8 comandos
//
//  NIVEL 2  el menú de una categoría: sus comandos
//             › ping            · mide la latencia
//             › menu            · esta lista
//
//  Se hace en dos niveles porque Meta solo deja 10 filas entre todas las
//  secciones. Con 15 categorías y 213 comandos, todo en un mensaje no
//  cabe ni de lejos.
//
//  Los rowId son los comandos tal cual (`.menu main`, `.ping`), así que
//  el router los ejecuta como si se hubieran tecleado. Ver `lista.js`.
// ═══════════════════════════════════════════════════════════════════

import { enviarLista, LIMITES } from "#menu-kit/lista";
import { CATEGORY_EMOJIS } from "../formatter.js";

/** El 👍 por defecto: el que usan los bots latinos y sale en las capturas. */
export const EMOJI_FILA = "👍";

/**
 * El emoji de una categoría, mirando la tabla que ya usa el resto del
 * bot (`CATEGORY_EMOJIS`). Si no hay, el pulgar.
 *
 * @param {string} categoria
 * @returns {string}
 */
export function emojiDeCategoria(categoria) {
  const clave = String(categoria || "").toLowerCase().trim();
  return CATEGORY_EMOJIS[clave] || EMOJI_FILA;
}

/**
 * Cuántas filas se le dedican a cada nivel.
 * En el principal se reservan dos: «Volver» no aplica ahí, pero sí en el
 * segundo nivel, y deja margen para una fila de cierre.
 */
const FILAS_PRINCIPAL = LIMITES.filasTotales;
const FILAS_CATEGORIA = LIMITES.filasTotales - 1; // una se la queda «Volver al menú»

/**
 * El emoji que lleva cada fila. El 👍 es el que usan los bots latinos y
 * el que reconoces en las capturas; se puede cambiar sin tocar código.
 *
 * @param {string} categoria
 * @param {number} i
 */
export function emojiDeFila(categoria) {
  return emojiDeCategoria(categoria);
}

/**
 * Menú principal: una fila por categoría.
 *
 * @param {object} op
 * @param {Array<{id:string, titulo:string, comandos:number, emoji?:string}>} op.categorias
 * @param {string} [op.texto]
 * @param {string} [op.pie]
 * @param {string} [op.prefijo]
 * @returns {object} opciones para `enviarLista`
 */
export function opcionesMenuPrincipal(op = {}) {
  const { categorias = [], texto = "", pie = "", prefijo = "." } = op;
  const filas = categorias.slice(0, FILAS_PRINCIPAL).map((c, i) => ({
    titulo: `${c.emoji || emojiDeFila(c.id, i)} ${c.titulo} Menú`,
    descripcion: c.comandos === 1 ? "1 comando" : `${c.comandos} comandos`,
    comando: `${prefijo}menu ${c.id}`,
  }));

  return {
    titulo: "Shin-MD",
    texto,
    pie,
    textoBoton: "☰ Ver categorías",
    secciones: [{ titulo: "Categorías", filas }],
  };
}

/**
 * Menú de una categoría: sus comandos, con la fila de vuelta al final.
 *
 * @param {object} op
 * @param {{id:string, titulo:string, emoji?:string}} op.categoria
 * @param {Array<{nombre:string, descripcion?:string}>} op.comandos
 * @param {string} [op.texto]
 * @param {string} [op.pie]
 * @param {string} [op.prefijo]
 */
export function opcionesMenuCategoria(op = {}) {
  const { categoria = {}, comandos = [], texto = "", pie = "", prefijo = "." } = op;
  const filas = comandos.slice(0, FILAS_CATEGORIA).map((c) => ({
    titulo: c.nombre,
    descripcion: c.descripcion,
    comando: `${prefijo}${c.nombre}`,
  }));

  // La vuelta siempre va la última: es la que se busca cuando no hay lo
  // que uno venía a buscar.
  filas.push({
    titulo: "↩ Volver al menú",
    descripcion: "todas las categorías",
    comando: `${prefijo}menu`,
  });

  return {
    titulo: `${categoria.emoji || emojiDeFila(categoria.id, 0)} ${categoria.titulo}`,
    texto,
    pie,
    textoBoton: "☰ Ver comandos",
    secciones: [{ titulo: categoria.titulo || "Comandos", filas }],
  };
}

/**
 * Manda el menú principal. Si el cliente no acepta la lista, devuelve
 * false para que quien llama mande el menú de siempre.
 */
export async function mandarMenuPrincipal(sock, jid, op, extra = {}) {
  const key = await enviarLista(sock, jid, opcionesMenuPrincipal(op), extra);
  return Boolean(key);
}

/** Manda el menú de una categoría. */
export async function mandarMenuCategoria(sock, jid, op, extra = {}) {
  const key = await enviarLista(sock, jid, opcionesMenuCategoria(op), extra);
  return Boolean(key);
}

export default {
  emojiDeFila,
  opcionesMenuPrincipal,
  opcionesMenuCategoria,
  mandarMenuPrincipal,
  mandarMenuCategoria,
};
