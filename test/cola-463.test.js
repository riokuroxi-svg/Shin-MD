/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * Pruebas de la cola: timelock 463, techo y cola de muertos.
 * Corren sin WhatsApp: throttler y transportes de mentira, relojes cortos.
 *
 *   node --test test/cola-463.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createSendQueue,
  esTimelock,
  CODIGO_TIMELOCK,
  CODIGO_COLA_LLENA,
  CODIGO_INCIERTO,
} from "../src/network/queue.js";

// Throttler de mentira: sin esperas, para que la prueba no tarde.
const throttlerRapido = {
  calcDelay: () => 0,
  canSend: () => true,
  recordSent: () => {},
  getStats: () => ({ msgsToday: 0, dailyLimit: 2000, day: 1 }),
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test("esTimelock reconoce el 463 en sus distintas formas", () => {
  assert.equal(esTimelock(new Error("server returned error 463")), true);
  assert.equal(esTimelock(new Error("reachout timelock active")), true);
  assert.equal(esTimelock({ code: CODIGO_TIMELOCK }), true);
  assert.equal(esTimelock(new Error("Connection Closed")), false);
  assert.equal(esTimelock(new Error("server returned error 400")), false);
  assert.equal(esTimelock(null), false);
});

test("un 463 no se reintenta y avisa una sola vez", async () => {
  let llamadas = 0;
  let avisos = 0;
  const fin = Date.now() + 60000;

  const cola = createSendQueue(throttlerRapido, null, {
    maxCola: 100,
    avisarTimelock: () => { avisos += 1; },
  });

  const err = Object.assign(new Error("server returned error 463"), { timeEnforcementEnds: fin });
  await assert.rejects(
    cola.enqueue(async () => { llamadas += 1; throw err; }, { destino: "nuevo@s.whatsapp.net" }),
    (e) => e.code === CODIGO_TIMELOCK,
  );

  const s = cola.getStats();
  assert.equal(llamadas, 1, "antes se reintentaba: ahora una sola llamada");
  assert.equal(s.timelocks, 1);
  assert.equal(s.timelockActivo, true);
  assert.equal(avisos, 1);
  assert.ok(s.timelockHasta >= fin - 1000, "respeta la hora que mandó el servidor");

  // El segundo 463 no vuelve a avisar: es la misma restricción. Se manda a un
  // chat normal (no `isNewContact`) porque un contacto nuevo quedaría esperando
  // al final del bloqueo y entonces sí sería un aviso nuevo, y con razón.
  await assert.rejects(
    cola.enqueue(async () => { throw err; }, { destino: "otro@s.whatsapp.net" }),
    (e) => e.code === CODIGO_TIMELOCK,
  );
  assert.equal(cola.getStats().timelocks, 2);
  assert.equal(avisos, 1, "un solo aviso por bloqueo, no uno por mensaje");

  cola.clear();
});

test("durante el timelock los chats abiertos siguen saliendo", async () => {
  let aviso = null;
  const cola = createSendQueue(throttlerRapido, null, {
    maxCola: 100,
    avisarTimelock: (x) => { aviso = x; },
  });

  const fin = Date.now() + 1500; // bloqueo corto para poder comprobarlo
  await assert.rejects(
    cola.enqueue(async () => {
      throw Object.assign(new Error("server returned error 463"), { timeEnforcementEnds: fin });
    }, { destino: "a@s.whatsapp.net" }),
    (e) => e.code === CODIGO_TIMELOCK,
  );
  assert.ok(aviso);

  const hechos = [];
  // Contacto nuevo: debe quedarse esperando.
  const nuevo = cola.enqueue(async () => { hechos.push("nuevo"); }, {
    destino: "desconocido@s.whatsapp.net", isNewContact: true,
  });
  // Chat ya abierto: debe salir igual.
  await cola.enqueue(async () => { hechos.push("abierto"); }, { destino: "amigo@s.whatsapp.net" });

  assert.deepEqual(hechos, ["abierto"], "el chat abierto pasa; el contacto nuevo no");

  await dormir(1800);
  await nuevo;
  assert.deepEqual(hechos, ["abierto", "nuevo"], "cuando vence el timelock, el nuevo sí sale");
  assert.equal(cola.getStats().timelockActivo, false);
});

test("la cola tiene techo: al llenarse dice que no", async () => {
  const cola = createSendQueue(throttlerRapido, null, { maxCola: 5 });
  cola.pause("prueba"); // nada sale, la cola se llena de verdad

  for (let i = 0; i < 5; i += 1) {
    cola.enqueue(async () => i, { destino: `c${i}@s.whatsapp.net` }).catch(() => {});
  }
  await dormir(20);
  assert.equal(cola.length(), 5);

  await assert.rejects(
    cola.enqueue(async () => "sobra", { destino: "extra@s.whatsapp.net" }),
    (e) => e.code === CODIGO_COLA_LLENA && e.maxCola === 5,
  );

  const s = cola.getStats();
  assert.equal(s.rechazadas, 1);
  assert.equal(s.length, 5, "la profundidad no pasó del techo");
  cola.clear();
  cola.resume("prueba");
});

test("los envíos inciertos y los fallos definitivos van a la cola de muertos", async () => {
  const muertos = [];
  const cola = createSendQueue(throttlerRapido, null, {
    timeoutMs: 60,
    alFallar: (tarea, err) => muertos.push({ destino: tarea.opts.destino, code: err?.code }),
  });

  await assert.rejects(
    cola.enqueue(() => new Promise(() => {}), { destino: "colgado@s.whatsapp.net" }),
    (e) => e.code === CODIGO_INCIERTO,
  );
  await assert.rejects(
    cola.enqueue(async () => { throw new Error("boom"); }, { destino: "roto@s.whatsapp.net" }),
  );

  assert.deepEqual(muertos.map((m) => m.destino), ["colgado@s.whatsapp.net", "roto@s.whatsapp.net"]);
  assert.equal(cola.getStats().colaMuerta, 1, "el incierto se cuenta aparte");
});

test("sin fallos, la cola sigue vaciándose igual que antes", async () => {
  const hechos = [];
  const cola = createSendQueue(throttlerRapido, null, { maxCola: 50 });
  const tareas = Array.from({ length: 20 }, (_, i) =>
    cola.enqueue(async () => { hechos.push(i); }, { destino: `c${i}@s.whatsapp.net` }));
  await Promise.all(tareas);

  assert.equal(hechos.length, 20);
  const s = cola.getStats();
  assert.equal(s.length, 0);
  assert.equal(s.rechazadas, 0);
  assert.equal(s.timelocks, 0);
  assert.equal(s.colaMuerta, 0);
  assert.equal(s.inciertos, 0);
});

test("el timeout por defecto ya no es de dos minutos", () => {
  const fuente = readFileSync(new URL("../src/network/queue.js", import.meta.url), "utf8");
  assert.match(fuente, /const SEND_TIMEOUT_MS = 20000;/);
});
