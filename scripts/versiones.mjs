/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  versiones.mjs — la versión se escribe una vez y se copia sola.
//
//  Cada documento que enseña a instalar lleva la etiqueta dentro del
//  comando (`…/v3.7.1/shin.sh`, `install.sh --version v3.7.1`). Escrita
//  a mano, se queda vieja en cuanto se publica: la 3.7.1 salió con su
//  propio `shin.sh --help` mandando a la 3.7.0.
//
//  Este módulo reescribe esas menciones a partir de `package.json`.
//  Lo llama `publicar.mjs` antes de la suite (para que la suite vea el
//  árbol que se va a publicar) y también se puede lanzar solo:
//
//    node scripts/versiones.mjs           reescribe
//    node scripts/versiones.mjs --seco    enseña qué cambiaría
//    node scripts/versiones.mjs --check   falla si algo está desfasado
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Los documentos históricos cuentan lo que se dijo entonces; reescribirlos
// sería falsificar el registro. Viven en docs/historico/ y esa carpeta no se
// toca (los demás documentos siguen en docs/ y sí se propagan).

// Reglas por documento. La de las URLs solo toca a ESTE repositorio: los
// ejemplos de `FORK.md` hablan del fork de quien lee, no de nosotros.
const DONDE_LA_VERSION = [
  /(raw\.githubusercontent\.com\/riokuroxi-svg\/Shin-MD\/)v\d+\.\d+\.\d+/g,
  /(--version\s+)v\d+\.\d+\.\d+/g,
  /(Shin-MD\s+)v\d+\.\d+\.\d+/g,
  // El panel de la consola, que se enseña copiado en la documentación:
  //   │ versión  v3.8.0                                        │
  /(│\s*versión\s+)v\d+\.\d+\.\d+/g,
];

export function documentos(raiz) {
  const lista = [path.join(raiz, "README.md"), path.join(raiz, "shin.sh")];
  const docs = path.join(raiz, "docs");
  if (fs.existsSync(docs)) {
    for (const f of fs.readdirSync(docs).sort()) {
      if (f.endsWith(".md") && f !== "FORK.md") lista.push(path.join(docs, f));
    }
  }
  return lista.filter((f) => fs.existsSync(f));
}

export function versionDe(raiz = RAIZ) {
  return JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8")).version;
}

/**
 * Reescribe la etiqueta vieja por la de `package.json` en toda la
 * documentación que la menciona.
 * @returns {{ruta: string, antes: string, despues: string}[]} los cambios
 */
export function sincronizarVersiones({ raiz = RAIZ, seco = false } = {}) {
  const etiqueta = `v${versionDe(raiz)}`;
  const cambios = [];
  for (const ruta of documentos(raiz)) {
    const texto = fs.readFileSync(ruta, "utf8");
    let nuevo = texto;
    for (const re of DONDE_LA_VERSION) {
      nuevo = nuevo.replace(re, (_, antes) => `${antes}${etiqueta}`);
    }
    if (nuevo !== texto) {
      cambios.push({
        ruta: path.relative(raiz, ruta),
        antes: [...texto.matchAll(/v\d+\.\d+\.\d+/g)].map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i).join(", "),
        despues: etiqueta,
      });
      if (!seco) fs.writeFileSync(ruta, nuevo);
    }
  }
  return cambios;
}

/** Las menciones que no coinciden con la versión de `package.json`. */
export function desfases(raiz = RAIZ) {
  const esperada = `v${versionDe(raiz)}`;
  const fuera = [];
  for (const ruta of documentos(raiz)) {
    const texto = fs.readFileSync(ruta, "utf8").replace(/\$\{VERSION\}/g, esperada);
    for (const re of DONDE_LA_VERSION) {
      for (const m of texto.matchAll(new RegExp(re.source, "g"))) {
        const hallada = m[0].match(/v\d+\.\d+\.\d+/);
        if (hallada && hallada[0] !== esperada) {
          fuera.push(`${path.relative(raiz, ruta)}: ${hallada[0]} ≠ ${esperada}`);
        }
      }
    }
  }
  return fuera;
}

// ───────────────────────────── CLI ─────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const modo = process.argv.includes("--check")
    ? "check"
    : process.argv.includes("--seco")
      ? "seco"
      : "escribir";
  console.log("");
  if (modo === "check") {
    const mal = desfases();
    if (mal.length) {
      console.error(`  ✗ ${mal.length} versión(es) desfasada(s):\n    ${mal.join("\n    ")}\n`);
      process.exit(1);
    }
    console.log(`  ✓ toda la documentación apunta a v${versionDe()}\n`);
  } else {
    const cambios = sincronizarVersiones({ seco: modo === "seco" });
    if (!cambios.length) console.log(`  · nada que cambiar: todo apunta a v${versionDe()}\n`);
    for (const c of cambios) {
      console.log(`  ${modo === "seco" ? "·" : "✓"} ${c.ruta} → ${c.despues}  (antes: ${c.antes})`);
    }
    if (cambios.length) console.log("");
  }
}
