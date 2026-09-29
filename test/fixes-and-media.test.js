/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadMediaFromObject } from "#commands";
import createWebServer from "#server";

function mockEngine() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getStatus: () => ({ score: 3, level: "safe", events: 2 }) }),
    getSendQueue: () => ({ length: () => 1, isPaused: () => false }),
    bootTime: Date.now() - 60000,
  };
}

test("downloadMediaFromObject devuelve null para mensajes sin media", async () => {
  const textMsg = { conversation: "hola mundo" };
  const res = await downloadMediaFromObject(textMsg);
  assert.equal(res, null);
});

test("sock.reply funciona y responde correctamente", async () => {
  const sent = [];
  const fakeSock = {
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: "MSG_REPLY_1" } };
    },
  };
  fakeSock.reply = (jid, text, quoted, o) => {
    const content = typeof text === "string" ? { text } : (text || {});
    const quote = quoted?.key ? quoted : (quoted?.full || quoted);
    return fakeSock.sendMessage(jid, { ...content, ...(o || {}) }, { quoted: quote });
  };

  await fakeSock.reply("12345@s.whatsapp.net", "Mensaje de prueba", { key: { id: "Q1" } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, "12345@s.whatsapp.net");
  assert.equal(sent[0].content.text, "Mensaje de prueba");
  assert.equal(sent[0].opts.quoted.key.id, "Q1");
});

test("web server metrics incluye shin_version y fingerprint", async () => {
  const web = createWebServer(mockEngine(), { port: 0, host: "127.0.0.1" });
  if (!web.server.listening) {
    await new Promise(r => web.server.once("listening", r));
  }
  const bound = web.server.address();
  const port = bound.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(typeof data.shin_version, "string");
    assert.equal(data.fingerprint, "shin-gauss-0.25-1200ms");
  } finally {
    web.close();
  }
});
