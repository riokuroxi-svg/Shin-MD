/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  filtro-texto.test.js — Candado contra los falsos positivos.
//
//  Estos tests nacieron de un bug medido: el filtro de .imagen usaba
//  `texto.includes(palabra)`, así que "cumpleaños" se bloqueaba por
//  "cum" y "transporte" por "trans". 8 de 12 búsquedas normales
//  quedaban bloqueadas sin motivo.
//
//  Si alguien vuelve a "simplificar" el filtro a un `includes`, estos
//  tests lo cazan al instante.
// ═══════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarTexto, contienePalabraProhibida } from "../src/lib/filtro-texto.js";
import { PALABRAS_NSFW } from "../src/lib/palabras-nsfw.js";

// ── Búsquedas que DEBEN pasar (el bug original las bloqueaba) ──────
const INOCENTES = [
  "cuando es tu cumpleaños",
  "transporte publico",
  "un documento importante",
  "el sexto lugar",
  "transparencia del grupo",
  "transferencia bancaria",
  "cumbia para bailar",
  "asado del domingo",
  "una clase de baile",
  "gatos bebes",
  "paisaje de montaña",
  "anime de accion",
  "receta de pasta",
  "asamblea de vecinos",
  "transformer optimus prime",
];

// ── Búsquedas que DEBEN bloquearse ────────────────────────────────
const PROHIBIDAS = [
  "porno",
  "xxx",
  "chaturbate",
  "mia khalifa",
  "contenido sexual",
  "pornografia",
  "hentai",
  "desnuda",
  "onlyfans",
];

test("normalizarTexto quita acentos, leet y homóglifos", () => {
  assert.equal(normalizarTexto("Cumpleaños"), "cumpleanos");
  assert.equal(normalizarTexto("p0rn"), "porn");
  assert.equal(normalizarTexto("s3x"), "sex");
  assert.equal(normalizarTexto("v@gina"), "vagina");
  assert.equal(normalizarTexto("\\x70orno"), "porno"); // \x70 = p
  assert.equal(normalizarTexto("%70orno"), "porno"); // %70 = p
});

test("normalizarTexto convierte cirílico que se ve como latino", () => {
  // "роrno" con р y о cirílicas (U+0440, U+043E) debe volverse "porno"
  assert.equal(normalizarTexto("\u0440\u043Erno"), "porno");
  // "putа" con а cirílica
  assert.equal(normalizarTexto("put\u0430"), "puta");
});

test("las búsquedas normales NO se bloquean (el bug original)", () => {
  const bloqueadas = INOCENTES.filter((t) => contienePalabraProhibida(t, PALABRAS_NSFW));
  assert.deepEqual(
    bloqueadas,
    [],
    "estas búsquedas inocentes siguen bloqueadas: " + bloqueadas.join(" · ")
  );
});

test("las búsquedas +18 SÍ se bloquean", () => {
  const fallos = PROHIBIDAS.filter((t) => !contienePalabraProhibida(t, PALABRAS_NSFW));
  assert.deepEqual(fallos, [], "estas deberían bloquearse y no lo hacen: " + fallos.join(" · "));
});

test("no se puede evadir con leet, puntos ni homóglifos", () => {
  const evasiones = [
    "p0rn",
    "s3x",
    "p.o.r.n.o",
    "p o r n o",
    "%70orno",
    "\u0440\u043Erno", // cirílico
    "c0ck",
    "d1ck",
    "v@gina",
  ];
  const fallos = evasiones.filter((t) => !contienePalabraProhibida(t, PALABRAS_NSFW));
  assert.deepEqual(fallos, [], "evasiones que se cuelan: " + fallos.join(" · "));
});

test("detecta la palabra culpable, no solo 'hay algo'", () => {
  assert.equal(contienePalabraProhibida("busca porno de gatos", PALABRAS_NSFW), "porno");
  assert.equal(contienePalabraProhibida("gatos bebes", PALABRAS_NSFW), null);
});

test("el filtro es rápido (197 palabras, muchas consultas)", () => {
  const inicio = Date.now();
  for (let i = 0; i < 2000; i++) {
    contienePalabraProhibida("cuando es tu cumpleaños en transporte publico", PALABRAS_NSFW);
  }
  const ms = Date.now() - inicio;
  // 2000 consultas: si tardara más de 1s, algo se compila en cada llamada.
  assert.ok(ms < 1000, `2000 consultas tardaron ${ms}ms (¿se recompila la lista en cada llamada?)`);
});

test("lista vacía o texto vacío no lanzan", () => {
  assert.equal(contienePalabraProhibida("", PALABRAS_NSFW), null);
  assert.equal(contienePalabraProhibida(null, PALABRAS_NSFW), null);
  assert.equal(contienePalabraProhibida("porno", []), null);
  assert.equal(contienePalabraProhibida("porno", null), null);
});
