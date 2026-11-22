#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  preload-integridad.mjs — CAPA 4: comprobar ANTES de ejecutar nada
//
//  El fallo de la versión anterior era de orden, no de código: la
//  comprobación vivía en `boot/index.js`, y en un módulo ESM los `import`
//  estáticos se ejecutan ANTES que cualquier línea del cuerpo del propio
//  archivo. Es decir: `baileys` (y su `postinstall`, y cualquier
//  dependencia comprometida) ya se había cargado cuando el sello
//  comparaba hashes. Detectar después de ejecutar no es proteger: es
//  escribir el parte del accidente.
//
//  Esto se carga con `node --import`, que corre antes del módulo de
//  entrada. Si el árbol no cuadra en modo estricto, el proceso muere
//  aquí y el código sospechoso nunca llega a ejecutarse.
//
//  Uso normal (ya está puesto en `npm start`, `npm run vigia` y en el
//  supervisor que arranca al bot):
//
//      node --import ./scripts/preload-integridad.mjs index.js
//
//  Y se puede apagar sin tocar código:
//
//      SHIN_INTEGRIDAD=off        no comprueba nada
//      SHIN_INTEGRIDAD=avisar     comprueba y avisa (por defecto)
//      SHIN_INTEGRIDAD=estricto   comprueba y, si algo no cuadra, no arranca
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { ejecutarAuditoria, modoDeEntorno } from "../src/services/integridad-arranque.js";

const args = process.argv.slice(2);
const raiz = process.cwd();

/**
 * Lee `.env` a mano, sin `dotenv`.
 *
 * Y no es un capricho: este archivo corre ANTES que el bot, así que
 * `dotenv` todavía no ha leído nada. Si el modo está puesto en el `.env`
 * (`SHIN_INTEGRIDAD=estricto`) y aquí no se leyera, el preload vería el
 * valor por defecto y el usuario creería tener un modo que no tiene. Para
 * leerlo no se puede importar `dotenv`: sería cargar una dependencia antes
 * de comprobar las dependencias, que es exactamente lo que se está
 * arreglando.
 *
 * No pisa lo que ya venga del entorno: `SHIN_INTEGRIDAD=estricto npm start`
 * manda sobre el archivo, igual que con dotenv.
 */
function cargarEnv() {
  let texto;
  try {
    texto = fs.readFileSync(path.join(raiz, ".env"), "utf8");
  } catch {
    return 0;
  }
  let leidas = 0;
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte <= 0) continue;
    const clave = limpia.slice(0, corte).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clave)) continue;
    if (process.env[clave] !== undefined) continue;
    let valor = limpia.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[clave] = valor;
    leidas++;
  }
  return leidas;
}

/** Se llama desde un sitio donde no toca comprobar: no molesta y sigue. */
function noAplica(motivo) {
  if (process.env.SHIN_VERBOSE === "1") {
    console.log("[seguridad] preload sin trabajo: " + motivo);
  }
}

function main() {
  // `--sellar` es una orden explícita de una persona: la ejecuta
  // boot/index.js después. Comprobar mientras se sella no tiene sentido.
  if (args.includes("--sellar") || args.includes("--seal")) return noAplica("se está sellando");

  // El .env primero: el modo y la clave pueden vivir ahí.
  cargarEnv();

  if (modoDeEntorno() === "off") return noAplica("SHIN_INTEGRIDAD=off");
  if (process.env.SHIN_INTEGRIDAD_PRELOAD === "0") return noAplica("preload desactivado");

  // Sin dependencias instaladas no hay árbol que vigilar (tests, scripts
  // sueltos, un `node -e` cualquiera). No es un error: es que no aplica.
  if (!fs.existsSync(path.join(raiz, "node_modules"))) return noAplica("no hay node_modules");
  if (!fs.existsSync(path.join(raiz, "package.json"))) return noAplica("no parece la raíz del bot");

  const veredicto = ejecutarAuditoria({ raiz });

  if (!veredicto.ok) {
    // Falla cerrado: en estricto, el bot no arranca. El motivo ya está
    // impreso con su bloque de explicación; aquí solo queda salir.
    process.exitCode = 1;
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  // Una excepción del propio detector no puede dejar el bot sin arrancar
  // en modo avisar. En estricto, sí: ahí se falla cerrado a propósito.
  if (modoDeEntorno() === "estricto") {
    console.error("[seguridad] el detector falló y el modo es estricto:", err?.message || err);
    process.exit(1);
  }
  if (process.env.SHIN_VERBOSE === "1") {
    console.log("[seguridad] detector con error (se ignora en modo avisar):", err?.message || err);
  }
}
