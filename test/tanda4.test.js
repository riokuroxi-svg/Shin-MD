/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tanda4.test.js — Cuarta excavación
//
//  La familia completa de botones nativos (ocho tipos que el bot no
//  usaba) y las acciones del sistema: fijar, guardar, llamada
//  programada, ubicación en vivo, pago con fondo, pedido y factura.
//  Todo se comprueba igual que siempre: se arma y se pasa por el
//  protobuf real de baileys, ida y vuelta.
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";

import {
  CTA, MAX_BOTONES, MAX_VISIBLES,
  botonRapido, botonUrl, botonCopiar, botonLlamar, botonRecordatorio,
  botonCancelarRecordatorio, botonUbicacion, botonDireccion, botonWebview, botonLista,
  buildCtaContent, renderCtaTexto, sendCta,
} from "#lib/cta-buttons";

import {
  FIJAR, GUARDAR, LLAMADA, DURACION_FIJADO, hexAArgb,
  buildPin, buildKeep, buildLlamadaProgramada, buildUbicacionViva,
  buildSolicitudPago, buildPedido, buildFactura,
  etiquetar, unaEscucha, conCaducidad, sendNative,
} from "#lib/native-actions";

function socketFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: "1@s.whatsapp.net" },
    async relayMessage(jid, message, opts) { enviados.push({ jid, message, opts }); return opts?.messageId; },
  };
}

function roundTrip(contenido) {
  const codificado = proto.Message.encode(proto.Message.fromObject(contenido)).finish();
  return proto.Message.decode(codificado);
}

const params = (boton) => JSON.parse(boton.buttonParamsJson);

// ── 1. Los ocho botones que el bot no usaba ────────────────────────

test("cada botón nativo lleva su nombre y sus parámetros obligatorios", () => {
  assert.equal(params(botonUrl({ texto: "Abrir", url: "https://x.com" })).url, "https://x.com");
  assert.equal(params(botonCopiar({ texto: "Copiar", codigo: "SHIN-2026" })).copy_code, "SHIN-2026");
  assert.equal(params(botonLlamar({ texto: "Llamar", telefono: "+52550000" })).phone_number, "+52550000");
  assert.equal(botonRecordatorio().name, CTA.RECORDAR);
  assert.equal(botonCancelarRecordatorio().name, CTA.NO_RECORDAR);
  assert.equal(botonUbicacion().name, CTA.UBICACION);
  assert.equal(botonDireccion().name, CTA.DIRECCION);
  assert.equal(params(botonWebview({ titulo: "Mini app", url: "https://x.com" })).link.in_app_webview, true);
});

test("un botón sin lo imprescindible no se construye a medias", () => {
  assert.throws(() => botonUrl({ texto: "Abrir" }), /url/);
  assert.throws(() => botonUrl({ url: "https://x.com" }), /texto/);
  assert.throws(() => botonCopiar({ texto: "Copiar" }), /código/);
  assert.throws(() => botonLlamar({ texto: "Llamar" }), /teléfono/);
  assert.throws(() => botonWebview({ titulo: "x" }), /url/);
  assert.throws(() => botonLista({ titulo: "Menú", secciones: [] }), /sección/);
});

test("buttonParamsJson viaja como CADENA, que es lo que rompe a todos", () => {
  const b = botonUrl({ texto: "Abrir", url: "https://x.com" });
  assert.equal(typeof b.buttonParamsJson, "string");
  const vuelta = roundTrip(buildCtaContent({ texto: "hola", botones: [b] }));
  const guardado = vuelta.interactiveMessage.nativeFlowMessage.buttons[0];
  assert.equal(guardado.name, "cta_url");
  assert.equal(JSON.parse(guardado.buttonParamsJson).url, "https://x.com");
});

test("la lista admite varias secciones: el menú anidado sin segundo mensaje", () => {
  const b = botonLista({
    titulo: "Menú",
    secciones: [
      { titulo: "Música", filas: [{ titulo: "play", descripcion: "baja canciones", id: ".play" }] },
      { titulo: "Juegos", etiqueta: "nuevo", filas: [{ titulo: "trivia", id: ".trivia" }] },
    ],
  });
  const p = params(b);
  assert.equal(p.sections.length, 2);
  assert.equal(p.sections[1].highlight_label, "nuevo");
  assert.equal(p.sections[0].rows[0].id, ".play");
});

test("pasados los tres botones aparece sola la hoja inferior", () => {
  const botones = [
    botonRapido({ texto: "A", id: "a" }), botonRapido({ texto: "B", id: "b" }),
    botonRapido({ texto: "C", id: "c" }), botonRapido({ texto: "D", id: "d" }),
  ];
  const flow = buildCtaContent({ texto: "elige", botones }).interactiveMessage.nativeFlowMessage;
  const p = JSON.parse(flow.messageParamsJson);
  assert.equal(p.has_multiple_buttons, true);
  assert.equal(p.bottom_sheet.in_thread_buttons_limit, MAX_VISIBLES);

  const tres = buildCtaContent({ texto: "elige", botones: botones.slice(0, 3) });
  assert.equal(tres.interactiveMessage.nativeFlowMessage.messageParamsJson, undefined,
    "con tres o menos no hace falta hoja");
});

test("la tarjeta se niega a salir vacía o pasada de botones", () => {
  assert.throws(() => buildCtaContent({ texto: "x", botones: [] }), /botones/);
  assert.throws(() => buildCtaContent({ botones: [botonUbicacion()] }), /texto/);
  const muchos = Array.from({ length: MAX_BOTONES + 1 }, (_, i) => botonRapido({ texto: `B${i}`, id: `${i}` }));
  assert.throws(() => buildCtaContent({ texto: "x", botones: muchos }), new RegExp(String(MAX_BOTONES)));
});

test("el respaldo en texto explica los botones que el cliente no dibuje", () => {
  const salida = renderCtaTexto({
    texto: "Tu descarga está lista",
    botones: [
      botonUrl({ texto: "Abrir", url: "https://x.com" }),
      botonCopiar({ texto: "Copiar código", codigo: "SHIN-2026" }),
      botonLista({ titulo: "Menú", secciones: [{ titulo: "s", filas: [{ titulo: "trivia", id: "t" }] }] }),
    ],
  });
  assert.match(salida, /Tu descarga está lista/);
  assert.match(salida, /› Abrir — https:\/\/x\.com/);
  assert.match(salida, /› Copiar código — SHIN-2026/);
  assert.match(salida, /› trivia/);
});

test("sendCta manda por relay y no revienta si el socket falla", async () => {
  const sock = socketFalso();
  const r = await sendCta(sock, "1@g.us", { texto: "hola", botones: [botonUbicacion()] });
  assert.equal(r.sent, true);
  assert.equal(sock.enviados.length, 1);
  assert.equal(sock.enviados[0].message.interactiveMessage.nativeFlowMessage.buttons[0].name, CTA.UBICACION);

  const malo = await sendCta({}, "1@g.us", { texto: "hola", botones: [] });
  assert.equal(malo.sent, false);
  assert.ok(malo.error);
});

// ── 2. Acciones del sistema ────────────────────────────────────────

test("fijar y desfijar un mensaje para todo el grupo", () => {
  const fijado = roundTrip(buildPin({ id: "M1", remoteJid: "1@g.us", fromMe: true }));
  assert.equal(fijado.pinInChatMessage.type, FIJAR.FIJAR);
  assert.equal(fijado.pinInChatMessage.key.id, "M1");

  const quitado = buildPin({ id: "M1" }, { quitar: true });
  assert.equal(quitado.pinInChatMessage.type, FIJAR.QUITAR);
  assert.throws(() => buildPin({}), /clave/);
  assert.equal(DURACION_FIJADO.SEMANA, 604800);
});

test("guardar un mensaje temporal para que no se borre", () => {
  const g = roundTrip(buildKeep({ id: "M1" }));
  assert.equal(g.keepInChatMessage.keepType, GUARDAR.GUARDAR);
  assert.equal(buildKeep({ id: "M1" }, { deshacer: true }).keepInChatMessage.keepType, GUARDAR.DESHACER);
  assert.throws(() => buildKeep(null), /clave/);
});

test("llamada programada con su hora y su tipo", () => {
  const cuando = new Date("2026-10-04T21:00:00Z");
  const v = roundTrip(buildLlamadaProgramada({ cuando, titulo: "Noche de trivia", video: true }));
  assert.equal(Number(v.scheduledCallCreationMessage.scheduledTimestampMs), cuando.getTime());
  assert.equal(v.scheduledCallCreationMessage.callType, LLAMADA.VIDEO);
  assert.equal(v.scheduledCallCreationMessage.title, "Noche de trivia");
  assert.throws(() => buildLlamadaProgramada({ titulo: "sin fecha" }), /fecha/);
});

test("ubicación en vivo con su número de secuencia", () => {
  const v = roundTrip(buildUbicacionViva({ lat: 19.6011, lon: -99.0526, velocidad: 1.4, nota: "Voy llegando", secuencia: 3 }));
  const u = v.liveLocationMessage;
  assert.equal(Math.round(u.degreesLatitude * 1e4), 196011);
  assert.equal(Number(u.sequenceNumber), 3);
  assert.equal(u.caption, "Voy llegando");
  assert.throws(() => buildUbicacionViva({ lat: 19.6 }), /lat y lon/);
});

test("solicitud de pago con importe y fondo de color", () => {
  assert.equal(hexAArgb("#8B6CFF"), 0xff8b6cff);
  assert.throws(() => hexAArgb("morado"), /#RRGGBB/);

  const v = roundTrip(buildSolicitudPago({ monto: 500, moneda: "mxn", nota: "Premium", color: "#8B6CFF" }));
  const p = v.requestPaymentMessage;
  assert.equal(Number(p.amount1000), 500000, "el importe va en milésimas");
  assert.equal(p.currencyCodeIso4217, "MXN");
  assert.equal(p.noteMessage.extendedTextMessage.text, "Premium");
  assert.equal(p.background.placeholderArgb >>> 0, 0xff8b6cff);
  assert.throws(() => buildSolicitudPago({ monto: 0 }), /importe/);
});

test("pedido y factura", () => {
  const v = roundTrip(buildPedido({ id: "o1", titulo: "Tienda", articulos: 3, total: 120, vendedor: "1@s.whatsapp.net" }));
  assert.equal(v.orderMessage.itemCount, 3);
  assert.equal(Number(v.orderMessage.totalAmount1000), 120000);
  assert.equal(v.orderMessage.orderTitle, "Tienda");

  const f = roundTrip(buildFactura({ nota: "Factura #001", token: "t1", mimetype: "application/pdf", tipo: 1 }));
  assert.equal(f.invoiceMessage.note, "Factura #001");
});

test("etiqueta accesible, nota de una escucha y caducidad", () => {
  const audio = etiquetar({ url: "https://x", mimetype: "audio/ogg", ptt: true, seconds: 12 }, "La respuesta del quiz");
  unaEscucha(audio);
  const v = roundTrip({ audioMessage: audio });
  assert.equal(v.audioMessage.accessibilityLabel, "La respuesta del quiz");
  assert.equal(v.audioMessage.viewOnce, true);

  assert.deepEqual(etiquetar({ a: 1 }, "  "), { a: 1 }, "sin texto no ensucia el medio");
  assert.throws(() => etiquetar(null, "x"), /medio/);
  assert.throws(() => unaEscucha(null), /audioMessage/);

  const ctx = conCaducidad({}, DURACION_FIJADO.DIA);
  const t = roundTrip({ extendedTextMessage: { text: "esto se borra solo", contextInfo: ctx } });
  assert.equal(t.extendedTextMessage.contextInfo.expiration, 86400);
  assert.equal(t.extendedTextMessage.contextInfo.disappearingMode.initiator, 1);
  assert.throws(() => conCaducidad({}, 0), /segundos/);
});

test("sendNative entrega por relay y avisa en vez de lanzar", async () => {
  const sock = socketFalso();
  const r = await sendNative(sock, "1@g.us", buildLlamadaProgramada({ cuando: Date.now() + 3600e3, titulo: "Quedada" }));
  assert.equal(r.sent, true);
  assert.ok(sock.enviados[0].message.scheduledCallCreationMessage);

  const malo = await sendNative({}, "1@g.us", buildKeep({ id: "M1" }));
  assert.equal(malo.sent, false);
});
