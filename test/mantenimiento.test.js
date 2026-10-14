/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  mantenimiento.test.js — Los servicios que cuidan al bot 24/7:
//  filtro de consola, anti-crash, limpieza de temporales y memoria.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { esRuido } from "../src/services/log-filter.js";
import { esErrorDeRed } from "../src/services/anti-crash.js";
import { limpiarTemporales } from "../src/services/temp-cleaner.js";
import { decidir } from "../src/services/memory-monitor.js";

test("filtro: oculta el ruido de libsignal y nada más", () => {
  assert.equal(esRuido(["Closing session:", { llaves: 1 }]), true);
  assert.equal(esRuido(["Opening session:", {}]), true);
  assert.equal(esRuido(["Removing old closed session:", {}]), true);
  assert.equal(esRuido(["Failed to decrypt message with any known session..."], true), true);
  assert.equal(esRuido(["Session error:Error: Bad MAC"], true), true);
  // Logs propios del bot que mencionan palabras parecidas: se ven.
  assert.equal(esRuido(["✓ Sesión abierta, Closing session: no"]), false);
  assert.equal(esRuido(["Error al descargar AES/HMAC"]), false);
  assert.equal(esRuido(["Router: fallo"], true), false);
  assert.equal(esRuido([{ objeto: true }]), false);
  assert.equal(esRuido([]), false);
});

test("anti-crash: distingue cortes de red de fallos reales", () => {
  assert.equal(esErrorDeRed(Object.assign(new Error("x"), { code: "ECONNRESET" })), true);
  assert.equal(esErrorDeRed(new Error("socket hang up")), true);
  assert.equal(esErrorDeRed(new Error("write EPIPE")), true);
  assert.equal(esErrorDeRed({ message: "fetch failed", cause: { code: "UND_ERR_SOCKET" } }), true);
  assert.equal(esErrorDeRed(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(esErrorDeRed(null), false);
});

test("limpieza: borra solo lo viejo y, en la carpeta del sistema, solo lo del bot", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "shin-limpieza-"));
  const propia = path.join(raiz, "tmp");
  const sistema = path.join(raiz, "sistema");
  fs.mkdirSync(propia);
  fs.mkdirSync(sistema);

  const ahora = Date.now();
  const viejo = (ahora - 2 * 60 * 60 * 1000) / 1000; // hace 2 horas
  const crear = (ruta, antiguo) => {
    fs.writeFileSync(ruta, "x");
    if (antiguo) fs.utimesSync(ruta, viejo, viejo);
  };

  crear(path.join(propia, "viejo.mp3"), true);
  crear(path.join(propia, "en-uso.mp3"), false);
  crear(path.join(propia, ".nomedia"), true);
  fs.mkdirSync(path.join(sistema, "ginko-mp3-abc"));
  crear(path.join(sistema, "ginko-mp3-abc", "a.mp3"), true);
  fs.utimesSync(path.join(sistema, "ginko-mp3-abc"), viejo, viejo);
  crear(path.join(sistema, "in_1700000000000_k3j2.mp3"), true);
  crear(path.join(sistema, "de-otro-programa.txt"), true);
  crear(path.join(sistema, "ginko_tts_1.mp3"), false);

  const n = limpiarTemporales({
    carpetas: [
      { dir: propia, todo: true },
      { dir: sistema, todo: false },
      { dir: path.join(raiz, "no-existe"), todo: true },
    ],
    ahora,
  });

  assert.equal(n, 3);
  assert.ok(!fs.existsSync(path.join(propia, "viejo.mp3")));
  assert.ok(fs.existsSync(path.join(propia, "en-uso.mp3")), "lo reciente no se toca");
  assert.ok(fs.existsSync(path.join(propia, ".nomedia")), "lo oculto no se toca");
  assert.ok(!fs.existsSync(path.join(sistema, "ginko-mp3-abc")));
  assert.ok(!fs.existsSync(path.join(sistema, "in_1700000000000_k3j2.mp3")));
  assert.ok(fs.existsSync(path.join(sistema, "de-otro-programa.txt")), "lo ajeno no se toca");
  assert.ok(fs.existsSync(path.join(sistema, "ginko_tts_1.mp3")), "reciente, aunque sea del bot");

  fs.rmSync(raiz, { recursive: true, force: true });
});

test("memoria: avisa por defecto y solo reinicia si se pidió", () => {
  const MB = 1024 * 1024;
  assert.equal(decidir(100 * MB, 512, false), "ok");
  assert.equal(decidir(600 * MB, 512, false), "avisar");
  assert.equal(decidir(600 * MB, 512, true), "reiniciar");
  assert.equal(decidir(600 * MB, 0, true), "ok", "límite 0 = apagado");
});
