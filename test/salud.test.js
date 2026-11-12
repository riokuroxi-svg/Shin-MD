/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  salud.test.js — el bot sabe qué le pasa y qué hacer.
//
//  Cada prueba es una foto de un fallo real y lo que el diagnóstico
//  debe contestar: qué está pasando, por qué, y el remedio correcto.
//  Importa el remedio: ante un 463, «reinicia» es la respuesta
//  equivocada y empeora las cosas.
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticar, crearFoto } from "../src/services/salud.js";

const base = () => ({
  ts: Date.now(),
  motor: { estado: "READY", uptimeSec: 600, grupos: 3 },
  cola: { esperando: 0, pausada: false, motivos: [], inciertos: 0, timelocks: 0, rechazados: 0, muertos: 0 },
  cuota: { msgsToday: 12, dailyLimit: 200, day: 3, dailyLimitReached: false },
  memoriaMB: 90,
});

const buscar = (diag, codigo) => diag.causas.find((c) => c.codigo === codigo);

test("todo en orden = sano, y lo dice sin alarmar", () => {
  const d = diagnosticar(base());
  assert.equal(d.estado, "sano");
  assert.equal(d.causas.length, 0);
  assert.match(d.resumen, /^SANO/);
});

test("463: dice que es del servidor y que NO se reinicie", () => {
  const f = base();
  f.cola.timelocks = 2;
  const d = diagnosticar(f);
  assert.equal(d.estado, "critico");
  const c = buscar(d, "TIMELOCK_463");
  assert.ok(c, "tiene que nombrar el 463");
  assert.match(c.causa, /restricci[oó]n|restringi[oó]/i);
  assert.match(c.remedio, /no reinicies/i, "el remedio tiene que desaconsejar reiniciar");
  assert.match(c.remedio, /24 h a 7 d[ií]as/, "y decir cuánto dura");
});

test("sin conexión: manda a mirar el corte antes de tocar nada", () => {
  const f = base();
  f.motor.estado = "DISCONNECTED";
  f.cola.pausada = true;
  f.cola.motivos = ["conexion"];
  const d = diagnosticar(f);
  assert.equal(d.estado, "critico");
  assert.ok(buscar(d, "SIN_CONEXION"));
});

test("cola llena: distingue «se rechazaron» de «están esperando»", () => {
  const conRechazos = base();
  conRechazos.cola.rechazados = 340;
  const d1 = diagnosticar(conRechazos);
  const c1 = buscar(d1, "COLA_LLENA");
  assert.ok(c1);
  assert.equal(c1.gravedad, "media");

  const creciendo = base();
  creciendo.cola.esperando = 260;
  const d2 = diagnosticar(creciendo);
  const c2 = buscar(d2, "COLA_CRECIENDO");
  assert.ok(c2);
  assert.equal(c2.gravedad, "alta", "200 o más ya es grave");
});

test("envíos inciertos: no los manda a reintentar a ciegas", () => {
  const f = base();
  f.cola.inciertos = 3;
  const d = diagnosticar(f);
  const c = buscar(d, "ENVIOS_INCIERTOS");
  assert.ok(c);
  assert.match(c.remedio, /antes de reenviar|no duplicar/i);
});

test("cuota agotada: dice cuánto falta y no sugiere subirla a la ligera", () => {
  const f = base();
  f.cuota.msgsToday = 200;
  f.cuota.dailyLimitReached = true;
  const d = diagnosticar(f);
  const c = buscar(d, "CUOTA_DIARIA");
  assert.ok(c);
  assert.match(c.remedio, /esperar el reinicio/i);
});

test("mensajes perdidos: se reenvían de a uno, no en bloque", () => {
  const f = base();
  f.muertos = { total: 3, porMotivo: { ENVIO_INCIERTO: 2, ENVIO_DESCARTADO: 1 } };
  const d = diagnosticar(f);
  const c = buscar(d, "MENSAJES_PERDIDOS");
  assert.ok(c);
  assert.match(c.remedio, /de a uno/i);
});

test("un 463 y una cola llena a la vez: se cuentan las dos y manda la grave", () => {
  const f = base();
  f.cola.timelocks = 1;
  f.cola.rechazados = 10;
  const d = diagnosticar(f);
  assert.equal(d.estado, "critico");
  assert.ok(buscar(d, "TIMELOCK_463"));
  assert.ok(buscar(d, "COLA_LLENA"));
});

test("la foto del motor no revienta si no hay nada montado", () => {
  const f = crearFoto({});
  assert.equal(f.motor.estado, "DESCONOCIDO");
  const d = diagnosticar(f);
  assert.ok(["sano", "degradado", "critico"].includes(d.estado));
});

test("una foto vacía no lanza y no inventa fallos", () => {
  const d = diagnosticar({});
  assert.equal(d.causas.length, 0);
  assert.equal(d.estado, "sano");
});
