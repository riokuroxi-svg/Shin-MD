/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// La documentación crece sola si nadie la vigila: primero cinco guías, luego
// tres que explican lo mismo y una auditoría de hace dos meses mezclada con lo
// de hoy. Estas pruebas son el tope: si un documento no está en el índice, o
// está en el índice y no existe, o un histórico se coló entre los vivos, la
// suite se pone en rojo.
//
// La regla que se defiende es la del propio índice: un documento, un tema; lo
// histórico se archiva y no se actualiza.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const DOCS = path.join(RAIZ, "docs");
const INDICE = path.join(DOCS, "INDICE.md");

const leer = (p) => fs.readFileSync(p, "utf8");

/** Los .md vivos: los de docs/, sin contar la carpeta histórico ni MAPA. */
function vivos() {
  return fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith(".md") && f !== "INDICE.md")
    .sort();
}

function historicos() {
  const dir = path.join(DOCS, "historico");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
}

test("el índice existe y es el punto de entrada desde el README", () => {
  assert.ok(fs.existsSync(INDICE), "falta docs/INDICE.md");
  const readme = leer(path.join(RAIZ, "README.md"));
  assert.match(readme, /docs\/INDICE\.md/, "el README tiene que llevar al índice");
});

test("todo documento vivo está en el índice", () => {
  const texto = leer(INDICE);
  for (const f of vivos()) {
    assert.ok(texto.includes(`(${f})`), `docs/${f} existe pero el índice no lo menciona`);
  }
});

test("todo lo que el índice promete existe", () => {
  const texto = leer(INDICE);
  // Solo los enlaces a documentos markdown de la misma carpeta.
  const enlaces = [...texto.matchAll(/\]\((?!https?:)([A-Za-z0-9._/-]+\.md)\)/g)].map((m) => m[1]);
  assert.ok(enlaces.length >= 8, "el índice enlaza a los documentos");
  for (const rel of new Set(enlaces)) {
    assert.ok(fs.existsSync(path.join(DOCS, rel)), `el índice enlaza a ${rel}, que no existe`);
  }
});

test("los históricos están archivados y avisados", () => {
  const lista = historicos();
  assert.ok(lista.length >= 4, "los documentos de una fecha viven en docs/historico/");
  for (const f of lista) {
    const texto = leer(path.join(DOCS, "historico", f));
    assert.match(texto, /^> \*\*Histórico\.\*\*/m, `${f} tiene que avisar de que es histórico`);
    assert.match(texto, /no se mantiene al día/i, `${f} tiene que decir que no se actualiza`);
  }
});

test("ningún histórico se quedó entre los documentos vivos", () => {
  // Si alguien devuelve uno a docs/ "porque lo necesita", pierde el aviso y
  // vuelve a confundirse con documentación vigente.
  const sospechosos = vivos().filter((f) => /^(AUDITORIA|auditoria|investigacion|plan-|menus)/.test(f));
  assert.deepEqual(sospechosos, [], `estos deben vivir en docs/historico/: ${sospechosos.join(", ")}`);
});

test("cada documento vivo tiene su propósito en una línea", () => {
  // El criterio del usuario: un documento sin propósito claro sobra. El
  // índice lo declara; si mañana alguien añade `docs/NOTAS.md`, tiene que
  // decir para qué está antes de que pase.
  const texto = leer(INDICE);
  for (const f of vivos()) {
    if (f === "MAPA.md") continue; // se genera: su propósito va en el índice igual
    const linea = texto.split("\n").find((l) => l.includes(`(${f})`));
    assert.ok(linea, `sin línea en el índice para ${f}`);
    assert.ok(linea.replace(/[|\s]/g, "").length > f.length + 10, `${f} aparece en el índice sin decir para qué`);
  }
});
