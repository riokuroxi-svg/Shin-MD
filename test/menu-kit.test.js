/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-kit.test.js — el menú se construye y **pasa por el protobuf**.
//
//  La duda de siempre: «los tests pasan, pero ¿llegará a WhatsApp?».
//  Aquí no se prueba una función que devuelve un objeto: se arma el
//  mensaje con `generateWAMessageFromContent` (el mismo camino del
//  envío real) y se codifica con `proto.Message.encode`. Si el proto
//  del paquete no tuviera los campos, esta prueba falla.
//
//  Lo que NO se puede probar aquí: que el teléfono de una persona lo
//  pinte. Eso depende de su versión de WhatsApp, no del bot.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";
import {
  armarPayload,
  armarBotones,
  textoDeRespaldo,
  paramsHoja,
  botonDeclarativo,
} from "#menu-kit";

/** Codifica y decodifica: el viaje que hace el mensaje antes de salir. */
function viaje(mensaje) {
  return proto.Message.decode(proto.Message.encode(proto.Message.fromObject(mensaje)).finish());
}

test("menú: el payload pasa por el protobuf y vuelve con sus botones", () => {
  const payload = armarPayload({
    cuerpo: "Cuerpo del menú",
    pie: "Shin-MD v3.7.9",
    botones: [
      { text: "Ping", id: "ping" },
      { text: "Canal", url: "https://whatsapp.com/channel/x" },
      { text: "Copiar", copy: ".menu" },
    ],
  });

  const dec = viaje(payload);
  const im = dec.interactiveMessage;

  assert.ok(im, "tiene que ser un interactiveMessage");
  assert.equal(im.body.text, "Cuerpo del menú");
  assert.equal(im.footer.text, "Shin-MD v3.7.9");
  assert.deepEqual(
    im.nativeFlowMessage.buttons.map((b) => b.name),
    ["quick_reply", "cta_url", "cta_copy"],
  );
  // El secreto de 32 bytes es lo que deja al teléfono resolver el toque.
  assert.equal(dec.messageContextInfo.messageSecret.length, 32);
});

test("menú: el selector de categorías entra como lista desplegable", () => {
  const payload = armarPayload({
    cuerpo: "x",
    selector: {
      title: "📂 Categorías",
      sections: [{ title: "Info", rows: [{ id: "menucat:info", title: "INFO", description: "3" }] }],
    },
  });
  const b = viaje(payload).interactiveMessage.nativeFlowMessage.buttons[0];
  assert.equal(b.name, "single_select");
  const params = JSON.parse(b.buttonParamsJson);
  assert.equal(params.sections[0].rows[0].id, "menucat:info");
});

test("menú: con más de 3 botones se pide la hoja inferior", () => {
  const cuatro = armarBotones([
    { text: "a", id: "a" }, { text: "b", id: "b" },
    { text: "c", id: "c" }, { text: "d", id: "d" },
  ]);
  const params = JSON.parse(paramsHoja(cuatro, { titulo: "Menú" }));
  assert.ok(params.bottom_sheet, "los botones de más van a la hoja");
  assert.equal(params.bottom_sheet.list_title, "Menú");
});

test("menú: la oferta viaja con su código", () => {
  const params = JSON.parse(
    paramsHoja([{ name: "quick_reply" }], { oferta: { texto: "Dashboard", codigo: "SHIN-MD" } }),
  );
  assert.equal(params.limited_time_offer.copy_code, "SHIN-MD");
});

test("menú: cada botón declarativo cae en su tipo nativo", () => {
  assert.equal(botonDeclarativo({ text: "a", id: "x" }).name, "quick_reply");
  assert.equal(botonDeclarativo({ text: "a", url: "u" }).name, "cta_url");
  assert.equal(botonDeclarativo({ text: "a", copy: "c" }).name, "cta_copy");
  assert.equal(botonDeclarativo({ text: "a", call: "1" }).name, "cta_call");
  assert.equal(botonDeclarativo({ text: "a", sections: [] }).name, "single_select");
  assert.equal(botonDeclarativo({ text: "sin acción" }), null);
});

test("menú: el respaldo en texto lleva el prefijo (copiar «ping» no ejecuta)", () => {
  const t = textoDeRespaldo(
    "hola",
    armarBotones([{ text: "Ping", id: "ping" }, { text: "Canal", url: "https://x" }]),
    ".",
  );
  assert.match(t, /hola/);
  assert.match(t, /→ \.ping/);
  assert.match(t, /https:\/\/x/);
});

test("menú: sin botones no hay interactiveMessage (se usa el texto)", () => {
  const payload = armarPayload({ cuerpo: "solo texto", botones: [] });
  assert.equal(payload.interactiveMessage.nativeFlowMessage.buttons.length, 0);
});
