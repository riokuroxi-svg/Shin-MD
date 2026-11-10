/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ritmo.test.js — el cupo son conversaciones, no mensajes.
//
//  Cada prueba fija una regla que, si se rompe, convierte al bot en una
//  tubería: contestar a quien te escribió no gasta cupo, abrir conversación
//  con un desconocido sí, de madrugada no se abre nada, y el tecleo se
//  enciende antes de mandar (es la señal que WhatsApp nombra en su propio
//  documento sobre spam).
//
//  El reloj se inyecta: ninguna prueba espera a la hora real.
//  El log escribe en stdout y eso rompe el TAP, así que se silencia.
// ═══════════════════════════════════════════════════════════════════
const logOriginal = console.log;
console.log = () => {};

import { test, after } from "node:test";
import assert from "node:assert/strict";

const { crearRitmo, curvaCircadiana, planDeTecleo } = await import("../src/lib/ritmo.js");
const { createThrottler, PERFILES, AVISO_VETERANO } = await import("../src/core/engine/throttler.js");
const { createSendQueue } = await import("../src/network/queue.js");

after(() => {
  console.log = logOriginal;
});

const AJUSTES = {
  activo: true,
  nuevosDia: 3,
  nuevosPrimerDia: 1,
  nuevosDiaTres: 2,
  diasDeRampa: 7,
  mensajesHora: 5,
  porChatHora: 3,
  calienteMin: 60,
  silencioDesde: 2,
  silencioHasta: 6,
  tecleoWpm: 45,
  tecleoMinMs: 700,
  tecleoMaxMs: 4000,
  presencia: true,
};

/** Un instante de hoy a la hora pedida. */
const aLas = (hora) => {
  const d = new Date();
  d.setHours(hora, 0, 0, 0);
  return d.getTime();
};

/** Un reloj de mentira, para no depender de la hora del servidor. */
const relojFijo = (t) => () => t;

const AGUILA = "5215511111111@s.whatsapp.net";
const OTRO = "5215522222222@s.whatsapp.net";

// ── el reloj ──────────────────────────────────────────────────────────
test("de madrugada la espera se estira y de día se acorta", () => {
  const noche = curvaCircadiana(3, AJUSTES);
  const dia = curvaCircadiana(15, AJUSTES);
  assert.ok(noche.factor > 2, `de madrugada más lento (${noche.factor})`);
  assert.ok(dia.factor < 1, `de día más rápido (${dia.factor})`);
  assert.equal(noche.madrugada, true);
  assert.equal(dia.madrugada, false);
});

test("la curva no da saltos entre horas vecinas", () => {
  for (let h = 0; h < 23; h++) {
    const a = curvaCircadiana(h, AJUSTES).factor;
    const b = curvaCircadiana(h + 1, AJUSTES).factor;
    assert.ok(Math.abs(a - b) < 0.9, `entre las ${h} y las ${h + 1}: ${a} → ${b}`);
  }
});

// ── el tecleo ─────────────────────────────────────────────────────────
test("un texto largo tarda más en escribirse, con techo y con suelo", () => {
  const corto = planDeTecleo("hola", AJUSTES).ms;
  const largo = planDeTecleo("x".repeat(400), AJUSTES).ms;
  const enorme = planDeTecleo("x".repeat(5000), AJUSTES).ms;
  assert.ok(largo > corto, "lo largo tarda más");
  assert.equal(enorme, AJUSTES.tecleoMaxMs, "nadie se queda medio minuto escribiendo");
  assert.ok(corto >= AJUSTES.tecleoMinMs, "ni aparece y desaparece de golpe");
});

// ── conversaciones nuevas ─────────────────────────────────────────────
test("contestar a quien ya escribió no gasta el cupo de conversaciones", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(12)) });
  ritmo.anotarEntrante(AGUILA);
  assert.equal(ritmo.evaluar(AGUILA).ok, true, "se puede contestar");
  assert.equal(ritmo.resumen().nuevosHoy, 0, "y no cuenta como conversación nueva");
});

test("escribirle a un desconocido gasta cupo, y el cupo se acaba", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(12)) });
  assert.equal(ritmo.evaluar(AGUILA).ok, true, "el primero pasa");
  ritmo.anotarSalida(AGUILA);
  assert.equal(ritmo.resumen().nuevosHoy, 1, "queda apuntado");

  const d = ritmo.evaluar(OTRO);
  assert.equal(d.ok, false, "el segundo ya no pasa");
  assert.equal(d.motivo, "chats-nuevos");
  assert.ok(d.esperarMs > 0 && d.esperarMs <= 3600000, "y dice cuánto esperar");
});

test("de madrugada no se abre conversación, pero sí se contesta", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(3)) });
  assert.equal(ritmo.evaluar(AGUILA).motivo, "madrugada", "frío: no");
  ritmo.anotarEntrante(AGUILA);
  assert.equal(ritmo.evaluar(AGUILA).ok, true, "caliente: sí");
});

test("lo urgente nunca se frena", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(3)) });
  assert.equal(ritmo.evaluar(AGUILA, { urgente: true }).ok, true);
});

test("nadie manda más de lo permitido seguido en el mismo chat", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(12)) });
  ritmo.anotarEntrante(AGUILA);
  for (let i = 0; i < AJUSTES.porChatHora; i++) {
    assert.equal(ritmo.evaluar(AGUILA).ok, true, `el mensaje ${i + 1} pasa`);
    ritmo.anotarSalida(AGUILA);
  }
  const d = ritmo.evaluar(AGUILA);
  assert.equal(d.ok, false);
  assert.equal(d.motivo, "por-chat");
});

test("la calidez se enfría con el tiempo", () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: relojFijo(aLas(8)) });
  ritmo.anotarEntrante(AGUILA);
  assert.equal(ritmo.caliente(AGUILA, aLas(9)), true, "una hora después todavía");
  assert.equal(ritmo.caliente(AGUILA, aLas(14)), false, "seis horas después ya no");
});

test("el estado vive fuera: reiniciar el proceso no reinicia el cupo", () => {
  const estado = {};
  const t = aLas(12);
  const uno = crearRitmo({ estado, ajustes: AJUSTES, ahora: relojFijo(t) });
  uno.anotarEntrante(AGUILA);
  uno.anotarSalida(AGUILA);
  const dos = crearRitmo({ estado, ajustes: AJUSTES, ahora: relojFijo(t) });
  assert.equal(dos.resumen().salidasHoy, 1, "el segundo proceso ve lo mismo");
});

test("la ventana por hora se vacía sola: no confunde ayer con hoy", () => {
  let t = aLas(12);
  const ritmo = crearRitmo({ estado: {}, ajustes: AJUSTES, ahora: () => t });
  ritmo.anotarEntrante(AGUILA);
  for (let i = 0; i < AJUSTES.mensajesHora; i++) ritmo.anotarSalida(AGUILA);
  assert.equal(ritmo.evaluar(AGUILA).ok, false, "al tope por hora");
  t += 61 * 60000; // pasa algo más de una hora
  // A la hora nueva el contador del chat viejo ya caducó y la calidez también.
  assert.equal(ritmo.resumen().porHora, 0, "la ventana se vació");
});

// ── la cola frena a quien debe y deja pasar lo demás ──────────────────
test("la cola deja pasar la respuesta y retiene el chat desconocido", async () => {
  const ritmo = crearRitmo({ estado: {}, ajustes: { ...AJUSTES, nuevosDia: 1, nuevosPrimerDia: 1 }, ahora: relojFijo(aLas(12)) });
  ritmo.anotarEntrante(AGUILA);
  const enviados = [];
  const cola = createSendQueue(null, null, { ritmo, avisarRitmo: () => {} });

  await cola.enqueue(() => {
    enviados.push("desconocido");
  }, { destino: OTRO });
  // El segundo desconocido no cabe: se queda en la cola.
  cola.enqueue(() => {
    enviados.push("otro-desconocido");
  }, { destino: "5215533333333@s.whatsapp.net" }).catch(() => {});
  await cola.enqueue(() => {
    enviados.push("respuesta");
  }, { destino: AGUILA });

  assert.deepEqual(enviados, ["desconocido", "respuesta"]);
  assert.equal(cola.length(), 1, "el desconocido sigue esperando");
  cola.clear();
});

// ── perfiles del calentamiento ────────────────────────────────────────
test("el perfil veterano da el tope máximo el primer día", () => {
  const t = createThrottler({ perfil: "veterano" });
  const s = t.getStats();
  assert.equal(s.perfil, "veterano");
  assert.equal(s.dailyLimit, 2000, "tope completo desde hoy");
  assert.equal(s.warmUpComplete, true, "la rampa se da por terminada");
});

test("el perfil auto sigue subiendo con los días", () => {
  const hace3 = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const t = createThrottler({ warmUpStartDate: hace3, warmUpStartMsgsPerDay: 20, warmUpMaxMsgsPerDay: 2000 });
  const s = t.getStats();
  assert.ok(s.dailyLimit > 20 && s.dailyLimit < 2000, `tope intermedio (${s.dailyLimit})`);
  assert.equal(s.warmUpComplete, false);
});

test("el perfil cambia en caliente y un nombre inventado no cambia nada", () => {
  const t = createThrottler();
  assert.ok(PERFILES.includes("veterano"));
  assert.deepEqual(t.cambiarPerfil("veterano"), { antes: "auto", ahora: "veterano" });
  assert.equal(t.getStats().dailyLimit, 2000);
  assert.equal(t.cambiarPerfil("modo-dios"), null);
  assert.equal(t.getStats().perfil, "veterano", "se queda como estaba");
});

test("el aviso del perfil veterano dice qué se arriesga", () => {
  assert.match(AVISO_VETERANO, /arriesga/i);
  assert.match(AVISO_VETERANO, /número nuevo/i);
});
