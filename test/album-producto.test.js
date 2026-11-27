/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  album-producto.test.js — álbum y tarjeta de producto sobre el proto.
//
//  Igual que el resto: no se prueba «mi función devuelve esto», se prueba
//  que el mensaje **se codifica con el protobuf real** y vuelve intacto.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarAlbum } from "#menu-kit/album";
import { armarProducto, armarRich, armarBytes, texto } from "#menu-kit/rich";
import { proto } from "baileys";

test("álbum: el envoltorio dice cuántas piezas vienen", () => {
  const { decodificado } = armarAlbum(3, 1);
  const a = decodificado.albumMessage;
  assert.ok(a, "tiene que ser albumMessage");
  assert.equal(a.expectedImageCount, 3);
  assert.equal(a.expectedVideoCount, 1);
});

test("producto: la ficha lleva precio y moneda (los botones van aparte)", () => {
  const contenido = armarProducto({
    titulo: "Shin-MD Premium",
    descripcion: "Acceso al panel",
    precio: 50,
    moneda: "MXN",
  });
  // El protobuf de ProductMessage se prueba sobre el payload ya armado.
  const mensaje = proto.Message.fromObject({
    productMessage: proto.Message.ProductMessage.fromObject({
      product: { ...contenido.product, productImage: undefined },
      businessOwnerJid: "5210000000000@s.whatsapp.net",
      body: contenido.caption,
    }),
  });
  const dec = proto.Message.decode(proto.Message.encode(mensaje).finish());
  const p = dec.productMessage.product;
  assert.equal(p.title, "Shin-MD Premium");
  assert.equal(p.currencyCode, "MXN");
  assert.equal(Number(p.priceAmount1000), 50000, "el precio se guarda ×1000");
  // ProductMessage no admite botones en el proto: si se cuelan, se pierden.
  assert.equal(p.buttons, undefined);
});

test("rich: el sello del canal viaja en el contexto", () => {
  const contenido = armarRich([texto("hola")], {
    sello: { jid: "120363000000000000@newsletter", nombre: "Shin-MD" },
  });
  const ctx = contenido.botForwardedMessage.message.richResponseMessage.contextInfo;
  assert.equal(ctx.forwardOrigin, 4, "4 = META_AI en el enum");
  assert.equal(ctx.forwardedNewsletterMessageInfo.newsletterName, "Shin-MD");
  assert.equal(ctx.forwardedNewsletterMessageInfo.newsletterJid, "120363000000000000@newsletter");
});

test("rich: sin sello no se inventa el bloque del canal", () => {
  const contenido = armarRich([texto("hola")]);
  const ctx = contenido.botForwardedMessage.message.richResponseMessage.contextInfo;
  assert.equal(ctx.forwardedNewsletterMessageInfo, undefined);
  assert.equal(ctx.forwardOrigin, 4);
});

test("rich: el sello sobrevive al protobuf dentro de la tarjeta", () => {
  const { decodificado } = armarBytes([texto("hola")]);
  const ctx = decodificado.botForwardedMessage.message.richResponseMessage.contextInfo;
  assert.equal(Number(ctx.forwardOrigin), 4, "4 = META_AI");
  assert.equal(ctx.isForwarded, true);
});
