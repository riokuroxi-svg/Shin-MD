/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ytdlp-cliente.test.js — Cliente de YouTube que se le pide a yt-dlp.
//  Por defecto ninguno (el de yt-dlp); con YTDLP_PLAYER_CLIENTS se fuerza.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { argsClienteYtdlp } from "../src/lib/ytdlp-cliente.js";

test("sin configurar: no se fuerza cliente (yt-dlp elige)", () => {
  const antes = process.env.YTDLP_PLAYER_CLIENTS;
  delete process.env.YTDLP_PLAYER_CLIENTS;
  try {
    assert.deepEqual(argsClienteYtdlp(), []);
    assert.deepEqual(argsClienteYtdlp("default"), []);
    assert.deepEqual(argsClienteYtdlp(""), []);
  } finally {
    if (antes !== undefined) process.env.YTDLP_PLAYER_CLIENTS = antes;
  }
});

test("con cliente explícito o por .env: se pasa a yt-dlp", () => {
  assert.deepEqual(argsClienteYtdlp("tv_embedded"), [
    "--extractor-args",
    "youtube:player_client=tv_embedded",
  ]);
  const antes = process.env.YTDLP_PLAYER_CLIENTS;
  process.env.YTDLP_PLAYER_CLIENTS = "android,web";
  try {
    assert.deepEqual(argsClienteYtdlp(), ["--extractor-args", "youtube:player_client=android,web"]);
  } finally {
    if (antes === undefined) delete process.env.YTDLP_PLAYER_CLIENTS;
    else process.env.YTDLP_PLAYER_CLIENTS = antes;
  }
});
