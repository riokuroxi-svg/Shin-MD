/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  menu-card.test.js — La foto y los botones del menú.
//
//  POR QUÉ EXISTE
//  El menú se enviaba "bien" (sin error, el servidor acusaba recibo) y
//  en el teléfono salía SIN FOTO. La causa: los campos de la imagen se
//  pasaban sueltos al `Header` del proto (`url`, `mediaKey`, ...), que
//  los acepta al crear pero los TIRA al serializar. El mensaje decía
//  "tengo media" y no llevaba media.
//
//  Estas pruebas miran el mensaje YA SERIALIZADO, que es lo que ve el
//  servidor. Comprobar el objeto en memoria no habría detectado nada.
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateWAMessageContent } from "baileys";
import { LRUCache } from "lru-cache";

const RAIZ = path.resolve(import.meta.dirname, "..");

/** Una imagen de verdad, sacada del proyecto. */
function imagenDePrueba() {
  const dir = path.join(RAIZ, "assets", "menus");
  const archivo = fs.readdirSync(dir).find((f) => /\.(jpe?g|png|webp)$/i.test(f));
  assert.ok(archivo, "el proyecto tiene que traer al menos una imagen de menú");
  return path.join(dir, archivo);
}

/** El socket mínimo: sube y cuenta. */
function socketFalso() {
  let subidas = 0;
  const sock = {
    mediaCache: new LRUCache({ max: 10, ttl: 60_000 }),
    waUploadToServer: async () => {
      subidas += 1;
      return { mediaUrl: "https://mmg.whatsapp.net/v/t62/prueba", directPath: "/v/t62/prueba" };
    },
  };
  return { sock, subidas: () => subidas };
}

const SELECTOR = {
  title: "📂 Explorar Categorías",
  sections: [
    { title: "Principal", rows: [{ title: "Ping", description: "Prueba", id: ".ping" }] },
  ],
};

test("la foto llega al mensaje serializado (el bug de la tarjeta sin foto)", async () => {
  const { sock } = socketFalso();
  const contenido = await generateWAMessageContent(
    {
      image: { url: imagenDePrueba() },
      caption: "cuerpo",
      footer: "pie",
      nativeFlow: [{ text: SELECTOR.title, sections: SELECTOR.sections }],
    },
    { upload: sock.waUploadToServer },
  );

  // Lo que de verdad viaja: el JSON que codifica el servidor.
  const json = JSON.parse(JSON.stringify(contenido));
  const header = json.interactiveMessage.header;

  assert.equal(header.hasMediaAttachment, true, "la cabecera dice que lleva media");
  assert.ok(header.imageMessage, "y la media está DENTRO de imageMessage");

  // Los campos sin los cuales el teléfono no puede pintarla.
  assert.match(header.imageMessage.url, /^https?:\/\//, "url de descarga");
  assert.ok(header.imageMessage.mediaKey, "mediaKey para descifrar");
  assert.ok(Number(header.imageMessage.fileLength) > 0, "tamaño real");
  assert.ok(header.imageMessage.width > 0 && header.imageMessage.height > 0, "medidas");

  // Y NO van sueltos en el header (esos se tiran al serializar).
  assert.equal(header.mimetype, undefined, "mimetype suelto en el header = se pierde");
  assert.equal(header.url, undefined, "url suelta en el header = se pierde");

  const cover = path.join(RAIZ, "assets", "menus", "shin-neon.jpg");
  const stat = fs.statSync(cover);
  assert.ok(stat.size > 10_000 && stat.size < 600_000, "portada JPEG ligera para WhatsApp");
  assert.deepEqual([...fs.readFileSync(cover).subarray(0, 3)], [0xff, 0xd8, 0xff]);

  const menu = fs.readFileSync(path.join(RAIZ, "cmds", "main", "menu.js"), "utf8");
  const shared = fs.readFileSync(path.join(RAIZ, "src", "lib", "menu-shared.js"), "utf8");
  const style = fs.readFileSync(path.join(RAIZ, "cmds", "owner", "setmenu.js"), "utf8");
  assert.match(menu, /MENU_MEDIA \|\| "image"/);
  assert.match(menu, /medioPedido === "video"/);
  assert.match(menu, /title: "反魂 · Shin-MD"/);
  assert.match(menu, /Explorar categorías/);
  assert.match(shared, /shin-neon\.jpg/);
  assert.match(style, /PORTADA NEÓN \+ CATEGORÍAS/);
  assert.match(style, /v1 \| v2 \| v3 \| v4 \| v5/);
});

test("la misma imagen se sube una sola vez (caché de medios)", async () => {
  const { sock, subidas } = socketFalso();
  const pedir = () =>
    generateWAMessageContent(
      {
        image: { url: imagenDePrueba() },
        caption: "cuerpo",
        nativeFlow: [{ text: SELECTOR.title, sections: SELECTOR.sections }],
      },
      { upload: sock.waUploadToServer, mediaCache: sock.mediaCache },
    );

  await pedir();
  await pedir();
  await pedir();

  assert.equal(subidas(), 1, "la segunda y la tercera tienen que reaprovechar la subida");
});

test("los botones del menú son todos del mismo tipo", async () => {
  // La librería avisa de que mezclar `single_select` con `quick_reply`
  // hace que el cliente no sepa qué dibujar y pinte la tarjeta como no
  // soportada. Por eso el menú lleva todo dentro del selector.
  const { sock } = socketFalso();
  const contenido = await generateWAMessageContent(
    {
      image: { url: imagenDePrueba() },
      caption: "cuerpo",
      nativeFlow: [
        { text: SELECTOR.title, sections: [...SELECTOR.sections, { title: "Extras", rows: [{ id: ".x", title: "X" }] }] },
      ],
    },
    { upload: sock.waUploadToServer },
  );
  const botones = contenido.interactiveMessage.nativeFlowMessage.buttons;
  assert.ok(botones.length >= 1);
  const tipos = new Set(botones.map((b) => b.name));
  assert.equal(tipos.size, 1, `no se pueden mezclar tipos: ${[...tipos].join(", ")}`);
  assert.equal([...tipos][0], "single_select");
});

test("la tarjeta de oferta y la hoja inferior se arman si se piden", async () => {
  const { sock } = socketFalso();
  const contenido = await generateWAMessageContent(
    {
      image: { url: imagenDePrueba() },
      caption: "cuerpo",
      optionTitle: "Shin-MD",
      optionText: "Abrir opciones",
      offerText: "Panel",
      offerCode: ".menu",
      nativeFlow: [{ text: SELECTOR.title, sections: SELECTOR.sections }],
    },
    { upload: sock.waUploadToServer },
  );
  const params = JSON.parse(
    contenido.interactiveMessage.nativeFlowMessage.messageParamsJson || "{}",
  );
  assert.equal(params.limited_time_offer?.text, "Panel", "tarjeta de oferta");
  assert.equal(params.limited_time_offer?.copy_code, ".menu", "código que se copia");
  assert.equal(params.bottom_sheet?.button_title, "Abrir opciones", "botón de la hoja");
});

test("no se manda ningún nodo biz propio (la librería arma el sobre)", async () => {
  // Dos <biz> en un mismo stanza hacen que el servidor lo rechace en
  // silencio. El envío del menú no aporta ninguno: lo pone la librería.
  const fuente = fs.readFileSync(path.join(RAIZ, "src", "lib", "menu-card.js"), "utf8");
  const envio = fuente.slice(fuente.indexOf("export async function sendMenuCard"));
  assert.match(envio, /relayMessage\(jid, msg\.message, \{ messageId: msg\.key\.id \}\)/,
    "el envío va sin additionalNodes");
  assert.doesNotMatch(envio, /tag:\s*["']biz["']/, "menu-card no arma nodos biz a mano");
});

test("la media se prepara con sus datos y se anida en el header", async () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "src", "lib", "menu-card.js"), "utf8");
  // El header recibe la media EN SU CASILLA. Pasarla suelta (los campos
  // url/mediaKey en el propio header) hace que el proto la tire.
  assert.match(fuente, /imageMessage: mediaMessage|videoMessage: mediaMessage/,
    "la media va anidada en imageMessage/videoMessage");
  // Al vídeo hay que darle duración y medidas o el teléfono lo pinta
  // como archivo descargable.
  assert.match(fuente, /datosDelVideo/, "la duración y las medidas se leen del MP4");
  assert.match(fuente, /seconds:/, "seconds va en el vídeo");
  assert.match(fuente, /jpegThumbnail/, "y una miniatura para la carátula");
});
