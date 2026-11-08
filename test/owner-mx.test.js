/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  owner-mx.test.js — El dueño mexicano se reconoce con 52 o con 521.
//
//  WhatsApp a veces manda el remitente como 5215574370309 y otras el
//  número se configura como 525574370309. Las dos formas son la misma
//  persona: al comparar deben coincidir. Y los JID que se usan para
//  ENVIAR no se tocan, porque WhatsApp espera la forma original.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import { mxCanon, userPart, normalizeJid, botJid } from "../src/serialize.js";

test("mxCanon: 52+1+10 dígitos se reduce a 52+10", () => {
  assert.equal(mxCanon("5215574370309"), "525574370309");
  assert.equal(mxCanon("525574370309"), "525574370309");
  assert.equal(mxCanon("+52 1 55 7437 0309"), "525574370309");
});

test("mxCanon: no toca números de otros países ni longitudes raras", () => {
  assert.equal(mxCanon("5491122334455"), "5491122334455"); // Argentina
  assert.equal(mxCanon("34612345678"), "34612345678"); // España
  assert.equal(mxCanon("521234"), "521234"); // corto: no es móvil MX
  assert.equal(mxCanon(""), "");
  assert.equal(mxCanon(null), "");
});

test("userPart: las dos formas del mismo dueño coinciden", () => {
  const remitente = "5215574370309:12@s.whatsapp.net";
  const configurado = "525574370309@s.whatsapp.net";
  assert.equal(userPart(remitente), userPart(configurado));
  assert.equal(userPart("5215574370309"), "525574370309");
});

test("los JID para enviar conservan la forma original de WhatsApp", () => {
  assert.equal(normalizeJid("5215574370309:3@s.whatsapp.net"), "5215574370309@s.whatsapp.net");
  assert.equal(botJid({ user: { id: "5215574370309:7@s.whatsapp.net" } }), "5215574370309@s.whatsapp.net");
});
