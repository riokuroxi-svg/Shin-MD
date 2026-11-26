/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El diagnóstico y el álbum, con un socket de mentira que apunta TODO lo
// que se le manda. Así se comprueba la forma real de los mensajes, que es
// justo lo que decide si un cliente los pinta o pone «no compatible».
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

/** Socket falso: guarda cada envío y cada relay. */
function socketFalso() {
  const enviados = [];
  const relevados = [];
  return {
    enviados,
    relevados,
    user: { id: "5215500000000:1@s.whatsapp.net" },
    // Baileys sube el medio antes de armar el mensaje: sin esto el álbum
    // no se puede ni construir y la prueba 4 no mediría nada.
    waUploadToServer: async () => ({ url: "https://mmg.whatsapp.net/falso", directPath: "/falso" }),
    sendMessage: async (jid, contenido) => {
      enviados.push({ jid, contenido });
      return { key: { id: `msg-${enviados.length}` } };
    },
    relayMessage: async (jid, mensaje, opciones) => {
      relevados.push({ jid, mensaje, opciones });
      return `msg-relay-${relevados.length}`;
    },
    reply: async (jid, texto) => {
      enviados.push({ jid, contenido: { text: texto } });
      return { key: { id: `msg-${enviados.length}` } };
    },
  };
}

// Un mensaje con la forma que Baileys espera de verdad: sin key ni
// message, generateWAMessageFromContent se cae al citar.
const msgFalso = (chat = "5215574370309@s.whatsapp.net") => ({
  chat,
  key: { remoteJid: chat, fromMe: false, id: "COMPATTEST01" },
  message: { conversation: "hola" },
  messageTimestamp: Math.floor(Date.now() / 1000),
});

test(".compat manda las cuatro pruebas numeradas y en orden", async () => {
  const { default: compat } = await import(path.join(RAIZ, "cmds", "owner", "compat.js"));
  const sock = socketFalso();
  await compat.run({ msg: msgFalso(), sock });

  // Dos entradas por relay (una por tarjeta) + textos + álbum.
  const todo = JSON.stringify([...sock.enviados, ...sock.relevados]);
  assert.match(todo, /PRUEBA 1\/4/);
  assert.match(todo, /PRUEBA 2\/4/);
  assert.match(todo, /PRUEBA 3\/4/);
  assert.match(todo, /PRUEBA 4\/4/);

  // La tarjeta 2 no lleva adornos y la 3 sí: es la única diferencia y por
  // eso sirven para separar «botones» de «hoja inferior».
  const tarjetas = sock.relevados
    .map((r) => r.mensaje?.interactiveMessage?.nativeFlowMessage)
    .filter(Boolean);
  assert.equal(tarjetas.length, 2, "tienen que salir dos tarjetas");
  assert.equal(tarjetas[0].messageParamsJson, undefined, "la 2 va limpia");
  assert.ok(tarjetas[1].messageParamsJson, "la 3 lleva la hoja inferior");
  assert.match(tarjetas[1].messageParamsJson, /bottom_sheet/);

  // Y al final, el resumen con el significado de cada número.
  const resumen = sock.enviados.at(-1).contenido.text;
  assert.match(resumen, /Resultado del envío/);
  assert.match(resumen, /no compatible con tu versión/);
});

test(".compat se niega en un grupo: no llena el chat de pruebas", async () => {
  const { default: compat } = await import(path.join(RAIZ, "cmds", "owner", "compat.js"));
  const sock = socketFalso();
  await compat.run({ msg: msgFalso("120363411324152808@g.us"), sock });

  assert.equal(sock.enviados.length, 1, "un solo aviso");
  assert.equal(sock.relevados.length, 0, "ni una tarjeta");
  assert.match(sock.enviados[0].contenido.text, /por privado/i);
});

test("las tarjetas de .compat llevan el nodo biz y el de bot en privado", async () => {
  const { default: compat } = await import(path.join(RAIZ, "cmds", "owner", "compat.js"));
  const sock = socketFalso();
  await compat.run({ msg: msgFalso(), sock });

  const tarjetas = sock.relevados.filter((r) => r.mensaje?.interactiveMessage);
  assert.ok(tarjetas.length >= 2, "tienen que salir las dos tarjetas");
  for (const relay of tarjetas) {
    const tags = (relay.opciones?.additionalNodes || []).map((n) => n.tag);
    assert.ok(tags.includes("biz"), `falta el nodo biz: ${tags.join(",")}`);
    assert.ok(tags.includes("bot"), "en privado falta el nodo bot (botones grises)");
    const biz = relay.opciones.additionalNodes.find((n) => n.tag === "biz");
    const interno = biz.content.map((c) => c.tag);
    assert.ok(interno.includes("interactive"), "el biz tiene que envolver interactive");
  }
});

test(".imagen manda las fotos sueltas salvo que se pida álbum", async () => {
  const { usaAlbum } = await import(path.join(RAIZ, "cmds", "downloads", "imagen.js"));

  // Por defecto, NO: cada foto va suelta y se ve en cualquier WhatsApp.
  assert.equal(usaAlbum({}), false, "sin la variable no se usa álbum");
  assert.equal(usaAlbum({ SHIN_ALBUM: "0" }), false);
  assert.equal(usaAlbum({ SHIN_ALBUM: "sí" }), false, "solo el 1 exacto lo enciende");
  assert.equal(usaAlbum({ SHIN_ALBUM: "1" }), true, "con 1 sí");
});
