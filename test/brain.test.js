/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  brain.test.js — El anti-spam que vino de Shin-Lab.
//
//  Las pruebas son las del laboratorio (allí pasaron antes de migrar) más
//  las de la integración con el bot: que el techo de siempre siga puesto
//  y que el freno no toque a quien escribe normal.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { createBrain } from "../src/lib/brain.js";
import createCooldown from "../src/commands/middleware/cooldown.js";

// ── El cerebro por dentro ────────────────────────────────────────────

test("conversación normal → ALLOW", () => {
  const brain = createBrain();
  const t0 = 1_000_000;
  let r;
  for (let i = 0; i < 3; i++) {
    r = brain.decide({ userId: "u1", text: "mensaje distinto " + i, ts: t0 + i * 5000 });
  }
  assert.equal(r.action, "ALLOW");
  assert.ok(r.score < 30, "score bajo en conversación normal, fue " + r.score);
});

test("ráfaga de 9 mensajes en menos de 2s → BLOCK", () => {
  const brain = createBrain();
  const t0 = 2_000_000;
  let r;
  for (let i = 0; i < 9; i++) {
    r = brain.decide({ userId: "u2", text: "msg " + i, ts: t0 + i * 200 });
  }
  assert.equal(r.action, "BLOCK");
  assert.ok(r.reasons.some((x) => x.startsWith("ráfaga")));
});

test("el mismo texto 3 veces seguidas → BLOCK", () => {
  const brain = createBrain();
  const t0 = 3_000_000;
  let r;
  for (let i = 0; i < 3; i++) {
    r = brain.decide({ userId: "u3", text: "COMPRA YA MI PRODUCTO", ts: t0 + i * 4000 });
  }
  assert.equal(r.action, "BLOCK");
  assert.ok(r.reasons.some((x) => x.includes("repetido")));
});

test("inundación de comandos → frena antes de bloquear", () => {
  const brain = createBrain();
  const t0 = 4_000_000;
  let r;
  for (let i = 0; i < 5; i++) {
    r = brain.decide({ userId: "u4", text: ".play cancion " + i, isCommand: true, ts: t0 + i * 1500 });
  }
  assert.equal(r.action, "SLOW", "5 comandos en la ventana deben frenar, no bloquear");
  assert.ok(r.reasons.some((x) => x.includes("comandos")));
});

test("cada usuario tiene su propia cuenta y la memoria no crece sin fin", () => {
  const brain = createBrain({ maxKeep: 8 });
  const t0 = 5_000_000;
  for (let i = 0; i < 50; i++) {
    brain.decide({ userId: "spammer", text: "x", ts: t0 + i });
  }
  assert.equal(brain.decide({ userId: "tranquilo", text: "hola", ts: t0 + 999 }).action, "ALLOW");
  assert.ok(brain.size() <= 2, "solo deben quedar los usuarios vistos");
  brain.reset("spammer");
  assert.equal(brain.size(), 1);
});

// ── Integración con el bot ───────────────────────────────────────────

test("el cooldown sigue bloqueando al que pasa de 10 mensajes por minuto", () => {
  const cd = createCooldown();
  const cmd = { name: "ping", cooldown: 0 };
  let bloqueado = false;
  // Espaciados 7s: el brain no ve ráfaga, así que quien corta es el techo de siempre.
  for (let i = 0; i < 12; i++) {
    // Textos distintos a propósito: así quien corta es el techo de 10/min
    // y no la regla de texto repetido del brain.
    if (cd.check({ senderId: "usuario1", cmd, text: ".ping " + i })) { bloqueado = true; break; }
  }
  assert.equal(bloqueado, true, "el antispam de siempre tiene que seguir cortando");
});

test("el brain bloquea una ráfaga que el techo de 10/min dejaba pasar", () => {
  const cd = createCooldown();
  const cmd = { name: "ping", cooldown: 0 };
  const t0 = 6_000_000;
  let bloqueado = false;
  for (let i = 0; i < 30; i++) {
    if (cd.check({ senderId: "usuario2", cmd, text: ".otro" + i, ahora: t0 + i * 50 })) { bloqueado = true; break; }
  }
  assert.equal(bloqueado, true, "30 mensajes en 1,5s es una ráfaga evidente");
});

test("el dueño no se ve afectado por ninguna de las dos capas", () => {
  const cd = createCooldown();
  const cmd = { name: "menu", cooldown: 0, ownerOnly: true };
  for (let i = 0; i < 40; i++) {
    assert.equal(cd.check({ senderId: "dueño", cmd, text: ".menu" }), false);
  }
});

test("SHIN_BRAIN=0 deja el antispam de siempre, sin el brain", () => {
  const anterior = process.env.SHIN_BRAIN;
  process.env.SHIN_BRAIN = "0";
  try {
    const cd = createCooldown();
    const cmd = { name: "ping", cooldown: 0 };
    const t0 = 7_000_000;
    // Una ráfaga de 9: con el brain cortaría; apagado, pasa (el techo de 10/min no llega).
    let bloqueados = 0;
    for (let i = 0; i < 9; i++) {
      if (cd.check({ senderId: "usuario3", cmd, text: ".x" + i, ahora: t0 + i * 50 })) bloqueados++;
    }
    assert.equal(bloqueados, 0, "apagado, el brain no debe cortar nada");
  } finally {
    if (anterior === undefined) delete process.env.SHIN_BRAIN;
    else process.env.SHIN_BRAIN = anterior;
  }
});
