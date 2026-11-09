/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  apis.test.js — las APIs de respaldo no pueden volver a romperse.
//
//  El fallo que motivó esto: cuatro comandos leían `global.APIs.Ginko`
//  y esa variable nunca se creaba, así que `.instagram` moría con un
//  TypeError al primer uso. Estas pruebas vigilan las tres cosas que
//  tienen que seguir siendo verdad:
//
//    1. `global.APIs` existe en cuanto arranca el bot (y no es undefined).
//    2. Una API sin URL no se intenta: no se construyen URLs con
//       «undefined» dentro, que es lo que reventaba.
//    3. Si no hay ninguna configurada, el comando lo dice con palabras.
//
//  Todo con el entorno simulado: no se llama a ninguna red.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..");
const LEER = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), "utf8");

const { crearAPIs, instalarAPIs, hayApi } = await import("../src/lib/apis.js");

test("sin nada configurado, global.APIs existe y está vacío (nunca undefined)", () => {
  const apis = instalarAPIs({});
  assert.equal(typeof globalThis.APIs, "object", "global.APIs no puede ser undefined");
  assert.deepEqual(apis, {});
  assert.equal(hayApi("Ginko", {}), false);
});

test("la URL sale del entorno y se le quita la barra final", () => {
  const apis = crearAPIs({ GINKO_API_URL: "https://ejemplo.test/", GINKO_API_KEY: " abc " });
  assert.equal(apis.Ginko.url, "https://ejemplo.test");
  assert.equal(apis.Ginko.key, "abc");
  // Las que no están configuradas no aparecen: así el comando se las salta.
  assert.equal(apis.delirius, undefined);
});

test("una URL vacía no crea la fuente", () => {
  const apis = crearAPIs({ GINKO_API_URL: "   ", DELIRIUS_API_URL: "" });
  assert.deepEqual(Object.keys(apis), []);
});

test("ningún comando construye endpoints con `undefined` dentro", () => {
  // El filtro que hay antes de recorrer la lista de APIs es lo que impide
  // pedir `undefined/dl/instagram`. Si alguien lo quita, esto falla.
  for (const archivo of ["instagram.js", "twitter.js", "imagen.js"]) {
    const fuente = LEER("cmds", "downloads", archivo);
    assert.match(
      fuente,
      /\.filter\(\(\{ endpoint \}\)[^)]*undefined/,
      `${archivo}: falta el filtro de endpoints sin API`,
    );
  }
});

test("los comandos ya no tocan global.APIs sin comprobarlo", () => {
  // shares.js hacía `global.APIs.Ginko.url` a pelo. Ahora lee una copia
  // opcional y, si no hay, responde con el estado `sinApi`.
  const fuente = LEER("cmds", "anime", "shares.js");
  assert.match(fuente, /globalThis\.APIs\?\.Ginko/, "debe leerlo de forma opcional");
  assert.match(fuente, /state\('sinApi'/, "y avisar con el estado propio");
  assert.doesNotMatch(fuente, /global\.APIs\.Ginko\.url/, "no puede volver el acceso directo");
});

test("el estado `sinApi` existe y se redacta en castellano", () => {
  return import("../src/lib/theme.js").then(({ state, stateKinds }) => {
    assert.ok(stateKinds().includes("sinApi"), "sinApi tiene que ser un estado conocido");
    const texto = state("sinApi", { what: "imágenes" });
    assert.match(texto, /imágenes/);
    assert.doesNotMatch(texto, /estado desconocido/, "no puede caer al estado de error por defecto");
  });
});

test("el arranque instala las APIs antes de cargar los comandos", () => {
  // El orden importa: si los comandos se cargan primero, el primero que
  // use una API se encuentra `global.APIs` sin definir.
  const arranque = LEER("boot", "index.js");
  const posInstala = arranque.indexOf("instalarAPIs()");
  const posRouter = arranque.indexOf("createRouter(engine");
  assert.ok(posInstala > 0, "el arranque tiene que llamar a instalarAPIs()");
  assert.ok(posRouter > 0, "y seguir creando el router");
  assert.ok(posInstala < posRouter, "instalarAPIs() va ANTES de createRouter()");
});

test("el README no anuncia variables de entorno que el código no lee", () => {
  // El README hablaba de FASTSAVER_KEY y ningún archivo la usaba: prometía
  // un arreglo que no existía.
  const readme = LEER("README.md");
  assert.doesNotMatch(readme, /FASTSAVER_KEY/, "esa variable no la lee nadie");
  const env = LEER(".env.example");
  assert.match(env, /GINKO_API_URL/, "las APIs reales sí tienen que estar documentadas");
});
