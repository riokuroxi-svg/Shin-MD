/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  sesion.test.js — las cuatro piezas que no van del contenido:
//
//    1. calma tras reconectar (el pico de envíos al volver es lo que más
//       rápido dispara los límites),
//    2. detector de sordera (conexión abierta que ya no recibe nada),
//    3. portón de reentrada (mensajes viejos y repetidos al reconectar),
//    4. descanso diario (una cuenta despierta 24 h no parece una persona).
//
//  Todos los relojes se inyectan: ninguna prueba espera de verdad.
//  El log escribe en stdout y eso rompe el TAP, así que se silencia.
// ═══════════════════════════════════════════════════════════════════
const logOriginal = console.log;
console.log = () => {};

import { test, after } from "node:test";
import assert from "node:assert/strict";

const {
  crearCalmaDeReconexion,
  crearDetectorDeSordera,
  crearPortonDeReentrada,
  crearDescanso,
  crearSesion,
} = await import("../src/lib/sesion.js");

after(() => {
  console.log = logOriginal;
});

// ── 1. calma tras reconectar ──────────────────────────────────────────
test("al volver, la cola arranca al 10 % del ritmo y no de golpe", () => {
  let t = 1000;
  const calma = crearCalmaDeReconexion({ duracionMs: 60_000, inicial: 0.1, pasos: 6, ahora: () => t });
  assert.equal(calma.factorDeEspera(), 1, "en reposo no frena nada");
  calma.reiniciar();
  assert.equal(calma.activa, true);
  const primera = calma.factorDeEspera();
  assert.ok(primera >= 6, `arranca lento (espera ×${primera})`);
});

test("la calma se va soltando y termina en 1", () => {
  let t = 0;
  const calma = crearCalmaDeReconexion({ duracionMs: 60_000, inicial: 0.1, pasos: 6, ahora: () => t });
  calma.reiniciar();
  const valores = [];
  for (let i = 0; i <= 6; i++) {
    valores.push(calma.factorDeEspera());
    t += 10_000;
  }
  for (let i = 1; i < valores.length; i++) {
    assert.ok(valores[i] <= valores[i - 1], `nunca empeora: ${valores.join(" → ")}`);
  }
  assert.equal(valores[valores.length - 1], 1, "al minuto ya va al ritmo normal");
  assert.equal(calma.activa, false, "y se apaga sola");
});

test("si se vuelve a caer, la calma empieza otra vez", () => {
  let t = 0;
  const calma = crearCalmaDeReconexion({ duracionMs: 60_000, inicial: 0.1, pasos: 6, ahora: () => t });
  calma.reiniciar();
  t = 60_000;
  assert.equal(calma.factorDeEspera(), 1);
  calma.reiniciar();
  assert.ok(calma.factorDeEspera() > 1, "vuelve a frenar");
});

// ── 2. sesión sorda ───────────────────────────────────────────────────
test("una sesión que no recibe nada en 5 minutos pide reconectar", () => {
  let t = 0;
  let avisos = 0;
  const sordera = crearDetectorDeSordera({ silencioMs: 5 * 60_000, alSordera: () => avisos++, ahora: () => t });
  assert.equal(sordera.revisar(), false, "recién conectado, no");
  t = 4 * 60_000;
  assert.equal(sordera.revisar(), false, "a los 4 min todavía no");
  t = 6 * 60_000;
  assert.equal(sordera.revisar(), true, "a los 6 min sí");
  assert.equal(avisos, 1, "avisa una vez");
  t = 6 * 60_000 + 30_000;
  sordera.revisar();
  assert.equal(avisos, 1, "no repite el aviso cada segundo");
});

test("un mensaje que llega reinicia el reloj de la sordera", () => {
  let t = 0;
  const sordera = crearDetectorDeSordera({ silencioMs: 5 * 60_000, ahora: () => t });
  t = 4 * 60_000;
  sordera.latido();
  t = 8 * 60_000;
  assert.equal(sordera.revisar(), false, "4 min desde el último latido, no 8");
  assert.equal(sordera.estado().silencioMs, 4 * 60_000);
});

// ── 3. portón de reentrada ────────────────────────────────────────────
test("un mismo mensaje no entra dos veces", () => {
  const porton = crearPortonDeReentrada();
  const m = { key: { id: "ABC" }, messageTimestamp: Math.floor(Date.now() / 1000) };
  assert.equal(porton.dejarPasar(m), true, "la primera pasa");
  assert.equal(porton.dejarPasar(m), false, "la segunda no");
  assert.equal(porton.estado().repetidos, 1);
});

test("justo después de reconectar se descartan los mensajes viejos", () => {
  let t = 1_000_000;
  const porton = crearPortonDeReentrada({ ventanaMs: 30_000, edadMaxMs: 10_000, ahora: () => t });
  porton.reiniciar();
  const viejo = { key: { id: "V1" }, messageTimestamp: Math.floor((t - 3600_000) / 1000) };
  const nuevo = { key: { id: "N1" }, messageTimestamp: Math.floor(t / 1000) };
  assert.equal(porton.dejarPasar(viejo), false, "uno de hace una hora no");
  assert.equal(porton.dejarPasar(nuevo), true, "uno de ahora sí");
  assert.equal(porton.estado().viejos, 1);
});

test("pasada la ventana, un mensaje viejo sí entra (no se pierde nada)", () => {
  let t = 0;
  const porton = crearPortonDeReentrada({ ventanaMs: 30_000, edadMaxMs: 10_000, ahora: () => t });
  porton.reiniciar();
  t = 120_000;
  const viejo = { key: { id: "V2" }, messageTimestamp: 0 };
  assert.equal(porton.dejarPasar(viejo), true, "fuera de la ventana no se filtra");
});

test("el portón no se queda sin memoria: recuerda un número acotado", () => {
  const porton = crearPortonDeReentrada();
  for (let i = 0; i < 500; i++) {
    porton.dejarPasar({ key: { id: `id-${i}` }, messageTimestamp: Math.floor(Date.now() / 1000) });
  }
  assert.equal(porton.estado().recordados, 200, "tope de memoria");
});

// ── 4. descanso diario ────────────────────────────────────────────────
test("hay una hora de descanso al día y cambia de un día a otro", () => {
  const descanso = crearDescanso({ horas: 4, desdeHora: 1, hastaHora: 8 });
  const uno = descanso.ventana(new Date("2026-11-10T12:00:00Z").getTime());
  const dos = descanso.ventana(new Date("2026-11-11T12:00:00Z").getTime());
  assert.ok(uno && dos, "hay ventana");
  assert.equal(uno.hasta - uno.desde, 4, "dura cuatro horas");
  assert.ok(uno.desde >= 1 && uno.hasta <= 9, "cae dentro de la franja pedida");
  assert.notEqual(uno.desde, dos.desde, "no es la misma hora todos los días");
});

test("dentro de la ventana se descansa, fuera no", () => {
  const descanso = crearDescanso({ horas: 4, desdeHora: 1, hastaHora: 8 });
  const dia = new Date("2026-11-10T00:00:00Z");
  const v = descanso.ventana(dia.getTime());
  // Se entra por el minuto exacto de la ventana (la hora es decimal).
  const dentro = new Date(dia);
  dentro.setHours(Math.floor(v.desde), Math.ceil((v.desde % 1) * 60) + 5, 0, 0);
  const fuera = new Date(dia);
  fuera.setHours(Math.floor(v.hasta) + 1, 0, 0, 0);
  assert.equal(descanso.enDescanso(dentro.getTime()), true, "dentro descansa");
  assert.equal(descanso.enDescanso(fuera.getTime()), false, "fuera no");
});

test("con DESCANSO_HORAS=0 el descanso se apaga", () => {
  const descanso = crearDescanso({ horas: 0 });
  assert.equal(descanso.ventana(), null);
  assert.equal(descanso.enDescanso(), false);
  assert.equal(descanso.estado().activo, false);
});

// ── el juego completo ─────────────────────────────────────────────────
test("crearSesion arma las cuatro piezas y respeta SESION=off", () => {
  const ses = crearSesion();
  for (const pieza of ["calma", "sordera", "porton", "descanso"]) {
    assert.ok(ses[pieza], `trae ${pieza}`);
  }
  assert.equal(ses.activo, true);
  process.env.SESION = "off";
  assert.equal(crearSesion().activo, false, "se apaga entera");
  delete process.env.SESION;
});
