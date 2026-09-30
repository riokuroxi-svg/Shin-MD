/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tanda7 — Carrusel, quiz oculto, progreso auto-editado, panel de
//  «pensando» con fuentes y preguntas nativas.
//
//  Todo lo de aquí se verifica con el proto REAL de baileys 6.7.24
//  (codificar → decodificar → el campo sigue ahí) y con sockets de
//  mentira que graban lo que el código manda. Nada toca la red.
//  Si pasa aquí, el mensaje VIAJA; que el teléfono lo dibuje se mira
//  después con `.lab <experimento>`.
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";

import {
  MAX_TARJETAS, MIN_TARJETAS,
  buildTarjeta, buildCarouselContent, prepararImagen, sendCarousel,
} from "#lib/carousel";
import {
  MAX_OPCIONES, MIN_OPCIONES, TIPO_QUIZ, TIPO_ENCUESTA,
  CONTENIDO_IMAGEN, CONTENIDO_TEXTO, TIPO_FOTO_ENCUESTA,
  parseQuiz, buildQuiz, buildImagePoll, asociarFotoOpcion,
} from "#lib/poll-plus";
import { createProgress, renderBar, renderProgress } from "#lib/progress";
import {
  PASO, PROVEEDOR, PROVEEDOR_FUENTE, TIPO_EDICION,
  normalizarPasos, normalizarFuentes, buildStepsContent, buildStepsEdit, renderPasosTexto,
} from "#lib/bot-steps";
import {
  VARIANTE, buildPregunta, buildPreguntaNativa, sendPregunta,
} from "#lib/preguntas";
import { EXPERIMENTOS, buscarExperimento, listarExperimentos } from "#lib/lab-experiments";

/** ¿El contenido sobrevive una vuelta completa por el protobuf? */
function vuelta(contenido) {
  const bytes = proto.Message.encode(proto.Message.fromObject(contenido)).finish();
  return proto.Message.decode(bytes);
}

/** Socket de mentira que graba los envíos (y puede fingir qué parte falla). */
function sockGrabador({ fallar = false, fallarRelay = false } = {}) {
  return {
    user: { id: "521234567890@s.whatsapp.net" },
    enviados: [],
    relays: [],
    async sendMessage(jid, contenido, opts = {}) {
      if (fallar) throw new Error("sin red");
      this.enviados.push({ jid, contenido, opts });
      return { key: { id: "MSG" + this.enviados.length, remoteJid: jid, fromMe: true } };
    },
    async relayMessage(jid, contenido, opts = {}) {
      if (fallar || fallarRelay) throw new Error("el relay reventó");
      this.relays.push({ jid, contenido, opts });
      return true;
    },
  };
}

const JID = "120363000000@g.us";
const tarjetaDemo = (n) => buildTarjeta({ titulo: `Carta ${n}`, cuerpo: "demo" });

// ════════════════════════ CARRUSEL ════════════════════════

test("carrusel: buildTarjeta exige algo que contar", () => {
  assert.throws(() => buildTarjeta({}), /título o cuerpo/);
  const card = buildTarjeta({ titulo: "Zero Two", pie: "gacha" });
  assert.equal(card.header.title, "Zero Two");
  assert.equal(card.footer.text, "gacha");
  assert.equal(card.header.hasMediaAttachment, false);
});

test("carrusel: los tres tipos de botón salen bien mapeados", () => {
  const card = buildTarjeta({
    titulo: "X",
    botones: [
      { texto: "Reclamar", id: ".claim" },
      { texto: "Abrir", url: "https://shin.md" },
      { texto: "Copiar", copiar: "CODE-1" },
    ],
  });
  const [rapido, url, copia] = card.nativeFlowMessage.buttons;
  assert.equal(rapido.name, "quick_reply");
  assert.equal(JSON.parse(rapido.buttonParamsJson).id, ".claim");
  assert.equal(url.name, "cta_url");
  assert.equal(JSON.parse(url.buttonParamsJson).merchant_url, "https://shin.md");
  assert.equal(copia.name, "cta_copy");
  assert.equal(JSON.parse(copia.buttonParamsJson).copy_code, "CODE-1");
});

test("carrusel: límites del protocolo (mínimo y recorte a 10)", () => {
  assert.throws(() => buildCarouselContent({ texto: "x", tarjetas: [tarjetaDemo(1)] }), /2 tarjetas/);
  const gordo = buildCarouselContent({
    texto: "x",
    tarjetas: Array.from({ length: MAX_TARJETAS + 3 }, (_, i) => tarjetaDemo(i)),
  });
  assert.equal(gordo.interactiveMessage.carouselMessage.cards.length, MAX_TARJETAS);
  assert.equal(gordo.interactiveMessage.carouselMessage.messageVersion, 1);
  assert.equal(gordo.messageContextInfo.deviceListMetadataVersion, 2);
  assert.ok(MIN_TARJETAS === 2);
});

test("carrusel: el mensaje entero sobrevive al protobuf con sus botones", () => {
  const contenido = buildCarouselContent({
    texto: "Elige carta",
    tarjetas: [tarjetaDemo(1), buildTarjeta({ titulo: "B", botones: [{ texto: "Ir", url: "https://x.com" }] })],
  });
  const v = vuelta(contenido);
  const cards = v.interactiveMessage.carouselMessage.cards;
  assert.equal(cards.length, 2);
  assert.equal(cards[0].header.title, "Carta 1");
  assert.equal(cards[1].nativeFlowMessage.buttons[0].name, "cta_url");
});

test("carrusel: prepararImagen NUNCA lanza (sin upload → tarjeta sin foto)", async () => {
  assert.equal(await prepararImagen({ user: {} }, Buffer.from("foto")), null);
  assert.equal(await prepararImagen(null, "https://x/y.png"), null);
  const card = buildTarjeta({ titulo: "con foto", imagen: { url: "x" } });
  assert.equal(card.header.hasMediaAttachment, true);
});

test("carrusel: sendCarousel con socket sano manda por relay con sus nodos", async () => {
  const sock = sockGrabador();
  const r = await sendCarousel(sock, JID, { texto: "mira", tarjetas: [tarjetaDemo(1), tarjetaDemo(2)] });
  assert.equal(r.sent, true);
  assert.ok(r.key.id);
  assert.equal(sock.relays.length, 1);
  assert.ok(Array.isArray(sock.relays[0].opts.additionalNodes));
});

test("carrusel: si el relay falla cae el respaldo y si no hay, sent:false sin lanzar", async () => {
  const sock = sockGrabador({ fallarRelay: true });
  const r = await sendCarousel(sock, JID, {
    texto: "mira", respaldo: "versión texto", tarjetas: [tarjetaDemo(1), tarjetaDemo(2)],
  });
  assert.equal(r.sent, true);
  assert.equal(r.respaldo, true);
  assert.equal(sock.enviados[0].contenido.text, "versión texto");

  const sinRespaldo = await sendCarousel(sockGrabador({ fallar: true }), JID, {
    texto: "mira", tarjetas: [tarjetaDemo(1), tarjetaDemo(2)],
  });
  assert.equal(sinRespaldo.sent, false);
});

// ════════════════════════ QUIZ Y FOTO-ENCUESTA ════════════════════════

test("quiz: parseQuiz lee la marca * de respuesta correcta", () => {
  const r = parseQuiz("¿Capital de Japón? | Kioto | *Tokio | Osaka");
  assert.equal(r.ok, true);
  assert.equal(r.pregunta, "¿Capital de Japón?");
  assert.deepEqual(r.opciones, ["Kioto", "Tokio", "Osaka"]);
  assert.equal(r.correcta, 1);
  // la marca también vale al final y desaparece del texto
  const alFinal = parseQuiz("p | a | b*");
  assert.equal(alFinal.correcta, 1);
  assert.equal(alFinal.opciones[1], "b");
});

test("quiz: parseQuiz rechaza las formas rotas", () => {
  assert.equal(parseQuiz("").ok, false);
  assert.equal(parseQuiz("p | a").ok, false);                       // < MIN_OPCIONES
  assert.equal(parseQuiz("p | a | b").ok, false);                   // sin correcta
  assert.equal(parseQuiz("p | *a | *b").ok, false);                 // dos correctas
  assert.equal(parseQuiz("p |" + " x |".repeat(MAX_OPCIONES) + " *z").ok, false); // > MAX_OPCIONES
  assert.ok(MIN_OPCIONES === 2 && MAX_OPCIONES === 12);
});

test("quiz: buildQuiz sale tipo QUIZ con la correcta viajando oculta", () => {
  const secreto = Buffer.alloc(32, 7);
  const q = buildQuiz({ pregunta: "¿2+2?", opciones: ["3", "4"], correcta: 1, secreto });
  const poll = q.pollCreationMessageV3;
  assert.equal(poll.pollType, TIPO_QUIZ);
  assert.equal(poll.pollContentType, CONTENIDO_TEXTO);
  assert.equal(poll.selectableOptionsCount, 1);
  assert.equal(poll.correctAnswer.optionName, "4");
  assert.equal(q.messageContextInfo.messageSecret, secreto);
  assert.throws(() => buildQuiz({ pregunta: "x", opciones: ["a", "b"], correcta: 9 }), /correcta/);
  assert.throws(() => buildQuiz({ pregunta: "", opciones: ["a", "b"] }), /pregunta/);
});

test("foto-encuesta: buildImagePoll pide IMÁGENES y la «multiple» usa el tipo viejo", () => {
  const simple = buildImagePoll({ pregunta: "¿Portada?", opciones: ["A", "B"], secreto: Buffer.alloc(32) });
  const poll = simple.pollCreationMessageV3;
  assert.equal(poll.pollType, TIPO_ENCUESTA);
  assert.equal(poll.pollContentType, CONTENIDO_IMAGEN);
  assert.equal(poll.selectableOptionsCount, 1);

  const multiple = buildImagePoll({ pregunta: "p", opciones: ["A", "B", "C"], multiple: true, secreto: Buffer.alloc(32) });
  assert.equal(multiple.pollCreationMessage.selectableOptionsCount, 3);
  assert.equal(multiple.pollCreationMessageV3, undefined);
});

test("foto-encuesta: la asociación de cada foto usa MEDIA_POLL (7) con su índice", () => {
  const key = { id: "ABC", remoteJid: JID };
  const foto = asociarFotoOpcion({ imageMessage: { url: "x" } }, key, 2);
  const asoc = foto.messageContextInfo.messageAssociation;
  assert.equal(asoc.associationType, TIPO_FOTO_ENCUESTA);
  assert.equal(asoc.messageIndex, 2);
  assert.equal(asoc.parentMessageKey, key);
  assert.throws(() => asociarFotoOpcion(null, key, 0), /mensaje/);
  assert.throws(() => asociarFotoOpcion({ }, null, 0), /clave/);
});

test("quiz y foto-encuesta sobreviven al protobuf completos", () => {
  const q = vuelta(buildQuiz({ pregunta: "¿2+2?", opciones: ["3", "4"], correcta: 1, secreto: Buffer.alloc(32) }));
  assert.equal(q.pollCreationMessageV3.pollType, 1);
  assert.equal(q.pollCreationMessageV3.correctAnswer.optionName, "4");

  const f = vuelta(buildImagePoll({ pregunta: "¿Portada?", opciones: ["A", "B"], secreto: Buffer.alloc(32) }));
  assert.equal(f.pollCreationMessageV3.pollContentType, 2);
});

// ════════════════════════ PROGRESO QUE SE EDITA SOLO ════════════════════════

test("progreso: renderBar clava 0–100 y no explota con basura", () => {
  assert.equal(renderBar(0), "▱▱▱▱▱▱▱▱▱▱ 0%");
  assert.equal(renderBar(100), "▰▰▰▰▰▰▰▰▰▰ 100%");
  assert.equal(renderBar(250), "▰▰▰▰▰▰▰▰▰▰ 100%");
  assert.equal(renderBar(-5), "▱▱▱▱▱▱▱▱▱▱ 0%");
  assert.equal(renderBar(NaN), "▱▱▱▱▱▱▱▱▱▱ 0%");
  assert.equal(renderBar(30, 10), "▰▰▰▱▱▱▱▱▱▱ 30%");
});

test("progreso: renderProgress arma título, barra y detalle", () => {
  const flat = renderProgress({ title: "Bajando", pct: 50, detail: "4.2 MB" });
  assert.ok(flat.includes("*Bajando*"));
  assert.ok(flat.includes("50%"));
  assert.ok(flat.includes("> 4.2 MB"));
  const sinBarra = renderProgress({ title: "Solo texto" });
  assert.ok(!sinBarra.includes("▰"));
});

test("progreso: un solo mensaje, ediciones con ritmo y cierre forzado", async () => {
  const sock = sockGrabador();
  const p = createProgress(sock, JID, { minGapMs: 1000 });

  const key = await p.start({ title: "Buscando…" });
  assert.ok(key.id);
  assert.equal(sock.enviados.length, 1, "el arranque manda UN mensaje");

  assert.equal(await p.update({ title: "33%" }), false, "demasiado rápido: se salta");
  assert.equal(sock.enviados.length, 1, "update rápido NO gasta otro mensaje");

  assert.equal(await p.finish({ title: "Listo ✅" }), true, "finish siempre edita");
  const edicion = sock.enviados[1].contenido;
  assert.equal(edicion.edit.id, key.id, "la edición apunta al mismo mensaje");
  assert.equal(await p.update({ title: "tarde" }), false, "cerrado no edita más");
});

test("progreso: si el envío inicial falla, todo después es no-op silencioso", async () => {
  const p = createProgress(sockGrabador({ fallar: true }), JID);
  assert.equal(await p.start({ title: "x" }), null);
  assert.equal(p.alive(), false);
  assert.equal(await p.update({ title: "50%" }), false);
  assert.equal(await p.finish("hecho"), false);
  assert.equal(await p.fail("motivo"), false, "ni el error lanza");
});

// ════════════════════════ «PENSANDO…» CON FUENTES ════════════════════════

test("pasos: cada fuente lleva título, proveedor y URL (nada muerto de relleno)", () => {
  const [paso] = normalizarPasos([{
    titulo: "Buscando", estado: PASO.EJECUTANDO, razonando: true,
    fuentes: [
      { titulo: "Wiki", url: "https://wiki.x", proveedor: PROVEEDOR.GOOGLE },
      { titulo: "Sin extras" },
    ],
  }]);
  const [conTodo, minima] = paso.sourcesMetadata;
  assert.equal(conTodo.provider, PROVEEDOR.GOOGLE);
  assert.equal(conTodo.sourceUrl, "https://wiki.x");
  assert.equal(conTodo.favIconUrl, undefined, "los pasos NO guardan favicon: no se manda basura");
  assert.equal(minima.provider, PROVEEDOR.OTRO, "proveedor por defecto");
  assert.equal(paso.isReasoning, true);
});

test("fuentes del panel: SÍ llevan favicon (richResponseSourcesMetadata)", () => {
  const [f1, f2] = normalizarFuentes([
    { titulo: "Wiki", url: "https://wiki.x", favicon: "https://wiki.x/f.ico", proveedor: PROVEEDOR_FUENTE.GOOGLE, consulta: "naruto", imagen: "https://wiki.x/big.png" },
    { url: "https://r.xy" },
  ]);
  assert.equal(f1.provider, PROVEEDOR_FUENTE.GOOGLE);
  assert.equal(f1.citationNumber, 1);
  assert.equal(f1.faviconCdnUrl, "https://wiki.x/f.ico");
  assert.equal(f1.thumbnailCdnUrl, "https://wiki.x/big.png");
  assert.equal(f1.sourceQuery, "naruto");
  assert.equal(f2.provider, PROVEEDOR_FUENTE.DESCONOCIDO);
  assert.equal(f2.citationNumber, 2);
  assert.equal(f2.faviconCdnUrl, undefined, "sin favicon no se inventa");
});

test("pasos: buildStepsContent trae panel + respaldo de texto + disclaimer", () => {
  const c = buildStepsContent({
    texto: "respaldo legible",
    descripcion: "Pensando…",
    disclaimer: "IA · revisa la info",
    pasos: [{ titulo: "A", estado: PASO.HECHO, secciones: [{ titulo: "nota", cuerpo: "x" }] }],
  });
  const meta = c.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.equal(meta.progressDescription, "Pensando…");
  assert.equal(meta.stepsMetadata[0].status, PASO.HECHO);
  assert.equal(meta.stepsMetadata[0].sections[0].sectionBody, "x");
  assert.equal(c.messageContextInfo.botMetadata.messageDisclaimerText, "IA · revisa la info");
  assert.equal(c.extendedTextMessage.text, "respaldo legible");
  assert.throws(() => buildStepsContent({ pasos: [] }), /pasos/);
});

test("pasos: la edición del panel usa MESSAGE_EDIT (14) y exige la clave", () => {
  assert.throws(() => buildStepsEdit({}, {}), /clave/);
  const key = { id: "P1", remoteJid: JID };
  const ed = buildStepsEdit(key, buildStepsContent({ pasos: [{ titulo: "A" }] }), 123);
  assert.equal(ed.protocolMessage.type, TIPO_EDICION);
  assert.equal(ed.protocolMessage.key, key);
  assert.equal(ed.protocolMessage.timestampMs, 123);
});

test("pasos: el panel con fuentes y favicon sobrevive al protobuf", () => {
  const c = buildStepsContent({
    descripcion: "Pensando…",
    pasos: [{
      titulo: "Leyendo Google", estado: PASO.EJECUTANDO, razonando: true,
      fuentes: [{ titulo: "Guía", url: "https://g.x" }],
    }],
    fuentes: [{ url: "https://g.x", favicon: "https://g.x/i.png", proveedor: PROVEEDOR_FUENTE.GOOGLE }],
  });
  const v = vuelta(c);
  const paso = v.messageContextInfo.botMetadata.progressIndicatorMetadata.stepsMetadata[0];
  assert.equal(paso.status, PASO.EJECUTANDO);
  assert.equal(paso.isReasoning, true);
  const fuente = v.messageContextInfo.botMetadata.richResponseSourcesMetadata.sources[0];
  assert.equal(fuente.faviconCdnUrl, "https://g.x/i.png", "el favicon llega al teléfono");
  assert.equal(fuente.sourceProviderUrl, "https://g.x");
  assert.equal(fuente.provider, PROVEEDOR_FUENTE.GOOGLE);
  assert.equal(v.extendedTextMessage.text, "Pensando…");
});

test("pasos: el texto de respaldo marca ○ ◐ ● con su detalle", () => {
  const txt = renderPasosTexto([
    { titulo: "Hecho", estado: PASO.HECHO },
    { titulo: "Yendo", estado: PASO.EJECUTANDO, detalle: "3 fuentes" },
    { titulo: "Pendiente" },
  ], "Pensando…");
  const lineas = txt.split("\n");
  assert.equal(lineas[0], "*Pensando…*");
  assert.equal(lineas[1], "● Hecho");
  assert.equal(lineas[2], "◐ Yendo · 3 fuentes");
  assert.equal(lineas[3], "○ Pendiente");
});

// ════════════════════════ PREGUNTAS NATIVAS ════════════════════════

test("preguntas: la vía ligera marca isQuestion en ContextInfo", () => {
  const p = buildPregunta({ texto: "  ¿Qué maratoneamos?  " });
  assert.equal(p.extendedTextMessage.text, "¿Qué maratoneamos?");
  assert.equal(p.extendedTextMessage.contextInfo.isQuestion, true);
  assert.throws(() => buildPregunta({ texto: "   " }), /vacía/);
});

test("preguntas: la caja nativa envuelve el texto en questionMessage", () => {
  const q = buildPreguntaNativa({ texto: "¿Subs o doblaje?" });
  assert.equal(q.questionMessage.message.extendedTextMessage.text, "¿Subs o doblaje?");
  assert.throws(() => buildPreguntaNativa({}), /vacía/);
  assert.ok(VARIANTE.FLAG && VARIANTE.CAJA);
});

test("preguntas: las dos variantes sobreviven al protobuf", () => {
  const flag = vuelta(buildPregunta({ texto: "¿Maratón?" }));
  assert.equal(flag.extendedTextMessage.contextInfo.isQuestion, true, "el campo 63 viaja");

  const caja = vuelta(buildPreguntaNativa({ texto: "¿Subs?" }));
  const vueltaTexto = caja.questionMessage.message.extendedTextMessage.text;
  assert.equal(vueltaTexto, "¿Subs?");
});

test("preguntas: sendPregunta manda por relay y jamás lanza", async () => {
  const sock = sockGrabador();
  const ok = await sendPregunta(sock, JID, { texto: "¿Maratón?" });
  assert.equal(ok.sent, true);
  assert.equal(sock.relays.length, 1);

  const caja = await sendPregunta(sock, JID, { texto: "¿Dos?" }, { variante: VARIANTE.CAJA });
  assert.equal(caja.sent, true);
  assert.equal(sock.relays.length, 2);

  assert.equal((await sendPregunta({ user: {} }, JID, { texto: "x" })).sent, false, "sin relay → sent:false");
  assert.equal((await sendPregunta(sockGrabador({ fallar: true }), JID, { texto: "x" })).sent, false);
  assert.equal((await sendPregunta(sockGrabador(), JID, { texto: " " })).sent, false, "texto vacío no viaja");
});

// ════════════════════════ INTEGRACIÓN CON EL LABORATORIO ════════════════════════

test("laboratorio: pregunta, preguntabox y carrusel ya aparecen en la lista", () => {
  assert.ok(buscarExperimento("pregunta"), "falta .lab pregunta");
  assert.ok(buscarExperimento("preguntabox"), "falta .lab preguntabox");
  assert.ok(buscarExperimento("carrusel"), "falta .lab carrusel");
  assert.equal(EXPERIMENTOS[0].clave, "tabla", "los nuevos van al final: nada se reordenó");
  const lista = listarExperimentos();
  assert.equal(lista.length, EXPERIMENTOS.length);
});

test("laboratorio: las preguntas nuevas también codifican contra el proto real", () => {
  for (const clave of ["pregunta", "preguntabox"]) {
    const exp = buscarExperimento(clave);
    const contenido = exp.construir({ texto: "¿Prueba de fuego?" });
    const v = vuelta(contenido);
    if (clave === "pregunta") {
      assert.ok(v.extendedTextMessage.contextInfo.isQuestion);
    } else {
      assert.equal(v.questionMessage.message.extendedTextMessage.text, "¿Prueba de fuego?");
    }
  }
});
