/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * Pruebas del saneamiento de `Subs` (parches/limpiar-subs-2083.mjs).
 * Sólo la lógica pura: la parte de `node:sqlite` necesita Node >= 22.5 y aquí
 * se comprueba aparte, aplicando el SQL emitido sobre una base de verdad.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  planDeLimpieza,
  sqlDeLimpieza,
  TOPE_VINCULAR_MS,
} from "../scripts/limpiar-subs-2083.mjs";

const AHORA = 1794384720000; // 2026-11-11T08:12:00Z
const opciones = { ahora: AHORA };

test("sin filas no hay nada que hacer", () => {
  const r = planDeLimpieza([], opciones);
  assert.deepEqual([r.corruptas.length, r.sanas, r.vacias], [0, 0, 0]);
  assert.equal(r.umbral, AHORA + TOPE_VINCULAR_MS);
});

test("los Subs vacíos no son corrupción", () => {
  const filas = [{ id: "a", Subs: 0 }, { id: "b", Subs: null }, { id: "c" }, { id: "d", Subs: "" }];
  const r = planDeLimpieza(filas, opciones);
  assert.equal(r.corruptas.length, 0);
  assert.equal(r.vacias, 4);
});

test("un Subs reciente o antiguo es válido", () => {
  const filas = [
    { id: "hace un minuto", Subs: AHORA - 60000 },
    { id: "hace un año", Subs: AHORA - 365 * 86400000 },
  ];
  const r = planDeLimpieza(filas, opciones);
  assert.equal(r.sanas, 2);
  assert.equal(r.corruptas.length, 0);
});

test("el borde: justo en el límite es válido, un milisegundo más allá no", () => {
  const borde = planDeLimpieza([{ id: "justo", Subs: AHORA + TOPE_VINCULAR_MS }], opciones);
  assert.equal(borde.corruptas.length, 0);

  const pasado = planDeLimpieza([{ id: "uno más", Subs: AHORA + TOPE_VINCULAR_MS + 1 }], opciones);
  assert.equal(pasado.corruptas.length, 1);
});

test("el caso real: dos fechas sumadas dan 2083", () => {
  // 2026-08-20T01:33:20Z + 2026-11-11T08:10:40Z, lo que quedó en la columna.
  const suma = 1787189520000 + 1794384640000;
  assert.equal(new Date(suma).getUTCFullYear(), 2083);

  const r = planDeLimpieza([{ id: "el del reporte", Subs: suma }], opciones);
  assert.equal(r.corruptas.length, 1);
  assert.equal(r.corruptas[0].Subs, suma);
});

test("mezcla: limpia sólo lo imposible", () => {
  const filas = [
    { id: "sano", Subs: AHORA - 1000 },
    { id: "vacío", Subs: 0 },
    { id: "2083", Subs: 3581574160000 },
    { id: "año 5000", Subs: 95617584000000 },
    { id: "basura", Subs: "hola" },
  ];
  const r = planDeLimpieza(filas, opciones);
  assert.deepEqual(r.corruptas.map((f) => f.id), ["2083", "año 5000"]);
  assert.equal(r.sanas, 1);
  assert.equal(r.vacias, 2);
});

test("el SQL es un UPDATE acotado, sin tocar lo demás", () => {
  const sql = sqlDeLimpieza(AHORA + TOPE_VINCULAR_MS);
  assert.equal(sql, `UPDATE g_users SET Subs = 0 WHERE Subs > ${AHORA + TOPE_VINCULAR_MS};`);
  assert.match(sql, /^UPDATE g_users SET Subs = 0 WHERE Subs > \d+;$/);
  assert.doesNotMatch(sql, /DELETE|DROP/i);
});
