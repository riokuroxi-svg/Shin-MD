#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  firma-instalador.mjs — Huella del instalador para publicar releases.
//
//  Un `curl` desde `main` trae lo que haya en ese momento: si mañana el
//  archivo cambia, la misma orden baja otra cosa. Para que una versión
//  sea reproducible, cada release publica install.sh junto a SHA256SUMS,
//  y quien instala comprueba la huella antes de ejecutar.
//
//  Uso:
//    node scripts/firma-instalador.mjs            crea SHA256SUMS
//    node scripts/firma-instalador.mjs --check    comprueba que coincide
// ═══════════════════════════════════════════════════════════════════

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const INSTALADOR = path.join(RAIZ, "install.sh");
const RESUMEN = path.join(RAIZ, "SHA256SUMS");

function huella(archivo) {
  const datos = fs.readFileSync(archivo);
  return crypto.createHash("sha256").update(datos).digest("hex");
}

function version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")).version || "?";
  } catch {
    return "?";
  }
}

const modoCheck = process.argv.includes("--check");

if (!fs.existsSync(INSTALADOR)) {
  console.error("no encuentro install.sh");
  process.exit(1);
}

// Formato de `sha256sum -c`: "<hash>  <archivo>" (dos espacios).
const linea = `${huella(INSTALADOR)}  install.sh\n`;

if (modoCheck) {
  if (!fs.existsSync(RESUMEN)) {
    console.error("no existe SHA256SUMS: genéralo con `node scripts/firma-instalador.mjs`");
    process.exit(1);
  }
  const esperado = fs.readFileSync(RESUMEN, "utf8").split("\n").find((l) => l.endsWith("  install.sh"));
  if (!esperado) {
    console.error("SHA256SUMS no menciona install.sh");
    process.exit(1);
  }
  const actual = linea.trim();
  if (esperado.trim() !== actual) {
    console.error("el instalador cambió y SHA256SUMS no se regeneró:");
    console.error(`  en SHA256SUMS: ${esperado.trim()}`);
    console.error(`  en install.sh: ${actual}`);
    process.exit(1);
  }
  console.log(`✓ install.sh coincide con SHA256SUMS (${actual.slice(0, 16)}…)`);
  process.exit(0);
}

fs.writeFileSync(RESUMEN, linea);
console.log(`✓ SHA256SUMS escrito para la versión ${version()}`);
console.log(`  ${linea.trim()}`);
console.log("");
console.log("Para publicar la release:");
console.log(`  git tag -a v${version()} -m "Shin-MD ${version()}"`);
console.log(`  git push origin v${version()}`);
console.log(`  gh release create v${version()} install.sh SHA256SUMS --title "Shin-MD ${version()}"`);
