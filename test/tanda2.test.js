/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Tanda 2 del sistema de diseño:
 *  · tarjeta con cuenta atrás (messageParamsJson · limited_time_offer)
 *  · un solo mensaje que se va editando (progress.js)
 *  · tarjeta de evento nativa (.evento)
 *  · video redondo (.ptv)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";

import {
  buildLimitedTimeOffer, buildBottomSheet, buildMessageParams, offerParams,
} from "../src/lib/native-params.js";
import { sendNativeQuickReply } from "../src/lib/native-reply.js";
import { renderBar, renderProgress, createProgress } from "../src/lib/progress.js";
import eventoCmd, {
  parseHora, parseFechaHora, parseEvento, buildEventContent, fechaBonita,
} from "../cmds/group/evento.js";
import ptvCmd, { puedeSerPtv } from "../cmds/utils/ptv.js";

/** Socket de mentira: apunta todo lo que se manda, no toca la red. */
function fakeSock() {
  const enviados = [];
  const relayed = [];
  return {
    enviados, relayed,
    user: { id: "111@s.whatsapp.net" },
    async sendMessage(jid, content, opts) {
      enviados.push({ jid, content, opts });
      return { key: { id: "MSG" + enviados.length, remoteJid: jid, fromMe: true } };
    },
    async relayMessage(jid, message, opts) {
      relayed.push({ jid, message, opts });
      return {};
    },
  };
}

// ── messageParamsJson: la cuenta atrás ──────────────────────────────

test("cuenta atrás: acepta Date, milisegundos, segundos e ISO", () => {
  const d = new Date("2026-10-04T20:00:00Z");
  assert.equal(buildLimitedTimeOffer({ text: "x", expiresAt: d }).expiration_time, d.getTime());
  assert.equal(buildLimitedTimeOffer({ text: "x", expiresAt: d.getTime() }).expiration_time, d.getTime());
  // un "timestamp" en segundos no debe interpretarse como 1970
  assert.equal(buildLimitedTimeOffer({ text: "x", expiresAt: Math.floor(d.getTime() / 1000) }).expiration_time, d.getTime());
  assert.equal(buildLimitedTimeOffer({ text: "x", expiresAt: d.toISOString() }).expiration_time, d.getTime());
});

test("cuenta atrás: sin título o sin fecha devuelve null (no una tarjeta rota)", () => {
  assert.equal(buildLimitedTimeOffer({ text: "", expiresAt: Date.now() }), null);
  assert.equal(buildLimitedTimeOffer({ text: "x" }), null);
  assert.equal(buildLimitedTimeOffer({ text: "x", expiresAt: "no es fecha" }), null);
  assert.equal(buildLimitedTimeOffer(), null);
  assert.equal(offerParams({ text: "x" }), "", "sin datos, no se manda nada");
});

test("cuenta atrás: los campos opcionales solo aparecen si valen algo", () => {
  const o = buildLimitedTimeOffer({ text: "Recompensa", expiresAt: 1e12 });
  assert.deepEqual(Object.keys(o).sort(), ["expiration_time", "text"]);
  const o2 = buildLimitedTimeOffer({ text: "R", expiresAt: 1e12, url: "https://x.y", copyCode: ".daily" });
  assert.equal(o2.url, "https://x.y");
  assert.equal(o2.copy_code, ".daily");
});

test("hoja inferior: el límite en el chat se recorta a 0–3", () => {
  assert.equal(buildBottomSheet({ inThreadLimit: 9 }).in_thread_buttons_limit, 3);
  assert.equal(buildBottomSheet({ inThreadLimit: -4 }).in_thread_buttons_limit, 0);
  assert.equal(buildBottomSheet().in_thread_buttons_limit, 2);
  assert.deepEqual(buildBottomSheet({ dividers: [2, "x", -1, 4.7] }).divider_indices, [2, 4]);
});

test("messageParamsJson: vacío es cadena vacía, nunca '{}'", () => {
  assert.equal(buildMessageParams(), "");
  assert.equal(buildMessageParams({}), "");
  const j = buildMessageParams({
    limitedTimeOffer: buildLimitedTimeOffer({ text: "T", expiresAt: 1e12 }),
    bottomSheet: buildBottomSheet({ listTitle: "L" }),
  });
  const p = JSON.parse(j);
  assert.equal(p.limited_time_offer.text, "T");
  assert.equal(p.bottom_sheet.list_title, "L");
});

test("la tarjeta viaja con los adornos dentro del mensaje real", async () => {
  const sock = fakeSock();
  const params = offerParams({ text: "Próxima recompensa", expiresAt: Date.now() + 3600000, copyCode: ".daily" });

  const r = await sendNativeQuickReply({
    sock, jid: "1@s.whatsapp.net", title: "⏳", body: "cuerpo",
    buttons: [{ text: "💰 Mi saldo", id: ".balance" }],
    params,
  });
  assert.equal(r.sent, true);

  const nf = sock.relayed[0].message.interactiveMessage.nativeFlowMessage;
  assert.equal(nf.messageParamsJson, params);
  assert.equal(JSON.parse(nf.messageParamsJson).limited_time_offer.copy_code, ".daily");

  // El botón lleva el comando como id: serialize.js lo convierte en texto,
  // así que tocarlo equivale a escribir ".balance".
  assert.equal(JSON.parse(nf.buttons[0].buttonParamsJson).id, ".balance");
});

test("sin adornos NO se manda messageParamsJson (evita la franja gris)", async () => {
  const sock = fakeSock();
  await sendNativeQuickReply({ sock, jid: "1@s.whatsapp.net", body: "hola", buttons: [] });
  const nf = sock.relayed[0].message.interactiveMessage.nativeFlowMessage;
  // El proto lo deja en su valor por defecto (null/"") en vez de ponerlo:
  // lo que importa es que WhatsApp no reciba un JSON que dibujar.
  assert.ok(!nf.messageParamsJson, `no debería haber adornos: ${nf.messageParamsJson}`);
  assert.ok(!Object.keys(nf).includes("messageParamsJson"));
});

// ── progreso editable ───────────────────────────────────────────────

test("barra de progreso: extremos y redondeo", () => {
  assert.equal(renderBar(0, 4), "▱▱▱▱ 0%");
  assert.equal(renderBar(100, 4), "▰▰▰▰ 100%");
  assert.equal(renderBar(50, 4), "▰▰▱▱ 50%");
  assert.equal(renderBar(-30, 4), "▱▱▱▱ 0%");
  assert.equal(renderBar(400, 4), "▰▰▰▰ 100%");
  assert.equal(renderBar(NaN, 4), "▱▱▱▱ 0%");
  assert.ok(renderBar(33).startsWith("▰▰▰▱"));
});

test("progreso: el texto lleva título, barra y detalle", () => {
  const t = renderProgress({ title: "Descargando audio", detail: "Funk Mambo", pct: 20 });
  assert.match(t, /^\*Descargando audio\*/);
  assert.match(t, /20%/);
  assert.match(t, /> Funk Mambo/);
  assert.ok(!renderProgress({ title: "x" }).includes("%"), "sin pct no se dibuja barra");
});

test("progreso: primer envío gasta un mensaje, los retoques son ediciones", async () => {
  const sock = fakeSock();
  const p = createProgress(sock, "1@g.us", { quoted: { key: {} }, minGapMs: 0 });

  await p.start({ title: "Descargando", pct: 10 });
  assert.equal(sock.enviados.length, 1);
  assert.equal(sock.enviados[0].content.edit, undefined, "el primero es un mensaje normal");
  assert.ok(sock.enviados[0].opts.quoted, "cita al que pidió la descarga");

  await p.update({ title: "Bajando", pct: 60 });
  assert.equal(sock.enviados[1].content.edit.id, "MSG1", "edita el mismo mensaje");

  await p.finish({ title: "Listo", pct: 100 });
  assert.equal(sock.enviados.length, 3);
  assert.match(sock.enviados[2].content.text, /Listo/);
  assert.equal(p.alive(), false, "tras finish ya no se edita más");

  await p.update({ title: "tarde" });
  assert.equal(sock.enviados.length, 3, "después de cerrar no manda nada");
});

test("progreso: no edita dos veces seguidas ni repite el mismo texto", async () => {
  const sock = fakeSock();
  const p = createProgress(sock, "1@g.us", { minGapMs: 10000 });
  await p.start("A");
  await p.update("B");   // demasiado pronto
  await p.update("C");   // demasiado pronto
  assert.equal(sock.enviados.length, 1, "las ediciones muy seguidas se descartan");

  await p.finish("D");   // el cierre siempre pasa
  assert.equal(sock.enviados.length, 2);

  const sock2 = fakeSock();
  const q = createProgress(sock2, "1@g.us", { minGapMs: 0 });
  await q.start("igual");
  await q.update("igual");
  assert.equal(sock2.enviados.length, 1, "no se reenvía un texto idéntico");
});

test("progreso: si el primer mensaje falla, nada explota", async () => {
  const roto = { async sendMessage() { throw new Error("sin conexión"); } };
  const p = createProgress(roto, "1@g.us");
  assert.equal(await p.start("x"), null);
  assert.equal(await p.update("y"), false);
  assert.equal(await p.finish("z"), false);
  assert.equal(await p.fail("motivo"), false);
  assert.equal(p.alive(), false);
});

test("progreso: fail deja un aviso legible en español", async () => {
  const sock = fakeSock();
  const p = createProgress(sock, "1@g.us", { minGapMs: 0 });
  await p.start("x");
  await p.fail("Video muy grande (>100MB)");
  const t = sock.enviados[1].content.text;
  assert.match(t, /No se pudo completar/);
  assert.match(t, /Video muy grande/);
  assert.ok(sock.enviados[1].content.edit, "es una edición, no un mensaje nuevo");
});

// ── .evento ─────────────────────────────────────────────────────────

test(".evento: horas en 24h y en am/pm", () => {
  assert.equal(parseHora("20:00"), 20 * 60);
  assert.equal(parseHora("8pm"), 20 * 60);
  assert.equal(parseHora("8:30pm"), 20 * 60 + 30);
  assert.equal(parseHora("12am"), 0);
  assert.equal(parseHora("12pm"), 12 * 60);
  assert.equal(parseHora("9 a.m."), 9 * 60);
  assert.equal(parseHora("25:00"), null);
  assert.equal(parseHora("10:75"), null);
  assert.equal(parseHora("mañana"), null);
});

test(".evento: fechas escritas como las escribe la gente", () => {
  const ahora = new Date(2026, 8, 30, 10, 0, 0); // 30 sep 2026, 10:00

  const hoy = parseFechaHora("hoy 22:30", ahora);
  assert.equal(hoy.getDate(), 30);
  assert.equal(hoy.getHours(), 22);

  const man = parseFechaHora("mañana 9pm", ahora);
  assert.equal(man.getDate(), 1);
  assert.equal(man.getMonth(), 9, "1 de octubre");
  assert.equal(man.getHours(), 21);

  const barra = parseFechaHora("4/10 20:00", ahora);
  assert.equal(barra.getDate(), 4);
  assert.equal(barra.getMonth(), 9);

  const conMes = parseFechaHora("4 oct 20:00", ahora);
  assert.equal(conMes.getDate(), 4);
  assert.equal(conMes.getMonth(), 9);

  // sin hora → mediodía, nunca las 00:00
  assert.equal(parseFechaHora("4/10", ahora).getHours(), 12);

  // una fecha ya pasada sin año se entiende del año siguiente
  assert.equal(parseFechaHora("4/1 20:00", ahora).getFullYear(), 2027);

  assert.equal(parseFechaHora("el jueves que viene", ahora), null);
  assert.equal(parseFechaHora("40/13 20:00", ahora), null);
  assert.equal(parseFechaHora("", ahora), null);
});

test(".evento: trocea el comando y rechaza lo imposible", () => {
  const ahora = new Date(2026, 8, 30, 10, 0, 0);

  const ok = parseEvento("4/10 20:00 | Invocación doble | Tiradas al doble", ahora);
  assert.equal(ok.ok, true);
  assert.equal(ok.nombre, "Invocación doble");
  assert.equal(ok.descripcion, "Tiradas al doble");
  assert.equal(ok.inicio.getHours(), 20);
  assert.equal(ok.fin - ok.inicio, 2 * 60 * 60 * 1000, "dura 2 horas por defecto");

  assert.equal(parseEvento("4/10 20:00", ahora).error, "faltan datos");
  assert.equal(parseEvento("| solo nombre", ahora).error, "faltan datos");
  assert.equal(parseEvento("cuando sea | Fiesta", ahora).error, "fecha");
  assert.equal(parseEvento("1/1/2020 20:00 | Fiesta", ahora).error, "pasado");
});

test(".evento: el contenido es válido para WhatsApp (se codifica con el proto)", () => {
  const datos = parseEvento("4/10 20:00 | Torneo | Premios", new Date(2026, 8, 30, 10, 0, 0));
  const contenido = buildEventContent(datos);

  assert.equal(contenido.eventMessage.name, "Torneo");
  assert.equal(contenido.eventMessage.isCanceled, false);
  // segundos, no milisegundos: si se cuela un x1000 la fecha se va al año 57000
  assert.equal(contenido.eventMessage.startTime, Math.floor(datos.inicio.getTime() / 1000));
  assert.ok(contenido.eventMessage.startTime < 4e9);

  const msg = proto.Message.fromObject(contenido);
  const bytes = proto.Message.encode(msg).finish();
  const vuelta = proto.Message.decode(bytes);
  assert.equal(vuelta.eventMessage.name, "Torneo");
  assert.equal(Number(vuelta.eventMessage.startTime), contenido.eventMessage.startTime);
});

test(".evento: manda la tarjeta y no escribe texto encima", async () => {
  const sock = fakeSock();
  const r = await eventoCmd.handler(sock, { chatId: "1@g.us", arg: "mañana 9pm | Torneo de ppt" });
  assert.equal(r, null);
  assert.equal(sock.relayed.length, 1);
  assert.equal(sock.relayed[0].message.eventMessage.name, "Torneo de ppt");
  assert.equal(sock.enviados.length, 0, "la tarjeta no debe duplicarse en texto");
});

test(".evento: si la tarjeta falla queda el dato en texto, y es solo para admins", async () => {
  assert.equal(eventoCmd.groupOnly, true);
  assert.equal(eventoCmd.adminOnly, true);

  const roto = { user: { id: "1@s.whatsapp.net" }, async relayMessage() { throw new Error("no soportado"); } };
  const r = await eventoCmd.handler(roto, { chatId: "1@g.us", arg: "mañana 9pm | Torneo" });
  assert.match(r, /Torneo/);
  assert.match(r, /Evento creado|CUÁNDO|Cuándo/i);

  const ayuda = await eventoCmd.handler(roto, { chatId: "1@g.us", arg: "cuando sea | Fiesta" });
  assert.match(ayuda, /No entendí la fecha/);
});

test(".evento: la fecha se lee bonita en español", () => {
  assert.equal(fechaBonita(new Date(2026, 9, 4, 20, 5)), "domingo 4 oct · 8:05 p.m.");
  assert.equal(fechaBonita(new Date(2026, 9, 4, 9, 0)), "domingo 4 oct · 9:00 a.m.");
});

// ── .ptv ────────────────────────────────────────────────────────────

test(".ptv: revisa los límites antes de gastar datos bajando el video", () => {
  assert.equal(puedeSerPtv({ seconds: 20, fileLength: 1000 }).ok, true);
  assert.equal(puedeSerPtv({ seconds: 61 }).motivo, "largo");
  assert.equal(puedeSerPtv({ seconds: 10, fileLength: 20 * 1024 * 1024 }).motivo, "pesado");
  assert.equal(puedeSerPtv({ seconds: 5, gifPlayback: true }).motivo, "gif");
  assert.equal(puedeSerPtv(null).motivo, "sin video");
  assert.equal(puedeSerPtv({ seconds: 60 }).ok, true, "60 s justos sí entran");
});

test(".ptv: sin video citado pide que respondan a uno", async () => {
  const r = await ptvCmd.handler(fakeSock(), { chatId: "1@s.whatsapp.net" });
  assert.match(r, /Responde al mensaje/);
  assert.match(r, /60 segundos/);
});

test(".ptv: explica por qué no se puede, en vez de fallar en silencio", async () => {
  const ctx = { chatId: "1@s.whatsapp.net", replyMsg: { message: { videoMessage: { seconds: 180 } } } };
  const r = await ptvCmd.handler(fakeSock(), ctx);
  assert.match(r, /180s/);
  assert.match(r, /60s/);
});
