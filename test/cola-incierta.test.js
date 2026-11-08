/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El caso que provocaba mensajes duplicados:
// un envío que no contesta en 120 s NO se sabe si llegó. Reintentarlo a
// ciegas lo manda dos veces, y el doble mensaje es lo que los contactos
// reportan como spam. Se prueba contando cuántas veces se llamó de verdad.
// El módulo avisa por el log cuando algo queda incierto, y el log escribe en
// stdout con console.log: eso rompe el TAP del runner. Aquí solo interesa el
// conteo, así que se apaga la salida mientras dura la prueba.
const logOriginal = console.log;
console.log = () => {};

import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const { createSendQueue, CODIGO_INCIERTO } = await import(
  path.join(RAIZ, "src", "network", "queue.js")
);

// Se devuelve pase lo que pase, para no dejar muda la suite entera.
after(() => {
  console.log = logOriginal;
});

/** Throttler de mentira: sin esperas reales, para que la prueba sea rápida. */
const sinEspera = { calcDelay: () => 1, canSend: () => true, recordSent: () => {} };

const caja = () => {
  const e = { enviados: 0, fallos: 0 };
  return {
    ...e,
    get enviados() {
      return e.enviados;
    },
    recordSend: () => {},
    recordSendFail: () => {
      e.fallos += 1;
    },
  };
};

test("un envío sin respuesta NO se repite (antes se mandaba dos veces)", async () => {
  let llamadas = 0;
  const cola = createSendQueue(sinEspera, caja(), { timeoutMs: 60 });

  // Temporizadores propios para poder cerrarlos: si queda uno vivo, el
  // proceso de la prueba no termina y el runner se queja al deserializar.
  const pendientes = [];
  const tarea = () =>
    new Promise((resolve) => {
      llamadas += 1;
      // Nunca contesta: es el caso de Baileys colgado. La promesa sigue
      // viva en segundo plano, como en producción.
      pendientes.push(setTimeout(() => resolve({ key: { id: "tarde" } }), 10000));
    });

  await assert.rejects(() => cola.enqueue(tarea, { messageLength: 10 }), (e) => {
    assert.equal(e.code, CODIGO_INCIERTO, "tiene que marcarse como incierto");
    assert.match(e.message, /sin respuesta/);
    return true;
  });

  for (const t of pendientes) clearTimeout(t);
  assert.equal(llamadas, 1, `se llamó ${llamadas} veces: el mensaje se duplica`);
  const st = cola.getStats();
  assert.equal(st.inciertos, 1, "tiene que quedar anotado como incierto");
  assert.ok(st.ultimoIncierto > 0, "con la hora, para poder verlo");
});

test("un fallo SEGURO sí se reintenta, como siempre", async () => {
  let llamadas = 0;
  const cola = createSendQueue(sinEspera, caja(), { timeoutMs: 500 });

  const r = await cola.enqueue(
    async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("socket cerrado");
      return { key: { id: "ok" } };
    },
    { messageLength: 5 },
  );

  assert.equal(llamadas, 2, "el socket dijo que no: aquí sí hay que reintentar");
  assert.equal(r.key.id, "ok");
  assert.equal(cola.getStats().inciertos, 0, "un fallo seguro no es una incógnita");
});

test("si el reintento también se queda sin respuesta, no hay tercero", async () => {
  let llamadas = 0;
  const cola = createSendQueue(sinEspera, caja(), { timeoutMs: 40 });

  const tarea = () => {
    llamadas += 1;
    if (llamadas === 1) return Promise.reject(new Error("boom"));
    return new Promise(() => {}); // el reintento se cuelga para siempre
  };

  await assert.rejects(() => cola.enqueue(tarea, { messageLength: 1 }));
  assert.equal(llamadas, 2, "ni uno más: dos intentos y se acabó");
  assert.equal(cola.getStats().inciertos, 1);
});

test("el contador de inciertos no se inventa cuando todo va bien", async () => {
  const cola = createSendQueue(sinEspera, caja(), { timeoutMs: 500 });
  for (let i = 0; i < 3; i++) {
    await cola.enqueue(async () => ({ key: { id: `m${i}` } }), { messageLength: 1 });
  }
  const st = cola.getStats();
  assert.equal(st.inciertos, 0);
  assert.equal(st.length, 0, "la cola queda vacía");
});
