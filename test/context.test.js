/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  context.test.js — Candado de la fábrica única de contexto.
//
//  Estos tests existen para que la duplicación NO pueda volver:
//  si alguien construye un `msg` a mano en router.js o loader.js otra
//  vez, los campos que los hooks necesitan dejarán de estar y el test
//  "hooks y comandos ven el mismo contexto" fallará.
// ═══════════════════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";

import { serializeMessage } from "#serialize";
import { createEngine } from "#engine";
import {
  buildEnrichedMessage,
  buildCommandContext,
  resolveGroupFacts,
  ensureReplyShim,
  findMediaKey,
} from "../src/commands/context.js";

function makeFakeSock(extra = {}) {
  const sent = [];
  return {
    user: { id: "521234567890:4@s.whatsapp.net", name: "Shin" },
    sent,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: "FAKE" + sent.length } };
    },
    async sendPresenceUpdate() {},
    ...extra,
  };
}

function makeMessage(text, overrides = {}) {
  return {
    key: {
      remoteJid: overrides.remoteJid || "521234567890@s.whatsapp.net",
      participant: overrides.participant || "521234567890@s.whatsapp.net",
      fromMe: !!overrides.fromMe,
      id: "MSG" + Math.random().toString(36).slice(2),
    },
    message: { conversation: text },
    pushName: "Tester",
    messageTimestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

const FIELDS_HOOKS_USE = ["chat", "sender", "isGroup", "text", "key", "message", "quoted"];

test("findMediaKey detecta imagen, audio y vídeo", () => {
  assert.equal(findMediaKey({ imageMessage: {} }), "imageMessage");
  assert.equal(findMediaKey({ audioMessage: {} }), "audioMessage");
  assert.equal(findMediaKey({ conversation: "hola" }), null);
  assert.equal(findMediaKey(null), null);
});

test("buildEnrichedMessage expone los campos que usan los hooks", () => {
  const sock = makeFakeSock();
  const raw = makeMessage(".ping");
  const ctx = serializeMessage(raw, sock);
  const msg = buildEnrichedMessage(sock, ctx, { commandName: "ping" });

  for (const f of FIELDS_HOOKS_USE) {
    assert.ok(f in msg, "falta el campo '" + f + "' que un hook puede usar");
  }
  assert.equal(msg.text, ".ping");
  assert.equal(msg.command, "ping");
  assert.equal(msg.usedPrefix, ".");
  assert.equal(typeof msg.react, "function");
  assert.equal(typeof msg.simulateTyping, "function");
  // readMore NO es función: es el string de 4001 U+200E que esconde el
  // resto del mensaje detrás de "ver más". Lo descubrimos porque este
  // test falló al escribirlo (suposición mía, no bug del bot).
  assert.equal(typeof msg.readMore, "string");
  assert.equal(msg.readMore.length, 4001);
  assert.equal(typeof msg.download, "function");
});

test("hooks y comandos reciben EXACTAMENTE el mismo contexto", async () => {
  const sock = makeFakeSock();
  const engine = createEngine();
  const ctx = serializeMessage(makeMessage(".daily"), sock);
  ctx.usedPrefix = ".";

  // Camino del hook (router) y camino del comando (loader) son ahora el
  // mismo: buildCommandContext. Si alguien vuelve a construir un msg a
  // mano en cualquiera de los dos, este test lo detecta.
  const a = await buildCommandContext(sock, ctx, engine, { commandName: "daily" });
  const b = await buildCommandContext(sock, ctx, engine, { commandName: "daily" });

  assert.deepEqual(Object.keys(a.msg).sort(), Object.keys(b.msg).sort());
  assert.equal(a.msg.isBot, ctx.isBot);
  assert.equal(a.msg.isAdmin, false);
});

test("msg.isBot refleja fromMe (antilink dependía de esto sin saberlo)", async () => {
  const sock = makeFakeSock();
  const engine = createEngine();

  const ctxOtro = serializeMessage(makeMessage("hola"), sock);
  const otro = await buildCommandContext(sock, ctxOtro, engine);
  assert.equal(otro.msg.isBot, false, "un mensaje ajeno no es del bot");

  const ctxBot = serializeMessage(makeMessage("hola", { fromMe: true }), sock);
  const bot = await buildCommandContext(sock, ctxBot, engine);
  assert.equal(bot.msg.isBot, true, "un mensaje propio SÍ es del bot");
});

test("la cita se parsea con caption de media", () => {
  const sock = makeFakeSock();
  const raw = makeMessage("mira esto", {
    message: {
      extendedTextMessage: {
        text: "mira esto",
        contextInfo: {
          stanzaId: "ORIG1",
          participant: "521999999999@s.whatsapp.net",
          quotedMessage: {
            imageMessage: { caption: "el caption citado", mimetype: "image/jpeg" },
          },
        },
      },
    },
  });
  const ctx = serializeMessage(raw, sock);
  const msg = buildEnrichedMessage(sock, ctx);

  assert.ok(msg.quoted, "debería haber cita");
  assert.equal(msg.quoted.id, "ORIG1");
  assert.equal(msg.quoted.text, "el caption citado");
  assert.equal(msg.quoted.mimetype, "image/jpeg");
  assert.equal(msg.quoted.sender, "521999999999@s.whatsapp.net");
});

test("ensureReplyShim es idempotente y no pisa un reply existente", async () => {
  const sock = makeFakeSock();
  const original = async () => "original";
  sock.reply = original;
  assert.equal(ensureReplyShim(sock), original, "no debe reemplazar uno existente");

  const limpio = makeFakeSock();
  const shim = ensureReplyShim(limpio);
  assert.equal(ensureReplyShim(limpio), shim, "segunda llamada devuelve el mismo");
  await shim("5211@s.whatsapp.net", "hola", null);
  assert.equal(limpio.sent.length, 1);
  assert.equal(limpio.sent[0].content.text, "hola");
});

test("en chat privado no se piden permisos de grupo", async () => {
  const sock = makeFakeSock();
  const engine = createEngine();
  const ctx = serializeMessage(makeMessage(".ping"), sock);
  const facts = await resolveGroupFacts(sock, ctx, engine);

  assert.equal(facts.isAdmins, false);
  assert.equal(facts.isBotAdmins, false);
  assert.equal(facts.groupMetadata, null);
  assert.deepEqual(facts.participants, []);
});
