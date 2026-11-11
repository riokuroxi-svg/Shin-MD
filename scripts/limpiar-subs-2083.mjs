/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  limpiar-subs-2083.mjs — borra las marcas de tiempo imposibles de `Subs`.
//
//  QUÉ PASÓ
//  `src/storage/identities.js` fusiona la identidad LID con la del teléfono.
//  Hasta 83048d89 la columna `Subs` estaba en el conjunto SUMAR, así que dos
//  marcas de tiempo se sumaban como si fueran monedas:
//
//      Subs = 2026-08-20T01:33:20Z + 2026-11-11T08:10:40Z = 2083-06-30
//
//  Con eso, `.code` contestaba «Debes esperar *20685 días*…»: un bloqueo de por
//  vida por un dato roto. La comprobación ya está arreglada (`esperaRestante`
//  en src/lib/tiempo.js lo marca como corrupto y lo limpia al vuelo), pero las
//  filas siguen ahí hasta que cada usuario use el comando. Esto las limpia de
//  una vez.
//
//  CÓMO SE USA
//      node scripts/limpiar-subs-2083.mjs              # informe, no toca nada
//      node scripts/limpiar-subs-2083.mjs --aplicar    # copia la DB y limpia
//      node scripts/limpiar-subs-2083.mjs --sql        # sólo el SQL, para revisar
//      node scripts/limpiar-subs-2083.mjs --db otra.db
//
//  Respeta SHIN_DB_PATH (la misma variable que el bot) y, por defecto, usa
//  data/shin.db. Necesita Node >= 22.5 por `node:sqlite`.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// La espera de `.code` entre dos intentos de vincular (cmds/socket/subs.js).
export const TOPE_VINCULAR_MS = 80000;

/**
 * Un `Subs` válido es un instante pasado (o 0). Cualquier cosa por delante de
 * `ahora + tope` no puede venir de un reloj sano: es el resultado de sumar
 * fechas, o de un reloj muy mal puesto.
 *
 * @param {{id?: string, Subs?: number}[]} filas
 * @param {{ahora?: number, tope?: number}} [opciones]
 * @returns {{corruptas: object[], sanas: number, vacias: number, umbral: number}}
 */
export function planDeLimpieza(filas, opciones = {}) {
  const ahora = Number(opciones.ahora) || Date.now();
  const tope = Number.isFinite(Number(opciones.tope)) ? Number(opciones.tope) : TOPE_VINCULAR_MS;
  const umbral = ahora + tope;

  const corruptas = [];
  let sanas = 0;
  let vacias = 0;

  for (const fila of filas || []) {
    const valor = Number(fila && fila.Subs);
    if (!Number.isFinite(valor) || valor <= 0) { vacias += 1; continue; }
    if (valor > umbral) corruptas.push(fila);
    else sanas += 1;
  }

  return { corruptas, sanas, vacias, umbral };
}

/** El SQL que limpia. Sin parámetros a propósito: se puede revisar y pegar. */
export function sqlDeLimpieza(umbral) {
  return `UPDATE g_users SET Subs = 0 WHERE Subs > ${Math.round(Number(umbral))};`;
}

const fecha = (ms) => new Date(Number(ms)).toISOString();

/* ───────────────────────── CLI ───────────────────────── */

async function abrirDb(ruta) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    console.error(
      "Este Node no trae `node:sqlite` (hace falta >= 22.5). Usa el mismo Node con el que corre el bot,\n" +
        "o revisa el SQL con --sql y aplícalo a mano sobre una copia de la base.",
    );
    process.exit(2);
  }
  return new DatabaseSync(ruta, { readOnly: false });
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes("--aplicar");
  const soloSql = args.includes("--sql");
  const iDb = args.indexOf("--db");
  const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const ruta = (iDb !== -1 && args[iDb + 1]) || process.env.SHIN_DB_PATH || path.join(raiz, "data", "shin.db");

  const ahora = Date.now();
  const { umbral } = planDeLimpieza([], { ahora });

  if (soloSql) {
    console.log(sqlDeLimpieza(umbral));
    return;
  }

  if (!fs.existsSync(ruta)) {
    console.error("No existe la base: " + ruta + "\nUsa --db <ruta> o define SHIN_DB_PATH.");
    process.exit(2);
  }

  const db = await abrirDb(ruta);

  let todas;
  try {
    todas = db.prepare("SELECT id, Subs FROM g_users").all();
  } catch (err) {
    console.error("No pude leer g_users: " + (err?.message || err));
    process.exit(1);
  }

  const { corruptas, sanas, vacias } = planDeLimpieza(todas, { ahora });

  console.log("\nBase ............ " + ruta);
  console.log("Umbral .......... " + umbral + " (" + fecha(umbral) + ")");
  console.log("Filas ........... " + (sanas + vacias + corruptas.length));
  console.log("Con Subs válido . " + sanas);
  console.log("Sin Subs (0) .... " + vacias);
  console.log("IMPOSIBLES ...... " + corruptas.length);

  if (!corruptas.length) {
    console.log("\nNada que limpiar.\n");
    return;
  }

  for (const f of corruptas.slice(0, 10)) {
    console.log("   · " + String(f.id).padEnd(22) + " Subs=" + f.Subs + " → " + fecha(f.Subs));
  }
  if (corruptas.length > 10) console.log("   · … y " + (corruptas.length - 10) + " más");

  console.log("\n" + sqlDeLimpieza(umbral));

  if (!aplicar) {
    console.log("\nInforme solamente. Para limpiarlo: --aplicar (hace copia antes).\n");
    return;
  }

  const copia = ruta + ".bak-" + new Date(ahora).toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(ruta, copia);
  console.log("\nCopia de seguridad: " + copia);

  const res = db.prepare("UPDATE g_users SET Subs = 0 WHERE Subs > ?").run(umbral);
  console.log("Filas limpiadas .. " + (res?.changes ?? "?"));

  const quedan = db.prepare("SELECT COUNT(*) AS n FROM g_users WHERE Subs > ?").get(umbral);
  console.log("Quedan imposibles  " + (quedan?.n ?? "?"));

  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE);"); } catch {}
  db.close();
  console.log("\nListo. Si el bot está corriendo, reinícialo para que lea la base limpia.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
