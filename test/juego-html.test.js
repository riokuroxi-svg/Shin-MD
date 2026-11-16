/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { proto } from "baileys";
import { crearContenidoJuego, enviarJuegoHtml, MAX_HTML_BYTES } from "#lib/juego-html";
import snake from "../cmds/fun/snake.js";

function respuesta(contenido) {
  const data = contenido.botForwardedMessage.message.richResponseMessage.unifiedResponse.data;
  return JSON.parse((typeof data === "string" ? Buffer.from(data, "base64") : Buffer.from(data)).toString("utf8"));
}

test("el sobre HTML lleva identificador único y ninguna clave fija de grupo", () => {
  const a = crearContenidoJuego("<p>prueba</p>");
  const b = crearContenidoJuego("<p>prueba</p>");
  const datos = respuesta(proto.Message.fromObject(a));
  assert.equal(datos.sections[0].view_model.primitive.payload, "<p>prueba</p>");
  assert.deepEqual(datos.sections[0].view_model.primitive.trusted_sources, []);
  assert.equal(datos.response_id, a.messageContextInfo.botMetadata.botResponseId);
  assert.notEqual(datos.response_id, respuesta(proto.Message.fromObject(b)).response_id);
  assert.equal(a.senderKeyDistributionMessage, undefined);
});

test("el transporte rechaza HTML vacío y excesivo", () => {
  assert.throws(() => crearContenidoJuego(""), /vacío/);
  assert.throws(() => crearContenidoJuego("x".repeat(MAX_HTML_BYTES + 1)), /límite/);
});

test("el proto conserva el contenido y los metadatos", () => {
  const mensaje = proto.Message.fromObject(crearContenidoJuego("<p>hola</p>"));
  const decoded = proto.Message.decode(proto.Message.encode(mensaje).finish());
  assert.equal(respuesta(decoded).sections[0].view_model.primitive.payload, "<p>hola</p>");
  assert.equal(decoded.messageContextInfo.messageSecret.length, 32);
});

test("el comando de Shin envía un solo relay al chat y no manda enlaces", async () => {
  const llamadas = [];
  const sock = { user: { id: "15550000000@s.whatsapp.net" }, relayMessage: async (...args) => llamadas.push(args) };
  assert.equal(await snake.handler(sock, { chatId: "123456@g.us" }), null);
  assert.equal(llamadas.length, 1);
  const [jid, contenido, opts] = llamadas[0];
  assert.equal(jid, "123456@g.us");
  assert.ok(opts.messageId);
  assert.match(respuesta(contenido).sections[0].view_model.primitive.payload, /<canvas/);
  assert.ok(contenido.senderKeyDistributionMessage == null);
});

test("un relay fallido no genera reenvíos ni documentos", async () => {
  let relays = 0, envios = 0;
  const sock = {
    user: { id: "15550000000@s.whatsapp.net" },
    relayMessage: async () => { relays++; throw new Error("sin conexión"); },
    sendMessage: async () => { envios++; },
  };
  await assert.rejects(() => snake.handler(sock, { chatId: "123456@g.us" }), /sin conexión/);
  assert.equal(relays, 1); assert.equal(envios, 0);
  await assert.rejects(() => enviarJuegoHtml({}, "chat", "hola"), /sesión/);
});

test("Snake espera a Jugar y termina al chocar contra el borde", async () => {
  const html = await readFile(new URL("../src/lib/juegos/snake.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script); assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  const listeners = {};
  const elementos = Object.fromEntries(["c", "inicio", "score", "over", "final"].map((id) => [id, {
    style: {}, textContent: "", addEventListener: (tipo, cb) => { listeners[`${id}:${tipo}`] = cb; },
  }]));
  elementos.c.getContext = () => ({ fillRect() {}, set fillStyle(_v) {} });
  let intervalos = 0, tick;
  const document = {
    getElementById: (id) => elementos[id], querySelectorAll: () => [],
    addEventListener: (tipo, cb) => { listeners[`document:${tipo}`] = cb; },
  };
  const math = Object.create(Math); math.random = () => 0;
  vm.runInNewContext(script, { document, Math: math, clearInterval() {}, setInterval(cb) { tick = cb; intervalos++; return 1; } });
  assert.equal(intervalos, 0);
  listeners["document:keydown"]({ key: "ArrowUp", preventDefault() {} });
  listeners["inicio:click"]();
  assert.equal(intervalos, 1); assert.equal(elementos.score.textContent, "Puntos: 0");
  for (let i = 0; i < 8; i++) tick();
  assert.match(elementos.final.textContent, /Fin de la partida/);
  assert.equal(elementos.over.style.display, "block");
});
