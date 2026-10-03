#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  run-tests.mjs — Lanzador de la suite
//
//  POR QUÉ EXISTE (no es un capricho):
//  `node --test test/*.test.js` NO ejecuta los tests en ese proceso:
//  levanta un supervisor que abre un hijo por archivo y le lee el
//  stdout, mezclando en la MISMA tubería los resultados serializados
//  (marcados con los bytes FF 0F) y lo que el código imprime por
//  pantalla. Nuestros logs llevan emojis y colores; cuando una ráfaga
//  de esos bytes se parece a una cabecera, el supervisor intenta
//  deserializarla y revienta con:
//
//     Unable to deserialize cloned data due to invalid or unsupported version
//
//  El archivo señalado cambia en cada intento y sus pruebas, por
//  dentro, habían pasado todas. Es un fallo del supervisor de Node
//  (nodejs/node#66164, #56802), no de este repositorio: a este bot ya
//  le tiñó el CI de rojo dos veces en `main` sin ningún test roto.
//
//  ARREGLO: ejecutar cada archivo directamente con `node archivo.js`.
//  node:test corre igual las pruebas del archivo y devuelve código de
//  salida distinto de cero si alguna falla; simplemente desaparece el
//  supervisor y, con él, la tubería que se malinterpretaba. Cada
//  archivo sigue en su propio proceso, así que el aislamiento entre
//  suites no cambia.
//
//  Uso:  npm test            → toda la suite
//        npm test -- web     → solo los archivos que contengan "web"
// ═══════════════════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TEST_DIR = path.resolve("test");
const filtro = process.argv.slice(2).filter((a) => !a.startsWith("-"));

const archivos = fs.existsSync(TEST_DIR)
  ? fs.readdirSync(TEST_DIR)
      .filter((f) => f.endsWith(".test.js"))
      .filter((f) => !filtro.length || filtro.some((q) => f.includes(q)))
      .sort()
      .map((f) => path.join(TEST_DIR, f))
  : [];

if (!archivos.length) {
  console.error("✕  No encontré archivos de prueba en test/");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const rotos = [];

for (const archivo of archivos) {
  const rel = path.relative(process.cwd(), archivo);
  const r = spawnSync(process.execPath, [archivo], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "test" },
  });

  const salida = (r.stdout || "") + (r.stderr || "");
  const num = (etiqueta) => {
    const m = salida.match(new RegExp(`^# ${etiqueta} (\\d+)$`, "m"));
    return m ? Number(m[1]) : 0;
  };
  const p = num("pass");
  const f = num("fail");
  pass += p;
  fail += f;

  const ok = r.status === 0 && f === 0;
  if (!ok) {
    fail = fail || 1; // el proceso murió sin llegar a imprimir el resumen
    rotos.push(rel);
    process.stdout.write(salida); // el detalle completo solo si algo falla
  }
  console.log(`${ok ? "✓" : "✕"}  ${rel} — ${p} ok${f ? `, ${f} fallando` : ""}`);
}

const total = pass + fail;
console.log("─".repeat(52));
console.log(`${fail ? "✕" : "✓"}  ${pass}/${total} pruebas · ${archivos.length} archivos`);
if (rotos.length) console.log(`   Archivos con fallos: ${rotos.join(", ")}`);

// Resumen de la última corrida: lo usa `npm run docs:web` para que la página
// del proyecto y el README anuncien los números REALES de la suite en vez de
// unos escritos a mano que envejecen. Es solo informativo: si no se puede
// escribir, la suite no falla por eso.
if (!filtro.length) {
  try {
    fs.writeFileSync(
      path.join(TEST_DIR, "resumen-suite.json"),
      JSON.stringify(
        {
          pasan: pass,
          total,
          archivos: archivos.length,
          fallos: fail,
          fecha: new Date().toISOString().slice(0, 10),
        },
        null,
        1,
      ) + "\n",
    );
  } catch {
    /* sin permiso de escritura: no es motivo para fallar la suite */
  }
}

// Recordatorio amable: la página del proyecto anuncia estos números.
if (!filtro.length && !fail) {
  try {
    const pagina = fs.readFileSync(path.resolve("docs/web/index.html"), "utf8");
    const suyo = (pagina.match(/(\d+)\/(\d+) pruebas/) || [])[0];
    const real = `${pass}/${total} pruebas`;
    if (suyo && suyo !== real) {
      console.log(`   ⚠  docs/web/index.html dice "${suyo}" y la suite dice "${real}" → npm run docs:web`);
    }
  } catch {
    /* sin página generada: nada que avisar */
  }
}

process.exit(fail ? 1 : 0);
