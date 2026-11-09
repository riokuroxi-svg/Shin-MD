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
const ARRANQUE = path.join(RAIZ, "shin.sh");
const RESUMEN = path.join(RAIZ, "SHA256SUMS");

// Lo que se publica con cada etiqueta y se puede comprobar con `sha256sum -c`.
// `shin.sh` es el arranque de un comando: descarga el instalador y comprueba
// ESTA misma huella, así que los dos tienen que ir firmados por el mismo sitio
// o la cadena se rompe en el primer eslabón.
const FIRMADOS = ["install.sh", "shin.sh"];

// `shin.sh` lleva escrita la etiqueta desde la que se sirve. Si esa etiqueta y
// la versión del paquete no son la misma, el comando de una línea apunta a una
// publicación que no existe (o, peor, a una vieja): se sincroniza aquí, que es
// el único sitio por el que pasa una release.
const VERSION_EN_ARRANQUE = /^(readonly\s+)?VERSION="\$\{SHIN_VERSION:-v(\d+\.\d+\.\d+)\}"$/m;

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

function versionDelArranque() {
  const texto = fs.readFileSync(ARRANQUE, "utf8");
  const m = texto.match(VERSION_EN_ARRANQUE);
  return m ? m[2] : null;
}

function sincronizarVersion() {
  const texto = fs.readFileSync(ARRANQUE, "utf8");
  const actual = versionDelArranque();
  const esperada = version();
  if (actual === esperada) return false;
  fs.writeFileSync(
    ARRANQUE,
    texto.replace(
      VERSION_EN_ARRANQUE,
      (_, readonly) => `${readonly || ""}VERSION="\${SHIN_VERSION:-v${esperada}}"`,
    ),
  );
  return true;
}

for (const nombre of FIRMADOS) {
  if (!fs.existsSync(path.join(RAIZ, nombre))) {
    console.error(`no encuentro ${nombre}`);
    process.exit(1);
  }
}

// Formato de `sha256sum -c`: "<hash>  <archivo>" (dos espacios).
// Se calcula cuando se pide, no al cargar el módulo: la sincronización de la
// versión de shin.sh cambia ese archivo, y firmar antes de cambiarlo dejaría
// un SHA256SUMS que no cuadra con lo que se publica.
const calcularLineas = () =>
  FIRMADOS.map((n) => `${huella(path.join(RAIZ, n))}  ${n}\n`).join("");

if (modoCheck) {
  const enArranque = versionDelArranque();
  if (enArranque === null) {
    console.error("shin.sh no declara su versión de forma reconocible");
    process.exit(1);
  }
  if (enArranque !== version()) {
    console.error(`shin.sh sirve la v${enArranque} y el paquete es ${version()}: el comando de`);
    console.error("una línea apuntaría a una publicación equivocada. Ejecuta `npm run firma`.");
    process.exit(1);
  }
  if (!fs.existsSync(RESUMEN)) {
    console.error("no existe SHA256SUMS: genéralo con `node scripts/firma-instalador.mjs`");
    process.exit(1);
  }
  const publicado = fs.readFileSync(RESUMEN, "utf8").split("\n");
  let fallos = 0;
  for (const nombre of FIRMADOS) {
    const esperado = publicado.find((l) => l.endsWith(`  ${nombre}`));
    if (!esperado) {
      console.error(`SHA256SUMS no menciona ${nombre}`);
      fallos += 1;
      continue;
    }
    const actual = calcularLineas().split("\n").find((l) => l.endsWith(`  ${nombre}`)).trim();
    if (esperado.trim() !== actual) {
      console.error(`${nombre} cambió y SHA256SUMS no se regeneró:`);
      console.error(`  en SHA256SUMS: ${esperado.trim()}`);
      console.error(`  en el archivo: ${actual}`);
      fallos += 1;
      continue;
    }
    console.log(`✓ ${nombre} coincide con SHA256SUMS (${actual.slice(0, 16)}…)`);
  }
  process.exit(fallos ? 1 : 0);
}

const versionAnterior = versionDelArranque();
if (sincronizarVersion()) {
  console.log(`✓ shin.sh apunta a la v${version()} (antes apuntaba a la v${versionAnterior})`);
}
// Ahora sí: las huellas de los archivos tal y como quedan.
const lineas = calcularLineas();
fs.writeFileSync(RESUMEN, lineas);
console.log(`✓ SHA256SUMS escrito para la versión ${version()}`);
for (const l of lineas.trim().split("\n")) console.log(`  ${l}`);
console.log("");
console.log("Para publicar la release:");
console.log(`  git tag -a v${version()} -m "Shin-MD ${version()}"`);
console.log(`  git push origin v${version()}`);
console.log(`  gh release create v${version()} install.sh shin.sh SHA256SUMS --title "Shin-MD ${version()}"`);
