/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  docs-web.test.js — La página del proyecto no se queda vieja.
//
//  docs/web/index.html se genera desde el propio bot con `npm run docs:web`
//  (la lista de comandos se incrusta; no se escribe a mano). Esta prueba
//  vigila dos cosas:
//
//   1. Que la página generada esté al día: si añades un comando y olvidas
//      regenerarla, aquí salta el aviso ANTES de subirlo.
//   2. Que lo que la página promete (requisitos, pruebas, licencia) sea
//      verdad y no un adorno: versión de Node real, número de pruebas real
//      y licencia del package.json.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommands } from "#commands";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGINA = path.join(RAIZ, "docs", "web", "index.html");
const PLANTILLA = path.join(RAIZ, "docs", "web", "plantilla.html");
const LEE = (p) => fs.readFileSync(p, "utf8");

/** La lista de comandos tal y como la ve el bot (sin repetir alias). */
function catalogoDelBot(comandos) {
  const vistos = new Set();
  const lista = [];
  for (const cmd of comandos.values()) {
    if (!cmd || vistos.has(cmd.file)) continue;
    vistos.add(cmd.file);
    lista.push({ n: cmd.name, cat: cmd.category || "utils" });
  }
  return lista;
}

/** Los datos incrustados en la página. */
function catalogoDeLaPagina(html) {
  const m = html.match(/<script id="datos-comandos" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, "la página no lleva los datos de los comandos incrustados");
  return JSON.parse(m[1]);
}

test("la página del proyecto está al día con los comandos del bot", async () => {
  assert.ok(fs.existsSync(PAGINA), "falta docs/web/index.html (regénerala con: npm run docs:web)");
  assert.ok(
    !LEE(PAGINA).includes("__DATOS__"),
    "la página quedó sin generar (aún tiene el marcador __DATOS__)"
  );

  const comandos = await loadCommands();
  const delBot = catalogoDelBot(comandos);
  const enPagina = catalogoDeLaPagina(LEE(PAGINA));

  const nombresBot = delBot.map((c) => c.n).sort();
  const nombresPagina = enPagina.map((c) => c.n).sort();

  const faltan = nombresBot.filter((n) => !nombresPagina.includes(n));
  const sobran = nombresPagina.filter((n) => !nombresBot.includes(n));

  assert.deepEqual(
    faltan,
    [],
    "hay comandos que NO están en la página: " + faltan.join(", ") + " → ejecuta: npm run docs:web"
  );
  assert.deepEqual(
    sobran,
    [],
    "la página anuncia comandos que ya no existen: " +
      sobran.join(", ") +
      " → ejecuta: npm run docs:web"
  );
  assert.equal(
    enPagina.length,
    delBot.length,
    "el número de comandos de la página no coincide con el del bot"
  );
});

test("la plantilla conserva el marcador que usa el generador", () => {
  assert.ok(fs.existsSync(PLANTILLA), "falta docs/web/plantilla.html");
  assert.ok(
    LEE(PLANTILLA).includes("__DATOS__"),
    "la plantilla perdió el marcador __DATOS__ y el generador ya no puede inyectar los comandos"
  );
});

test("la página no miente con los requisitos ni con la licencia", () => {
  const html = LEE(PAGINA);
  const pkg = JSON.parse(LEE(path.join(RAIZ, "package.json")));

  // Node: la página anuncia "≥ 22.5"; el package.json es la fuente de verdad.
  const minimo = (pkg.engines?.node || "").replace(/[^0-9.]/g, "").replace(/\.0$/, "");
  assert.ok(minimo, "el package.json no declara engines.node");
  assert.ok(
    html.includes("≥ " + minimo) || html.includes("&gt;= " + minimo),
    `la página no menciona la versión mínima de Node que exige el repo (${minimo})`
  );

  // Licencia.
  assert.ok(html.includes("AGPL-3.0"), "la página no menciona la licencia AGPL-3.0");
  assert.match(pkg.license, /AGPL-3\.0/, "el package.json debería declarar AGPL-3.0-only");

  // Sin dependencias externas: la página tiene que abrirse sin internet.
  const externas = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const prohibidas = externas.filter(
    (u) => !/github\.com|api\.fastsaver\.io|nodejs\.org|termux\.com|deb\.nodesource\.com/.test(u)
  );
  assert.deepEqual(
    prohibidas,
    [],
    "la página carga cosas de fuera: debe funcionar sin internet → " + prohibidas.join(", ")
  );
});

test("la página y el README anuncian los mismos números (y los archivos reales)", () => {
  const html = LEE(PAGINA);
  const readme = LEE(path.join(RAIZ, "README.md"));

  // El conteo de pruebas vive en dos sitios (página y README): si uno se
  // actualiza y el otro no, aquí se ve. Los números salen de la última
  // corrida de `npm test` (test/resumen-suite.json) y el generador los
  // inyecta; el README se actualiza con `npm run docs:web` a mano.
  const enPagina = (html.match(/(\d+)\/(\d+) pruebas/) || [])[0] || null;
  const enReadme = (readme.match(/(\d+)\/(\d+) pruebas|(\d+)%2F(\d+)%20/) || [])[0] || null;
  assert.ok(enPagina, "la página no anuncia el número de pruebas");
  assert.ok(enReadme, "el README no anuncia el número de pruebas");

  // En las insignias el "/" viaja como %2F y el espacio como %20.
  const soloDigitos = (t) =>
    t
      .replace(/%2F/g, "/")
      .replace(/%20/g, "")
      .replace(/[^0-9/]/g, "");
  assert.equal(
    soloDigitos(enPagina).split("/")[0],
    soloDigitos(enReadme).split("/")[0],
    `la página dice ${enPagina} y el README dice ${enReadme}: actualiza el que quedó viejo`
  );

  // El número de archivos de prueba sí es comprobable de verdad.
  const archivos = fs.readdirSync(path.join(RAIZ, "test")).filter((f) => f.endsWith(".test.js"));
  assert.ok(
    html.includes(`${archivos.length} archivos`) || html.includes(`${archivos.length} pruebas`),
    `la página no menciona los ${archivos.length} archivos de prueba reales → npm run docs:web`
  );
});
