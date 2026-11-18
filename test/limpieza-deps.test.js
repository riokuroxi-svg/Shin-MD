/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validarFechaNacimiento } from "../cmds/profile/setbirth.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RETIRADAS = [
  "@distube/ytdl-core",
  "form-data",
  "grapheme-splitter",
  "human-readable",
  "jimp",
  "moment",
  "moment-timezone",
];

test("package.json ya no declara dependencias retiradas", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const declaradas = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  for (const dep of RETIRADAS) {
    assert.equal(declaradas.has(dep), false, `${dep} no debe seguir en package.json`);
  }
});

test("setbirth conserva formato y validaciones estrictas en español sin moment", () => {
  const fn = (s, y = 2026) => validarFechaNacimiento(s, y, ".", "setbirth");

  assert.equal(fn("01/01/2000"), "sábado, 1 de enero de 2000");
  assert.equal(fn("29/02/2000"), "martes, 29 de febrero de 2000");
  assert.equal(fn("29/02/2024"), "jueves, 29 de febrero de 2024");
  assert.equal(fn("15/08"), "sábado, 15 de agosto de 2026");
  assert.equal(fn("29/02", 2028), "martes, 29 de febrero de 2028");
  assert.equal(fn("5 ene"), "lunes, 5 de enero de 2026");
  assert.equal(fn("5 ene 2001"), "viernes, 5 de enero de 2001");
  assert.equal(fn("12 dic 1999"), "domingo, 12 de diciembre de 1999");
  assert.equal(fn("1 abr"), "miércoles, 1 de abril de 2026");

  assert.equal(fn("31/12/2027"), "✦ El año no puede ser mayor a 2026. Ejemplo: .setbirth 01/12/2026");
  assert.equal(fn("01/01/1900"), "✦ La fecha establecida es invalida.");

  for (const invalida of ["29/02/2023", "31/04/2000", "29/02", "abc", "1/1/2000", "05/13/2000", "00/05/2000"]) {
    assert.equal(fn(invalida), null, `${invalida} debe rechazarse`);
  }
});

test("comandos migrados a APIs nativas de Node cargan sin dependencias obsoletas", async () => {
  const modulos = [
    "../cmds/events.js",
    "../cmds/profile/setbirth.js",
    "../cmds/socket/setprefix.js",
    "../cmds/main/status.js",
    "../cmds/main/health.js",
    "../cmds/utils/tourl.js",
    "../cmds/utils/toimg.js",
    "../cmds/utils/benchdl.js",
    "../cmds/downloads/play2.js",
    "../cmds/owner/subircookies.js",
  ];
  for (const ruta of modulos) {
    const mod = await import(ruta);
    assert.ok(mod.default, `${ruta} debe exportar default`);
  }
});
