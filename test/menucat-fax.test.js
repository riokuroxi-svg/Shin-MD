/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menucat-fax.test.js — .menucat (con etiqueta de evento) y .fax,
//  ejecutados de punta a punta por el router con un socket falso.
//  De paso se comprueba la palomita azul: solo en comandos.
// ═══════════════════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";

import { createRouter } from "#router";

let router;

before(async () => {
  router = createRouter(engineFalso());
  await router.init();
});

function engineFalso() {
  return {
    getStateName: () => "RUNNING",
    getUptime: () => 60000,
    getHealth: () => ({ getRiskScore: () => 25, getStatus: () => ({ score: 25, level: "safe", events: 0 }) }),
    getSendQueue: () => ({
      enqueue: (fn) => fn(),
      length: () => 0,
      isPaused: () => false,
      enterPriority: () => {},
      exitPriority: () => {},
      inPriority: () => false,
    }),
    setOwnerJid: () => {},
    getOwnerJid: () => "5215500000000@s.whatsapp.net",
    getSock: () => null,
    LIFECYCLE: { READY: 3 },
    emit: () => {},
    on: () => {},
    transit: () => {},
  };
}

function socketFalso() {
  const enviados = [];
  const relayed = [];
  const leidos = [];
  return {
    user: { id: "5215511111111:4@s.whatsapp.net" },
    enviados,
    relayed,
    leidos,
    async sendMessage(jid, content, opts) {
      enviados.push({ jid, content, opts });
      return { key: { id: "M" + enviados.length } };
    },
    async relayMessage(jid, message, opts) {
      relayed.push({ jid, message, opts });
      return opts?.messageId;
    },
    async readMessages(keys) {
      leidos.push(...keys);
    },
    waUploadToServer: () => Promise.resolve({}),
  };
}

let n = 0;
// Cada mensaje viene de un número distinto para no chocar con el cooldown.
function mensaje(texto) {
  n++;
  return {
    key: { remoteJid: "52155" + String(30000000 + n) + "@s.whatsapp.net", fromMe: false, id: "T" + n },
    message: { conversation: texto },
    pushName: "Prueba",
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

/** Todo el texto que el bot mandó (mensajes normales y tarjetas). */
function textoEnviado(sock) {
  return JSON.stringify([sock.enviados, sock.relayed]);
}

test(".menucat sin categoría: etiqueta de evento + lista de categorías", async () => {
  const sock = socketFalso();
  await router.handle(sock, mensaje(".menucat"));
  const evento = sock.relayed.find((r) => r.message?.eventMessage);
  assert.ok(evento, "debe mandar el eventMessage nativo");
  assert.ok(evento.message.eventMessage.name.length > 0);
  const score = evento.message.eventMessage.contextInfo?.forwardingScore;
  assert.ok(score === undefined || score === 1, "sin RICH_EXTRA=1 no va el 'reenviado muchas veces'");
  assert.match(textoEnviado(sock), /CATEGOR/);
});

test(".menucat con categoría: muestra sus comandos", async () => {
  const sock = socketFalso();
  await router.handle(sock, mensaje(".menucat economy"));
  const todo = textoEnviado(sock);
  assert.match(todo, /ECONOM/);
  assert.match(todo, /\.daily/, "debe listar comandos de economía");
});

test(".menucat con categoría que no existe: avisa y sugiere", async () => {
  const sock = socketFalso();
  await router.handle(sock, mensaje(".menucat zzzz"));
  assert.match(textoEnviado(sock), /no encontrada/);
});

test(".fax: responde con dato, frase y estado del bot", async () => {
  const sock = socketFalso();
  await router.handle(sock, mensaje(".fax"));
  const todo = textoEnviado(sock);
  assert.match(todo, /Dato random/);
  assert.match(todo, /Uptime/);
  assert.match(todo, /25%/, "usa el riesgo real del motor");
});

test("palomita azul: solo en comandos, nunca en charla normal", async () => {
  const sock = socketFalso();
  await router.handle(sock, mensaje("hola a todos"));
  assert.equal(sock.leidos.length, 0);
  await router.handle(sock, mensaje(".ping"));
  assert.equal(sock.leidos.length, 1);
});
