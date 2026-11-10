/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const { analizarCortes, podarCortes, VENTANA_MS, CORTES_PARA_AVISAR } = await import(
  path.join(RAIZ, "src", "lib", "cortes.js")
);

const AHORA = 1_700_000_000_000;
const MIN = 60_000;

test("un corte suelto no dispara ningún aviso", () => {
  const r = analizarCortes([AHORA - 10 * MIN, AHORA - 5 * MIN], AHORA);
  assert.equal(r.recientes, 2);
  assert.equal(r.pista, null, "dos cortes pueden ser mala suerte, no un patrón");
});

test("tres cortes en diez minutos explican las dos causas habituales", () => {
  const r = analizarCortes([AHORA - 9 * MIN, AHORA - 6 * MIN, AHORA - 1 * MIN], AHORA);
  assert.equal(r.recientes, 3);
  assert.ok(r.pista, "con tres cortes hay que decir algo");
  assert.match(r.pista, /termux-wake-lock/, "la causa de Android durmiendo la app");
  assert.match(r.pista, /Otra instancia/, "la causa de la doble conexión");
});

test("los cortes viejos no cuentan", () => {
  const r = analizarCortes([AHORA - 40 * MIN, AHORA - 30 * MIN, AHORA - 20 * MIN], AHORA);
  assert.equal(r.recientes, 0, "fuera de la ventana no son una seguidilla");
  assert.equal(r.pista, null);
});

test("una marca del futuro no se cuenta (reloj cambiado)", () => {
  const r = analizarCortes([AHORA + 5 * MIN, AHORA - MIN, AHORA - 2 * MIN, AHORA - 3 * MIN], AHORA);
  assert.equal(r.recientes, 3, "la del futuro se ignora");
});

test("podarCortes deja solo la ventana y aguanta basura", () => {
  const marcas = [AHORA - 40 * MIN, AHORA - 2 * MIN, NaN, null, "x"];
  const podado = podarCortes(/** @type {any} */ (marcas), AHORA);
  assert.equal(podado.length, 1);
  assert.deepEqual(podarCortes(/** @type {any} */ (null), AHORA), []);
  assert.equal(VENTANA_MS, 10 * MIN);
  assert.equal(CORTES_PARA_AVISAR, 3);
});
