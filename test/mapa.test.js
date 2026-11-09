/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  mapa.test.js — el plano no puede quedarse viejo ni quedarse callado.
//
//  Un mapa que miente es peor que no tener mapa: se consulta justo
//  cuando ya no sabes dónde está algo. Por eso el mapa se genera
//  (`npm run mapa`) y aquí se comprueba que lo que hay en el repositorio
//  es exactamente lo que el mapa cuenta.
//
//  Y una segunda cosa: si alguien añade una dependencia o una carpeta y
//  no la describe, el mapa diría «sin describir» en la cara del lector.
//  Eso también falla aquí.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const { generarMapa } = await import(path.join(RAIZ, "tools", "mapa.mjs"));
const MAPA = path.join(RAIZ, "docs", "MAPA.md");

test("el mapa está al día (si no, `npm run mapa`)", () => {
  assert.ok(fs.existsSync(MAPA), "falta docs/MAPA.md: ejecuta `npm run mapa`");
  const generado = generarMapa();
  const guardado = fs.readFileSync(MAPA, "utf8");
  assert.equal(guardado, generado, "docs/MAPA.md no coincide con el repositorio: ejecuta `npm run mapa`");
});

test("ni una carpeta ni una dependencia se quedan sin explicar", () => {
  const mapa = generarMapa();
  const sinDescribir = mapa
    .split("\n")
    .filter((l) => l.includes("_sin describir_"))
    .map((l) => l.split("|")[1].trim());
  assert.deepEqual(sinDescribir, [], `describe esto en tools/mapa.mjs: ${sinDescribir.join(", ")}`);
});

test("todas las órdenes de `npm` se explican solas", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const mapa = generarMapa();
  for (const orden of Object.keys(pkg.scripts || {})) {
    assert.ok(mapa.includes(`npm run ${orden}`), `la orden \`${orden}\` no está en el mapa`);
  }
});

test("el mapa enseña el camino del arranque y el viaje de un mensaje", () => {
  const mapa = fs.readFileSync(MAPA, "utf8");
  // Lo mínimo que alguien necesita para orientarse el primer día.
  assert.match(mapa, /npm start/);
  assert.match(mapa, /Sessions\/Owner\/auth\.db/);
  assert.match(mapa, /código de 8 caracteres/);
  assert.match(mapa, /src\/commands\/router\.js/);
  assert.match(mapa, /data\/shin\.db/);
  // Y lo que ya no existe, dicho con claridad para que nadie lo busque.
  assert.match(mapa, /El QR en la consola/);
  assert.match(mapa, /FASTSAVER_KEY/);
});
