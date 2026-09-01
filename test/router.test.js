import { test } from "node:test";
import assert from "node:assert/strict";

import { createEngine } from "#engine";
import { serializeMessage } from "#serialize";
import { createRouter } from "#router";

function makeFakeSock() {
  const sent = [];
  return {
    user: { id: "521234567890:4@s.whatsapp.net", name: "Shin" },
    sent,
    async sendMessage(jid, content, opts) {
      sent.push({ jid, content, opts });
      return { key: { id: "FAKE" + sent.length } };
    },
  };
}

function makeMessage(text, overrides) {
  return {
    key: {
      remoteJid: overrides?.remoteJid || "521234567890@s.whatsapp.net",
      participant: overrides?.participant || "521234567890@s.whatsapp.net",
      fromMe: overrides?.fromMe || false,
      id: "MSG" + Math.random().toString(36).slice(2),
    },
    message: { conversation: text },
    pushName: "Owner",
    messageTimestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

test("serializeMessage extrae texto y args", () => {
  const sock = makeFakeSock();
  const ctx = serializeMessage(makeMessage(".ping hola mundo"), sock);
  assert.equal(ctx.text, ".ping hola mundo");
  assert.equal(ctx.args.join(" "), "hola mundo");
  assert.equal(ctx.arg, "hola mundo");
  assert.equal(ctx.isGroup, false);
});

test("serializeMessage detecta grupos", () => {
  const sock = makeFakeSock();
  const ctx = serializeMessage(makeMessage(".ping", { remoteJid: "1203630442@g.us" }), sock);
  assert.equal(ctx.isGroup, true);
});

test("router ignora mensajes sin prefijo y no propios", async () => {
  const engine = createEngine();
  const router = await (async () => { const r = createRouter(engine); await r.init(); return r; })();
  const sock = makeFakeSock();

  await router.handle(sock, makeMessage("hola que tal"));
  assert.equal(sock.sent.length, 0, "no debe responder sin prefijo");

  const fakeMsg = makeMessage(".ping", { fromMe: true });
  fakeMsg.key.fromMe = true;
  await router.handle(sock, fakeMsg);
  assert.equal(sock.sent.length, 0, "no debe responder a sus propios mensajes");
});

test("router ejecuta .ping y envía respuesta", async () => {
  const engine = createEngine();
  const router = await (async () => { const r = createRouter(engine); await r.init(); return r; })();
  const sock = makeFakeSock();

  await router.handle(sock, makeMessage(".ping"));
  assert.equal(sock.sent.length, 1, "debe enviar respuesta");
  assert.ok(sock.sent[0].content.text.includes("Pong"), "respuesta contiene Pong");
});

test("router cooldown bloquea repetición inmediata", async () => {
  const engine = createEngine();
  const router = await (async () => { const r = createRouter(engine); await r.init(); return r; })();
  const sock = makeFakeSock();

  await router.handle(sock, makeMessage(".ping"));
  assert.equal(sock.sent.length, 1);
  await router.handle(sock, makeMessage(".ping"));
  assert.equal(sock.sent.length, 1, "cooldown debe bloquear el segundo");
});

test("router carga .menu con formato", async () => {
  const engine = createEngine();
  engine.setOwnerJid("521234567890@s.whatsapp.net");
  const router = await (async () => { const r = createRouter(engine); await r.init(); return r; })();
  const sock = makeFakeSock();

  await router.handle(sock, makeMessage(".menu"));
  assert.equal(sock.sent.length, 1, "menu debe enviar");
  const text = sock.sent[0].content.text;
  assert.ok(text.includes("SHIN-MD"), "menu contiene nombre");
  assert.ok(text.includes("ping"), "menu lista comandos");
});
