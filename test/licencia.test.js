/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  licencia.test.js — Guardia legal del repositorio.
//
//  Traído de Shin-Lab (experiments/legal/license.test.js). La regla del
//  proyecto es que TODO archivo de código lleve su header con la licencia:
//  es lo que hace que la AGPL valga algo de verdad. Si alguien (o algo)
//  añade un archivo sin header, esta prueba falla ANTES de subirlo.
//
//  Se comprobaron los 300+ archivos del repo al traerla: faltaban 19
//  (18 en src/lib y un test) que ya se corrigieron.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Carpetas de código del bot. No se revisan node_modules, .git, ni las de
// datos/sesiones/caché (no son código del proyecto).
const CARPETAS = ["src", "cmds", "boot", "scripts", "test"];
const IGNORAR = new Set(["node_modules", ".git", "data", "logs", "Sessions", "tmp", "cache", "dist", "out"]);
const EXTENSIONES = /\.(js|mjs|cjs)$/;

function* recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORAR.has(e.name)) continue;
      yield* recorrer(path.join(dir, e.name));
    } else if (EXTENSIONES.test(e.name)) {
      yield path.join(dir, e.name);
    }
  }
}

test("todos los archivos de código llevan el header AGPL", () => {
  const sinHeader = [];
  for (const carpeta of CARPETAS) {
    const base = path.join(RAIZ, carpeta);
    if (!fs.existsSync(base)) continue;
    for (const archivo of recorrer(base)) {
      // El header debe estar al principio (tras un shebang, si lo hay).
      const inicio = fs.readFileSync(archivo, "utf8").slice(0, 700);
      if (!inicio.includes("SPDX-License-Identifier: AGPL-3.0-only")) {
        sinHeader.push(path.relative(RAIZ, archivo));
      }
    }
  }
  assert.deepEqual(
    sinHeader,
    [],
    "archivos sin header SPDX (arréglalo con: node scripts/add-spdx-headers.cjs):\n" + sinHeader.join("\n"),
  );
});

test("el LICENSE de la raíz es la AGPL-3.0", () => {
  const ruta = path.join(RAIZ, "LICENSE");
  assert.ok(fs.existsSync(ruta), "falta el archivo LICENSE");
  const texto = fs.readFileSync(ruta, "utf8");
  assert.match(texto, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(texto, /Version 3, 19 November 2007/);
});

test("el package.json declara la licencia correcta", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.equal(pkg.license, "AGPL-3.0-only");
});
