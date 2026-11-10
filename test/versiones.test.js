/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  versiones.test.js — una sola versión, escrita una sola vez.
//
//  Lo que pasó: al publicar la 3.7.1, el `shin.sh` que la gente descarga
//  seguía diciendo `…/v3.7.0/shin.sh` en su cabecera y en su `--help`, y
//  `docs/INSTALACION.md` seguía mandando a la 3.7.0. Nada de eso rompe la
//  instalación, pero manda a instalar la versión vieja justo después de
//  anunciar la nueva, y eso es peor que un error de sintaxis porque nadie
//  lo ve.
//
//  La regla que se comprueba aquí:
//
//    1. Todo comando de instalación de la documentación apunta a la
//       versión de `package.json`. Sin excepciones que valgan.
//    2. El `--help` de `shin.sh` sale con la versión de su propio archivo,
//       no con una copia escrita a mano.
//    3. Los documentos históricos (auditorías, investigación, planes) NO
//       se reescriben: son testigos de lo que decían entonces, y los
//       ejemplos con `TU-USUARIO` de `FORK.md` no son de este repositorio.
//
//  No se toca la red: se leen archivos y se ejecuta un `sh` con `--help`.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { desfases, sincronizarVersiones, versionDe } from "../scripts/versiones.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");
const version = versionDe(RAIZ);
const etiqueta = `v${version}`;

test("la documentación no manda a instalar una versión vieja", () => {
  const mal = desfases(RAIZ);
  assert.deepEqual(mal, [], `hay ${mal.length} versión(es) desfasada(s):\n  ${mal.join("\n  ")}`);
});

test("el cuadre de versiones es idempotente y no inventa cambios", () => {
  // Lanzarlo dos veces no puede cambiar nada la segunda: si cambia, la regla
  // se está peleando consigo misma y el commit de release saldría sucio.
  const primera = sincronizarVersiones({ raiz: RAIZ, seco: true });
  const segunda = sincronizarVersiones({ raiz: RAIZ, seco: true });
  assert.deepEqual(segunda, primera, "la segunda pasada no debe encontrar trabajo");
  assert.deepEqual(desfases(RAIZ), []);
});

test("`shin.sh --help` sale con la versión del archivo, no con una copia", () => {
  const r = spawnSync("sh", [path.join(RAIZ, "shin.sh"), "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `el --help falló:\n${r.stderr}`);
  assert.match(r.stdout, new RegExp(`Shin-MD/${etiqueta}/shin\\.sh`), `el --help no nombra ${etiqueta}:\n${r.stdout}`);
  // La ayuda se arma con la variable, no con un literal: si alguien vuelve a
  // escribir la versión a mano, este archivo tendrá un literal numerado.
  const fuente = leer("shin.sh");
  const ayuda = fuente.slice(fuente.indexOf("ayuda() {"), fuente.indexOf("}\n\n# ───"));
  assert.match(ayuda, /\$\{VERSION\}/, "la ayuda de shin.sh tiene que interpolar ${VERSION}");
});

test("el arranque declara su versión en un solo sitio", () => {
  const fuente = leer("shin.sh");
  const declaraciones = [...fuente.matchAll(/VERSION="\$\{SHIN_VERSION:-v\d+\.\d+\.\d+\}"/g)];
  assert.equal(declaraciones.length, 1, "la versión de arranque se declara una vez y solo una");
  assert.equal(declaraciones[0][0], `VERSION="\${SHIN_VERSION:-${etiqueta}}"`);
});

test("los documentos históricos no se reescriben", () => {
  const auditoria = ["docs", "historico", "AUDITORIA-3.2.1.md"];
  // Si el archivo no está, es que alguien lo movió o lo borró: eso sí es un
  // fallo. Antes esta prueba se saltaba en silencio y no vigilaba nada.
  assert.ok(fs.existsSync(path.join(RAIZ, ...auditoria)), "la auditoría histórica sigue en docs/historico/");
  assert.match(leer(...auditoria), /v3\.2\.9\//, "una auditoría vieja conserva las versiones que auditó");
});

test("lo histórico no entra en la propagación de versiones", async () => {
  // Reescribir un documento histórico sería falsificar el registro: cuenta
  // lo que se dijo aquel día.
  const { documentos } = await import(path.join(RAIZ, "scripts", "versiones.mjs"));
  const lista = documentos(RAIZ).map((f) => path.relative(RAIZ, f));
  assert.ok(lista.length > 0, "hay documentos vivos que versionar");
  assert.ok(
    !lista.some((f) => f.includes("historico")),
    "ningún archivo de docs/historico/ se reescribe: " + lista.filter((f) => f.includes("historico")).join(", "),
  );
});
