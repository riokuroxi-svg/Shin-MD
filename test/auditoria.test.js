/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * auditoria.test.js — Los tres auditores, dentro de la suite.
 *
 * No son pruebas de una función: son barridos del repositorio entero.
 * Están aquí para que CI los ejecute en cada empujón, porque los
 * fallos que cazan (una columna que no existe, un comando que pisa a
 * otro, un mensaje en inglés) no se ven leyendo el código: se ven
 * cuando el bot lleva media hora funcionando mal y nadie sabe por qué.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const correr = (script) => {
  try {
    return { salida: execFileSync("node", [script], { encoding: "utf8" }), ok: true };
  } catch (e) {
    return { salida: (e.stdout || "") + (e.stderr || ""), ok: false };
  }
};

test("ninguna escritura apunta a una columna que no existe", () => {
  const { salida, ok } = correr("scripts/auditar-db.mjs");
  assert.ok(ok, "el auditor de base de datos encontró problemas:\n" + salida);
  assert.match(salida, /Ninguna escritura apunta a una columna inexistente/);
});

test("los 217 comandos cargan, no se pisan y hablan español", () => {
  const { salida } = correr("scripts/auditar-comandos.mjs");
  assert.match(salida, /cargan: 21\d/, "algún comando no carga:\n" + salida);
  assert.ok(!salida.includes("── no carga"), "hay comandos rotos:\n" + salida);
  assert.ok(!salida.includes("── nombre repetido"), "dos comandos con el mismo nombre: el segundo no se ejecuta\n" + salida);
  assert.ok(!salida.includes("── mensaje en inglés"), "quedan mensajes en inglés:\n" + salida);
  assert.ok(!salida.includes("── sin run/handler"), salida);
  assert.ok(!salida.includes("── envío sin await"), "un envío sin await se puede perder:\n" + salida);
});

test("las maquetas no tienen promesas olvidadas sin explicación", () => {
  const { salida } = correr("scripts/auditar-html.mjs");
  const m = salida.match(/SIN HACER: (\d+)/);
  const sinHacer = m ? Number(m[1]) : 0;
  assert.ok(sinHacer === 0, "hay promesas de las maquetas sin hacer ni justificar:\n" + salida);
});
