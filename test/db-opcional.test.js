/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  db-opcional.test.js — El `catch {}` de las migraciones, con criterio.
//
//  La regla que se comprueba aquí:
//    · "la columna ya existe"        → silencio (es lo esperado)
//    · cualquier otro fallo          → aviso en el log
//  Porque un ALTER TABLE que falla sin decir nada deja el bot escribiendo
//  en una columna que no existe, y eso se nota meses después.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { ejecutarSqlOpcional } from "../src/lib/db-opcional.js";

/** Base de datos de mentira que falla (o no) según se le pida. */
function baseFalsa(error) {
  return {
    ejecutadas: [],
    exec(sql) {
      this.ejecutadas.push(sql);
      if (error) throw new Error(error);
      return undefined;
    },
  };
}

/** Captura lo que el bot escribe en consola mientras corre `fn`. */
function capturarConsola(fn) {
  const original = console.log;
  const lineas = [];
  console.log = (...a) => lineas.push(a.join(" "));
  // eslint-disable-next-line require-atomic-updates -- es una prueba: se devuelve en el finally
  try { fn(); } finally { console.log = original; }
  // eslint-disable-next-line no-control-regex -- quita los colores antes de comparar
  return lineas.join("\n").replace(/\u001b\[[0-9;]*m/g, "");
}

test("si la sentencia se aplica, devuelve true y no dice nada", () => {
  const db = baseFalsa(null);
  const salida = capturarConsola(() => {
    assert.equal(ejecutarSqlOpcional(db, "ALTER TABLE users ADD COLUMN x TEXT"), true);
  });
  assert.equal(salida, "", "no hay nada que avisar cuando todo va bien");
  assert.deepEqual(db.ejecutadas, ["ALTER TABLE users ADD COLUMN x TEXT"]);
});

test("'duplicate column' es lo esperado: silencio", () => {
  const db = baseFalsa("duplicate column name: coins");
  const salida = capturarConsola(() => {
    assert.equal(ejecutarSqlOpcional(db, "ALTER TABLE users ADD COLUMN coins INTEGER"), false);
  });
  assert.equal(salida, "", "la columna ya estaba: no se avisa");
});

test("un fallo de verdad SÍ se avisa (antes se perdía)", () => {
  const db = baseFalsa("database is locked");
  const salida = capturarConsola(() => {
    assert.equal(ejecutarSqlOpcional(db, "ALTER TABLE users ADD COLUMN coins INTEGER"), false);
  });
  assert.match(salida, /BD: sentencia opcional falló/);
  assert.match(salida, /database is locked/);
  assert.match(salida, /ALTER TABLE users ADD COLUMN coins/, "el aviso dice qué sentencia falló");
});

test("el aviso no se come el error: la función sigue devolviendo false", () => {
  const db = baseFalsa("disk I/O error");
  let resultado;
  capturarConsola(() => { resultado = ejecutarSqlOpcional(db, "ALTER TABLE x ADD COLUMN y TEXT"); });
  assert.equal(resultado, false);
});
