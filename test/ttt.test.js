import { test } from "node:test";
import assert from "node:assert/strict";

import ttt from "../cmds/ttt.js";

function fakeSock() {
  const sent = [];
  return {
    user: { id: "521234567890:4@s.whatsapp.net" },
    sent,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: "FAKE" + sent.length } };
    },
    async relayMessage() {
      sent.push({ jid: arguments[0], content: { relayed: true }, opts: arguments[2] });
      return { key: { id: "RELAY" + sent.length } };
    },
    waUploadToServer: () => Promise.resolve({}),
  };
}

function ctx(text) {
  const parts = text.trim().split(/\s+/);
  return {
    chatId: "521234567890@s.whatsapp.net",
    senderId: "521234567890@s.whatsapp.net",
    isGroup: false,
    text,
    arg: parts.slice(1).join(" "),
    args: parts.slice(1),
    type: "conversation",
    full: { key: { id: "ORIG" }, message: { conversation: text } },
  };
}

function engineStub() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getRiskScore: () => 0 }),
    getSendQueue: () => ({ enqueue: fn => fn(), length: () => 0, isPaused: () => false }),
  };
}

test("ttt inicia partida y envía tablero con botones", async () => {
  const sock = fakeSock();
  const res = await ttt.handler(sock, ctx(".ttt"), engineStub(), null);
  assert.equal(res, null, "usa interactive, no texto");
  // sendInteractive usa relayMessage (o sendMessage si falla)
  assert.ok(sock.sent.length >= 1, "debe enviar algo");
});

test("ttt acepta movimiento y el bot responde", async () => {
  const sock = fakeSock();
  // iniciar
  await ttt.handler(sock, ctx(".ttt"), engineStub(), null);
  // mover a1
  const res = await ttt.handler(sock, ctx(".ttt a1"), engineStub(), null);
  // El handler devuelve null (usa interactive) o texto de victoria
  assert.ok(typeof res === "string" || res === null);
});

test("ttt rechaza movimiento inválido", async () => {
  const sock = fakeSock();
  await ttt.handler(sock, ctx(".ttt"), engineStub(), null);
  const res = await ttt.handler(sock, ctx(".ttt z9"), engineStub(), null);
  assert.ok(typeof res === "string" && res.includes("inválido"), "debe rechazar z9");
});

test("ttt sin partida activa pide iniciar", async () => {
  // ChatId limpio (nunca usado) → mover sin partida pide iniciar
  const sock = fakeSock();
  const fresh = {
    ...ctx(".ttt a1"),
    chatId: "99900000001@s.whatsapp.net",
    senderId: "99900000001@s.whatsapp.net",
  };
  const res = await ttt.handler(sock, fresh, engineStub(), null);
  assert.ok(typeof res === "string" && res.toLowerCase().includes("partida"),
    "debe pedir iniciar partida, recibió: " + String(res).slice(0, 60));
});
