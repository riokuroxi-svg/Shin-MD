/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-lista.test.js — el menú con 👍 y la tarjeta de evento
//
//  Lo que se vigila aquí:
//    · que la lista pase por el protobuf de verdad (no que «parezca»
//      bien): se codifica, se decodifica y se miran los campos.
//    · que se respeten los límites de Meta (10 filas, 24/72 chars),
//      que son la causa número uno de que un menú «no salga».
//    · que el rowId sea el comando: el router no sabe de listas, lee el
//      texto y ejecuta; si el rowId no fuera un comando, pulsar no haría
//      nada.
//    · que la tarjeta de evento lleve la firma y las fechas en segundos.
// ═══════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";

import { armarLista, armarBytesLista, revisarLista, recortar, LIMITES } from "../src/lib/menu-kit/lista.js";
import { opcionesMenuPrincipal, opcionesMenuCategoria, emojiDeFila } from "../src/lib/menu-kit/menu-lista.js";
import { armarEvento, armarBytesEvento, aSegundos, FIRMA } from "../src/lib/menu-kit/evento.js";

// ── la lista pasa por el protobuf ──────────────────────────────────

test("la lista llega entera al otro lado (codifica y decodifica)", () => {
  const { bytes, decodificado } = armarBytesLista(opcionesMenuPrincipal({
    categorias: [
      { id: "main", titulo: "main", comandos: 12 },
      { id: "fun", titulo: "fun", comandos: 5 },
    ],
    texto: "Buenas Noches 🌙",
    pie: "Shin-MD v3.9.0",
  }));

  assert.ok(bytes.length > 100, "el mensaje salió vacío");
  const lm = decodificado.listMessage;
  assert.ok(lm, "no hay listMessage en el mensaje");
  assert.equal(lm.listType, 1, "listType tiene que ser SINGLE_SELECT (1)");
  assert.equal(lm.description, "Buenas Noches 🌙");
  assert.equal(lm.footerText, "Shin-MD v3.9.0");
  assert.equal(lm.sections.length, 1);
  assert.equal(lm.sections[0].rows.length, 2);
});

test("el rowId de cada fila es el comando que ejecuta el router", () => {
  const { decodificado } = armarBytesLista(opcionesMenuPrincipal({
    categorias: [{ id: "main", titulo: "main", comandos: 3 }],
  }));
  // exactamente lo que src/serialize.js va a entregar al router
  assert.equal(decodificado.listMessage.sections[0].rows[0].rowId, ".menu main");
});

test("dentro de una categoría, el rowId es el comando pelado", () => {
  const { decodificado } = armarBytesLista(opcionesMenuCategoria({
    categoria: { id: "tools", titulo: "tools" },
    comandos: [{ nombre: "ping", descripcion: "latencia" }],
  }));
  const filas = decodificado.listMessage.sections[0].rows;
  assert.equal(filas[0].rowId, ".ping");
  // y siempre hay una vuelta al menú, la última
  assert.equal(filas[filas.length - 1].rowId, ".menu");
});

test("el prefijo se respeta (no todo el mundo usa el punto)", () => {
  const { decodificado } = armarBytesLista(opcionesMenuPrincipal({
    categorias: [{ id: "main", titulo: "main", comandos: 1 }],
    prefijo: "!",
  }));
  assert.equal(decodificado.listMessage.sections[0].rows[0].rowId, "!menu main");
});

// ── límites de Meta ────────────────────────────────────────────────

test("no se pasan de 10 filas aunque haya 20 categorías", () => {
  const muchas = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, titulo: `t${i}`, comandos: 1 }));
  const { decodificado } = armarBytesLista(opcionesMenuPrincipal({ categorias: muchas }));
  assert.equal(decodificado.listMessage.sections[0].rows.length, LIMITES.filasTotales);
});

test("revisarLista avisa cuando sobran filas", () => {
  const contenido = armarLista({
    secciones: [{ titulo: "x", filas: Array.from({ length: 12 }, (_, i) => ({ titulo: `f${i}`, comando: `.c${i}` })) }],
  });
  const { filas, pasado } = revisarLista(contenido);
  assert.equal(filas, 12);
  assert.equal(pasado, true);
});

test("los títulos largos se recortan sin romper emojis", () => {
  const largo = "🏠 una categoría con un nombre larguísimo de verdad";
  const corto = recortar(largo, LIMITES.tituloFila);
  assert.ok([...corto].length <= LIMITES.tituloFila, "se pasó del límite");
  assert.ok(corto.endsWith("…"), "no se ve que esté recortado");
  assert.ok(corto.startsWith("🏠"), "partió el emoji por la mitad");
});

test("las descripciones también se recortan", () => {
  const { decodificado } = armarBytesLista({
    secciones: [{ titulo: "s", filas: [{ titulo: "t", descripcion: "d".repeat(200), comando: ".x" }] }],
  });
  const desc = decodificado.listMessage.sections[0].rows[0].description;
  assert.ok(desc.length <= LIMITES.descripcionFila, `${desc.length} caracteres, Meta admite ${LIMITES.descripcionFila}`);
});

// ── emojis por categoría ───────────────────────────────────────────

test("cada categoría lleva su emoji; la desconocida lleva el pulgar", () => {
  assert.equal(emojiDeFila("main"), "🏠");
  assert.equal(emojiDeFila("download"), "📥");
  assert.equal(emojiDeFila("categoria-que-no-existe"), "👍");
});

test("la fila del menú principal lleva el emoji delante del nombre", () => {
  const { decodificado } = armarBytesLista(opcionesMenuPrincipal({
    categorias: [{ id: "owner", titulo: "owner", comandos: 4 }],
  }));
  assert.match(decodificado.listMessage.sections[0].rows[0].title, /^👑 owner Menú$/);
});

// ── tarjeta de evento ──────────────────────────────────────────────

test("el evento lleva la firma dentro y fechas en segundos", () => {
  const { bytes, decodificado } = armarBytesEvento({
    nombre: "Buenas Noches 🌙",
    descripcion: "Finaliza hoy a la(s) 2:57 p.m.",
    fin: new Date("2026-11-27T20:57:00Z"),
  });
  const ev = decodificado.eventMessage;
  assert.ok(bytes.length > 40);
  assert.equal(ev.name, "Buenas Noches 🌙");
  assert.match(ev.description, /Creado por Roxi-svg/);
  // 2026-11-27T20:57:00Z = 1796158620 segundos
  assert.equal(Number(ev.endTime), Math.floor(Date.parse("2026-11-27T20:57:00Z") / 1000));
});

test("la firma no se duplica si ya venía escrita", () => {
  const ev = armarEvento({ nombre: "x", descripcion: "Creado por Roxi-svg" }).eventMessage;
  assert.equal(ev.description, `Creado por ${FIRMA}`);
});

test("milisegundos y segundos acaban en segundos", () => {
  assert.equal(aSegundos(1740000000000), 1740000000);
  assert.equal(aSegundos(1740000000), 1740000000);
});

test("un evento sin fechas se queda con una ventana de un día", () => {
  const ev = armarEvento({ nombre: "hoy" }).eventMessage;
  assert.equal(Number(ev.endTime) - Number(ev.startTime), 86400);
});
