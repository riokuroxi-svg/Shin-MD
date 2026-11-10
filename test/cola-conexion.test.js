/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El fallo que se veía en el móvil: llega un comando, justo ahí se cae la
// conexión (428, datos móviles), el envío revienta con «Connection Closed»,
// se reintenta a los 2-3 s —la conexión sigue caída—, vuelve a reventar y la
// respuesta se tira. Quien escribió el comando no recibe nada y el bot parece
// muerto aunque esté reconectando.
//
// Estas pruebas fijan las dos mitades del arreglo: la cola se PARA al caer la
// conexión sin vaciarse, y un envío que falla por eso ESPERA en vez de morir.
// El módulo avisa por el log y el log escribe en stdout: eso rompe el TAP.
const logOriginal = console.log;
console.log = () => {};

import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const { createSendQueue, esFalloDeConexion } = await import(
  path.join(RAIZ, "src", "network", "queue.js")
);

after(() => {
  console.log = logOriginal;
});

/** Throttler de mentira: sin esperas reales. */
const sinEspera = { calcDelay: () => 1, canSend: () => true, recordSent: () => {} };
const salud = { recordSend: () => {}, recordSendFail: () => {} };

test("la conexión caída para la cola, y al volver sale lo que esperaba", async () => {
  const cola = createSendQueue(sinEspera, salud, { timeoutMs: 2000 });
  let enviados = 0;

  cola.pause("conexion");
  const pendiente = cola.enqueue(async () => {
    enviados += 1;
    return "entregado";
  }, {});

  // Mientras está caída, el mensaje NO se intenta y NO se pierde.
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(enviados, 0, "no se intenta enviar con la conexión caída");
  assert.equal(cola.length(), 1, "el mensaje sigue en la cola");

  cola.resume("conexion");
  assert.equal(await pendiente, "entregado", "sale en cuanto vuelve la conexión");
  assert.equal(enviados, 1, "salió una sola vez");
});

test("dos motivos de pausa no se pisan: quitar uno no reanuda", async () => {
  const cola = createSendQueue(sinEspera, salud, { timeoutMs: 2000 });
  let enviados = 0;

  cola.pause("riesgo"); // watchdog: riesgo alto de ban
  cola.pause("conexion"); // la conexión se cayó
  const pendiente = cola.enqueue(async () => { enviados += 1; return "ok"; }, {});

  cola.resume("conexion"); // vuelve la red, pero el riesgo sigue alto
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(enviados, 0, "con el riesgo alto la cola NO se reanuda");
  assert.deepEqual(cola.motivos(), ["riesgo"], "queda el motivo que falta");

  cola.resume("riesgo");
  assert.equal(await pendiente, "ok");
  assert.equal(enviados, 1);
});

test("un envío que falla por «Connection Closed» se entrega al reconectar", async () => {
  const cola = createSendQueue(sinEspera, salud, { timeoutMs: 2000, esperaReconexionMs: 5000 });
  let llamadas = 0;

  const pendiente = cola.enqueue(async () => {
    llamadas += 1;
    if (llamadas === 1) {
      // Lo que hace el socket al caerse: la cola se para y el envío revienta.
      cola.pause("conexion");
      throw new Error("Connection Closed");
    }
    return "entregado";
  }, {});

  // La "red" vuelve 150 ms después.
  setTimeout(() => cola.resume("conexion"), 150);

  assert.equal(await pendiente, "entregado", "la respuesta NO se pierde");
  assert.equal(llamadas, 2, "se intentó una vez caída y otra al volver");
});

test("si la conexión no vuelve a tiempo, el mensaje se rechaza (no cuelga para siempre)", async () => {
  const cola = createSendQueue(sinEspera, salud, { timeoutMs: 2000, esperaReconexionMs: 200 });
  let llamadas = 0;

  await assert.rejects(
    cola.enqueue(async () => {
      llamadas += 1;
      cola.pause("conexion");
      throw new Error("Connection Closed");
    }, {}),
    /Connection Closed/,
  );
  assert.equal(llamadas, 1, "no se reintenta a ciegas");
});

test("esFalloDeConexion distingue la red caída de un fallo de verdad", () => {
  assert.equal(esFalloDeConexion(new Error("Connection Closed")), true);
  assert.equal(esFalloDeConexion(new Error("Connection Failure")), true);
  assert.equal(esFalloDeConexion(new Error("Socket is not open")), true);
  // Un error cualquiera del mensaje no se confunde con la red.
  assert.equal(esFalloDeConexion(new Error("Bad Request")), false);
  assert.equal(esFalloDeConexion(null), false);
  // La incógnita (no sé si salió) NO es esto: esa no se reintenta jamás.
  const incierto = new Error("envío superó 120000ms sin respuesta");
  incierto.code = "ENVIO_INCIERTO";
  assert.equal(esFalloDeConexion(incierto), false);
});

test("el socket pausa la cola al caer y la reanuda al volver", async () => {
  // Se comprueba en el código porque el camino real necesita una conexión
  // de WhatsApp viva; lo que importa es que el enganche exista y no se
  // borre sin querer.
  const fs = await import("node:fs/promises");
  const codigo = await fs.readFile(path.join(RAIZ, "src", "core", "socket.js"), "utf8");
  assert.match(codigo, /getSendQueue\(\)\?\.pause\?\.\("conexion"\)/, "se pausa al cerrar");
  assert.match(codigo, /getSendQueue\(\)\?\.resume\?\.\("conexion"\)/, "se reanuda al abrir");
});
