/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * B2.2 — Cuota diaria del warm-up y portada de los MP3.
 *
 * Qué se protege aquí:
 *  · Que reacciones/borrados/ediciones NO gasten la cuota diaria ni se
 *    queden congelados 60s detrás del tope (era la causa real de que
 *    .play "se acabara" tras 2 usos: gastaba 9 envíos de los 20 del día).
 *  · Que los envíos de verdad SÍ sigan gastando cuota (el anti-ban sigue).
 *  · Que exista al menos una portada válida para incrustar en los MP3.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import createSendQueue from "../src/network/queue.js";
import { createThrottler } from "../src/core/engine/throttler.js";
import { esEnvioLigero } from "../src/core/socket.js";
import { listAudioCovers, pickAudioCover } from "../src/lib/mp3Utils.js";
import warmupCmd from "../cmds/main/warmup.js";

// Throttler de laboratorio: sin esperas reales.
function throttlerFalso({ canSend = true } = {}) {
  let enviados = 0;
  return {
    canSend: () => canSend,
    calcDelay: () => 0,
    recordSent: () => { enviados++; },
    getStats: () => ({ day: 1, dailyLimit: 20, msgsToday: enviados, totalSent: enviados, warmUpComplete: false, dailyLimitReached: false }),
    get enviados() { return enviados; },
  };
}

test("B2.2: reacciones, borrados y ediciones se detectan como envíos ligeros", () => {
  assert.equal(esEnvioLigero({ react: { text: "✅", key: {} } }), true);
  assert.equal(esEnvioLigero({ delete: { id: "ABC" } }), true);
  assert.equal(esEnvioLigero({ text: "listo", edit: { id: "ABC" } }), true);

  // Lo que SÍ es un mensaje nuevo debe seguir contando
  assert.equal(esEnvioLigero({ text: "hola" }), false);
  assert.equal(esEnvioLigero({ audio: Buffer.alloc(1), mimetype: "audio/mpeg" }), false);
  assert.equal(esEnvioLigero({ image: Buffer.alloc(1) }), false);
  assert.equal(esEnvioLigero(null), false);
  assert.equal(esEnvioLigero(undefined), false);
});

test("B2.2: un envío normal gasta cuota; uno ligero no", async () => {
  const th = throttlerFalso();
  const q = createSendQueue(th, null);

  await q.enqueue(async () => "texto");
  assert.equal(th.enviados, 1, "un texto debe gastar 1 de cuota");

  await q.enqueue(async () => "react", { countsForQuota: false });
  await q.enqueue(async () => "delete", { countsForQuota: false });
  assert.equal(th.enviados, 1, "reacción y borrado NO deben gastar cuota");
});

test("B2.2: con el tope alcanzado, los envíos ligeros pasan igual (no se congelan 60s)", async () => {
  const th = throttlerFalso({ canSend: false });
  const q = createSendQueue(th, null);

  let ejecutado = false;
  const t0 = Date.now();
  await q.enqueue(async () => { ejecutado = true; return "react"; }, { countsForQuota: false });

  assert.equal(ejecutado, true, "la reacción debe ejecutarse aunque el tope esté alcanzado");
  assert.ok(Date.now() - t0 < 5000, "no debe esperar los 60s del bloqueo");
  assert.equal(th.enviados, 0, "y sigue sin gastar cuota");
});

test("B2.2: con el tope alcanzado, una tarea prioritaria sigue pasando", async () => {
  const th = throttlerFalso({ canSend: false });
  const q = createSendQueue(th, null);

  const r = await q.enqueue(async () => "pong", { isPriority: true });
  assert.equal(r, "pong");
});

test("B2.2: el throttler acepta topes configurables desde el .env (boot)", () => {
  const hoy = new Date().toISOString().slice(0, 10);

  // Por defecto: día 0 = 20 mensajes (el caso que rompía .play)
  const porDefecto = createThrottler({ warmUpStartDate: hoy });
  assert.equal(porDefecto.getStats().dailyLimit, 20);

  // Con override: día 0 = 60
  const configurado = createThrottler({ warmUpStartDate: hoy, warmUpStartMsgsPerDay: 60 });
  assert.equal(configurado.getStats().dailyLimit, 60);

  // WARMUP=off (boot pasa MAX_SAFE_INTEGER): siempre puede enviar
  const sinTope = createThrottler({
    warmUpStartDate: hoy,
    warmUpStartMsgsPerDay: Number.MAX_SAFE_INTEGER,
    warmUpMaxMsgsPerDay: Number.MAX_SAFE_INTEGER,
  });
  for (let i = 0; i < 1000; i++) sinTope.recordSent();
  assert.equal(sinTope.canSend(), true, "con WARMUP=off nunca se bloquea por cantidad");
  // …pero el ritmo anti-ban (delay) se conserva
  assert.ok(sinTope.calcDelay({ messageLength: 50 }) > 0, "el delay entre mensajes NO se desactiva");
});

test("B2.2: el comando .warmup responde y es de prioridad", async () => {
  assert.equal(warmupCmd.priority, true, "debe contestar aunque el tope esté alcanzado");
  assert.equal(warmupCmd.ownerOnly, true);

  const th = createThrottler({ warmUpStartDate: new Date().toISOString().slice(0, 10) });
  th.recordSent();
  const engineFalso = {
    getThrottler: () => th,
    getSendQueue: () => ({ length: () => 0 }),
  };

  const salida = await warmupCmd.handler(null, {}, engineFalso);
  assert.equal(typeof salida, "string");
  assert.match(salida, /1 \/ 20/, "debe mostrar los mensajes usados sobre el tope");
  assert.match(salida, /usos de \.play/);

  // Sin motor no debe reventar
  const sinMotor = await warmupCmd.handler(null, {}, {});
  assert.match(sinMotor, /❌/);
});

test("B2.2: hay portada válida para incrustar en los MP3", () => {
  const portadas = listAudioCovers(true);
  assert.ok(portadas.length > 0, "debe existir al menos una portada en media/covers/ o media/audio-cover.jpg");

  for (const p of portadas) {
    const st = fs.statSync(p);
    assert.ok(st.size > 0, `${p} no puede estar vacía`);
    assert.ok(st.size <= 500 * 1024, `${p} pasa de 500KB: WhatsApp renombraría el audio a AUD-xxxx`);
    // Magic bytes: JPEG (FF D8 FF) o PNG (89 50 4E 47)
    const cab = fs.readFileSync(p).subarray(0, 4);
    const esJpeg = cab[0] === 0xFF && cab[1] === 0xD8 && cab[2] === 0xFF;
    const esPng = cab[0] === 0x89 && cab[1] === 0x50 && cab[2] === 0x4E && cab[3] === 0x47;
    assert.ok(esJpeg || esPng, `${p} no es un JPEG/PNG válido`);
  }

  // La elección al azar siempre devuelve una de las portadas listadas
  for (let i = 0; i < 20; i++) {
    assert.ok(portadas.includes(pickAudioCover()));
  }
});
