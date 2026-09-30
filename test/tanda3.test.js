/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tanda3.test.js — Piezas de interfaz nuevas
//
//  Lo que se comprueba aquí es lo único comprobable sin un teléfono
//  delante: que cada mensaje se ARMA bien y que CODIFICA y DECODIFICA
//  contra el protobuf real de baileys 6.7.24. Si una pieza pasa estas
//  pruebas, el bot no se va a romper mandándola; que el cliente la
//  dibuje se mira con .lab.
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";

import {
  MUESTRAS, PATRONES, drawWaveform, waveformFromText,
  esWaveformValida, renderAsciiWave, hashTexto,
} from "#lib/waveform";

import { hexToArgb, vestirAudio, sendVoiceArt } from "#lib/voice-art";

import {
  MAX_ALBUM, TIPO_ALBUM, TIPO_PORTADA_EVENTO,
  planAlbum, buildAlbumParent, asociarAlAlbum, sendAlbum, sendEventCover,
} from "#lib/album";

import {
  SUB, COLOR_CODIGO, PROVEEDOR_FUENTE, tokenizeCode, texto, tabla, codigo, rejilla, imagen,
  reels, mapa, latex, fuentes, buildUnified, buildRichContent, sendRich,
} from "#lib/rich-response";

import {
  MAX_OPCIONES, TIPO_QUIZ, CONTENIDO_IMAGEN, TIPO_FOTO_ENCUESTA,
  parseQuiz, buildQuiz, buildImagePoll, asociarFotoOpcion, sendQuiz, sendImagePoll,
} from "#lib/poll-plus";

import {
  EXPERIMENTOS, buscarExperimento, listarExperimentos, anotarImagen,
  buildTabla, buildCodigo, buildChips, buildLlamada, buildPago,
  buildEncuesta, buildInvitacion, buildQuizDemo, buildEtiqueta,
  buildProducto, buildComentario, buildCatalogo,
  conBotonEnlace, conMencionDeGrupo,
} from "#lib/lab-experiments";

import {
  PASO, TIPO_EDICION, normalizarPasos, buildStepsContent, buildStepsEdit,
  renderPasosTexto, createNativeSteps,
} from "#lib/bot-steps";

import { esRelayLigero } from "../src/core/socket.js";

import lab from "../cmds/owner/lab.js";

/** Socket de mentira: apunta lo que se le pide sin tocar la red. */
function socketFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: "521555@s.whatsapp.net" },
    relayMessage: async (jid, message, opciones) => {
      enviados.push({ tipo: "relay", jid, message, opciones });
      return { key: { id: opciones?.messageId || "X" } };
    },
    sendMessage: async (jid, content, opciones) => {
      enviados.push({ tipo: "send", jid, content, opciones });
      return { key: { id: "S1" } };
    },
  };
}

const CTX = {
  chatId: "1203@g.us",
  senderId: "521555@s.whatsapp.net",
  usedPrefix: ".",
  full: {
    key: { remoteJid: "1203@g.us", fromMe: false, id: "AAA", participant: "521999@s.whatsapp.net" },
    message: { conversation: ".lab" },
  },
};

/** ¿El contenido sobrevive una vuelta completa por el protobuf? */
function roundTrip(contenido) {
  const bytes = proto.Message.encode(proto.Message.fromObject(contenido)).finish();
  assert.ok(bytes.length > 0, "el mensaje quedó vacío");
  return proto.Message.decode(bytes);
}

// ── 1. Onda ────────────────────────────────────────────────────────

test("cada patrón de onda son 64 bytes entre 0 y 100", () => {
  for (const patron of PATRONES) {
    const onda = drawWaveform(patron);
    assert.equal(onda.length, MUESTRAS, `${patron} no mide 64`);
    assert.ok(esWaveformValida(onda), `${patron} tiene valores fuera de rango`);
  }
});

test("la firma de un texto es siempre la misma y distinta para otro texto", () => {
  const a1 = waveformFromText("Yoasobi - Idol");
  const a2 = waveformFromText("Yoasobi - Idol");
  const b = waveformFromText("Kenshi Yonezu - Lemon");
  assert.deepEqual(Array.from(a1), Array.from(a2));
  assert.notDeepEqual(Array.from(a1), Array.from(b));
  assert.equal(hashTexto("abc"), hashTexto("abc"));
  assert.notEqual(hashTexto("abc"), hashTexto("abd"));
});

test("un patrón desconocido no revienta: cae en la onda normal", () => {
  const onda = drawWaveform("no-existe-esto");
  assert.ok(esWaveformValida(onda));
});

test("esWaveformValida rechaza lo que WhatsApp no aceptaría", () => {
  assert.equal(esWaveformValida(null), false);
  assert.equal(esWaveformValida(new Uint8Array(10)), false);
  assert.equal(esWaveformValida(Array(64).fill(200)), false);
  assert.equal(esWaveformValida(Array(64).fill(50)), true);
});

test("la vista previa en texto tiene una barra por muestra", () => {
  assert.equal(renderAsciiWave(drawWaveform("montana")).length, MUESTRAS);
});

// ── 2. Audio vestido ───────────────────────────────────────────────

test("hexToArgb entiende los formatos de color habituales", () => {
  assert.equal(hexToArgb("#ff4fa3"), 0xffff4fa3);
  assert.equal(hexToArgb("ff4fa3"), 0xffff4fa3);
  assert.equal(hexToArgb("#FFFF4FA3"), 0xffff4fa3);
  assert.equal(hexToArgb("#abc"), 0xffaabbcc);
  assert.equal(hexToArgb(0x112233), 0x112233);
  assert.equal(hexToArgb("no soy un color"), null);
  assert.equal(hexToArgb(""), null);
  assert.equal(hexToArgb(undefined), null);
});

test("vestirAudio pone onda, ptt y color sobre el audioMessage", () => {
  const audioMessage = { url: "https://x", mimetype: "audio/mpeg" };
  vestirAudio(audioMessage, { patron: "ecualizador", color: "#ff4fa3", seconds: 73.4 });

  assert.equal(audioMessage.waveform.length, 64);
  assert.equal(audioMessage.ptt, true);
  assert.equal(audioMessage.backgroundArgb, 0xffff4fa3);
  assert.equal(audioMessage.seconds, 73);
});

test("vestirAudio con ptt:false deja el audio como archivo", () => {
  const audioMessage = {};
  vestirAudio(audioMessage, { ptt: false, semilla: "hola" });
  assert.equal(audioMessage.ptt, undefined);
  assert.equal(audioMessage.waveform.length, 64);
});

test("vestirAudio rechaza una onda inventada de mal tamaño", () => {
  assert.throws(() => vestirAudio({}, { waveform: new Uint8Array(12) }), /64 bytes/);
  assert.throws(() => vestirAudio(null), /audioMessage/);
});

test("un audioMessage vestido sigue siendo válido para el protobuf", () => {
  const audioMessage = { url: "https://x", mimetype: "audio/ogg; codecs=opus", seconds: 30 };
  vestirAudio(audioMessage, { patron: "latido", color: "#1b1030" });

  const vuelta = roundTrip({ audioMessage });
  assert.equal(vuelta.audioMessage.ptt, true);
  assert.equal(vuelta.audioMessage.waveform.length, 64);
  assert.equal(vuelta.audioMessage.backgroundArgb, 0xff1b1030);
});

test("sendVoiceArt no lanza si el socket no sabe subir medios", async () => {
  const r = await sendVoiceArt(socketFalso(), "1@s.whatsapp.net", { audio: Buffer.from("x") });
  assert.equal(r.sent, false);
  assert.match(String(r.error?.message), /subir medios/);
});

// ── 3. Álbum ───────────────────────────────────────────────────────

test("planAlbum acepta enlaces, buffers y objetos mezclados", () => {
  const plan = planAlbum([
    "https://x/1.jpg",
    Buffer.from("foto"),
    { video: "https://x/2.mp4", caption: "mira" },
  ]);
  assert.equal(plan.ok, true);
  assert.equal(plan.imagenes, 2);
  assert.equal(plan.videos, 1);
  assert.equal(plan.medios[2].caption, "mira");
});

test("planAlbum protege los límites de WhatsApp", () => {
  assert.equal(planAlbum([]).error, "vacio");
  assert.equal(planAlbum(["una"]).error, "pocos");
  assert.equal(planAlbum(Array(MAX_ALBUM + 1).fill("x")).error, "muchos");
  assert.equal(planAlbum([{ nada: 1 }, "x"]).error, "tipo");
});

test("el álbum padre declara cuántas fotos y vídeos vienen", () => {
  const plan = planAlbum(["a.jpg", "b.jpg", { video: "c.mp4" }]);
  const contenido = buildAlbumParent(plan);
  assert.equal(contenido.albumMessage.expectedImageCount, 2);
  assert.equal(contenido.albumMessage.expectedVideoCount, 1);

  const vuelta = roundTrip(contenido);
  assert.equal(vuelta.albumMessage.expectedImageCount, 2);
});

test("cada foto queda colgada del álbum padre", () => {
  const hijo = { imageMessage: { url: "https://x" } };
  asociarAlAlbum(hijo, { id: "PADRE", remoteJid: "1@g.us", fromMe: true });

  const asociacion = hijo.messageContextInfo.messageAssociation;
  assert.equal(asociacion.associationType, TIPO_ALBUM);
  assert.equal(asociacion.parentMessageKey.id, "PADRE");

  const vuelta = roundTrip(hijo);
  assert.equal(vuelta.messageContextInfo.messageAssociation.associationType, 1);
  assert.equal(vuelta.messageContextInfo.messageAssociation.parentMessageKey.id, "PADRE");
});

test("la portada de evento usa su propio tipo de asociación", () => {
  const hijo = { imageMessage: { url: "https://x" } };
  asociarAlAlbum(hijo, { id: "EVENTO" }, TIPO_PORTADA_EVENTO);
  assert.equal(hijo.messageContextInfo.messageAssociation.associationType, 3);
  assert.throws(() => asociarAlAlbum(hijo, {}), /padre/);
});

test("sendAlbum y sendEventCover devuelven el fallo en vez de lanzarlo", async () => {
  const r1 = await sendAlbum({}, "1@g.us", ["a", "b"]);
  assert.equal(r1.sent, false);
  const r2 = await sendAlbum(socketFalso(), "1@g.us", ["solo-una"]);
  assert.equal(r2.sent, false);
  assert.match(String(r2.error?.message), /pocos/);
  const r3 = await sendEventCover(socketFalso(), "1@g.us", "foto.jpg", {});
  assert.equal(r3.sent, false);
});

// ── 4. Tarjeta estilo Meta AI ──────────────────────────────────────

test("el resaltador reconoce claves, textos, números y comentarios", () => {
  const bloques = tokenizeCode('const a = "hola"; // fin\nlog(42)', "javascript");
  const tipos = new Set(bloques.map((b) => b.highlightType));
  assert.ok(tipos.has(COLOR_CODIGO.CLAVE), "no marcó 'const'");
  assert.ok(tipos.has(COLOR_CODIGO.TEXTO), "no marcó el texto entre comillas");
  assert.ok(tipos.has(COLOR_CODIGO.NUMERO), "no marcó el 42");
  assert.ok(tipos.has(COLOR_CODIGO.COMENTARIO), "no marcó el comentario");
  assert.equal(bloques.map((b) => b.codeContent).join(""), 'const a = "hola"; // fin\nlog(42)');
});

test("los bloques salen con el tipo que espera el protocolo", () => {
  assert.equal(texto("hola").messageType, SUB.TEXTO);
  assert.equal(tabla([["a"]]).messageType, SUB.TABLA);
  assert.equal(codigo("x", "python").messageType, SUB.CODIGO);
  assert.equal(rejilla(["u"]).messageType, SUB.REJILLA);
  assert.equal(imagen("u", { pie: "p" }).messageType, SUB.IMAGEN);
});

test("la primera fila de la tabla es cabecera salvo que se diga lo contrario", () => {
  const conCabecera = tabla([["#", "Nombre"], ["1", "Rio"]]);
  assert.equal(conCabecera.tableMetadata.rows[0].isHeading, true);
  assert.equal(conCabecera.tableMetadata.rows[1].isHeading, false);

  const sinCabecera = tabla([["1", "Rio"]], { cabecera: false });
  assert.equal(sinCabecera.tableMetadata.rows[0].isHeading, false);
});

test("buildRichContent exige bloques y añade aviso y sugerencias", () => {
  assert.throws(() => buildRichContent([]), /bloques/);

  const contenido = buildRichContent([texto("hola")], {
    disclaimer: "Shin-MD",
    sugerencias: ["Menú", "Perfil"],
  });
  const meta = contenido.messageContextInfo.botMetadata;
  assert.equal(meta.messageDisclaimerText, "Shin-MD");
  assert.deepEqual(meta.suggestedPromptMetadata.suggestedPrompts, ["Menú", "Perfil"]);
  assert.equal(meta.suggestedPromptMetadata.promptSuggestions.suggestions[1].prompt, "Perfil");
});

test("sin aviso ni sugerencias no se manda botMetadata vacío", () => {
  const contenido = buildRichContent([texto("hola")]);
  assert.equal(contenido.messageContextInfo, undefined);
});

test("el JSON de unifiedResponse describe los mismos bloques", () => {
  const bloques = [texto("hola"), tabla([["a", "b"], ["1", "2"]]), codigo("x=1", "python")];
  const unified = buildUnified(bloques, "id-1");
  assert.equal(unified.response_id, "id-1");
  assert.equal(unified.sections.length, 3);
  assert.equal(unified.sections[0].view_model.primitive.__typename, "GenAIMarkdownTextUXPrimitive");
  assert.equal(unified.sections[1].view_model.primitive.rows[0].is_header, true);
  assert.deepEqual(unified.sections[1].view_model.primitive.rows[1].cells, ["1", "2"]);
  assert.equal(unified.sections[2].view_model.primitive.language, "python");
});

test("la tarjeta completa sobrevive al protobuf con tabla y código dentro", () => {
  const contenido = buildRichContent(
    [texto("*Top*"), tabla([["#", "Nombre"], ["1", "Rio"]]), codigo('log("ok")', "javascript")],
    { disclaimer: "Shin-MD", sugerencias: ["Otra vez"] },
  );
  const vuelta = roundTrip(contenido);
  const rich = vuelta.richResponseMessage;

  assert.equal(rich.messageType, 1);
  assert.equal(rich.submessages.length, 3);
  assert.equal(rich.submessages[1].tableMetadata.rows[0].items[1], "Nombre");
  assert.equal(rich.submessages[2].codeMetadata.codeLanguage, "javascript");
  assert.equal(vuelta.messageContextInfo.botMetadata.messageDisclaimerText, "Shin-MD");

  const json = JSON.parse(Buffer.from(rich.unifiedResponse.data).toString("utf8"));
  assert.equal(json.sections.length, 3);
});

test("sendRich manda por relayMessage y no lanza si el socket está roto", async () => {
  const sock = socketFalso();
  const ok = await sendRich(sock, "1@g.us", [texto("hola")]);
  assert.equal(ok.sent, true);
  assert.equal(sock.enviados[0].tipo, "relay");
  assert.ok(sock.enviados[0].message.richResponseMessage);

  const mal = await sendRich({}, "1@g.us", [texto("hola")]);
  assert.equal(mal.sent, false);
});

// ── 5. Encuestas que nadie manda ───────────────────────────────────

test("parseQuiz entiende el asterisco como respuesta correcta", () => {
  const r = parseQuiz("¿Capital de Japón? | Kioto | *Tokio | Osaka");
  assert.equal(r.ok, true);
  assert.equal(r.pregunta, "¿Capital de Japón?");
  assert.deepEqual(r.opciones, ["Kioto", "Tokio", "Osaka"]);
  assert.equal(r.correcta, 1);
  assert.equal(parseQuiz("¿Sí? | No* | Sí").correcta, 0, "el asterisco al final también vale");
});

test("parseQuiz avisa de cada forma de escribirlo mal", () => {
  assert.equal(parseQuiz("").error, "faltan datos");
  assert.equal(parseQuiz("solo la pregunta").error, "faltan datos");
  assert.equal(parseQuiz("pregunta | *una").error, "pocas");
  assert.equal(parseQuiz("p | " + Array(MAX_OPCIONES + 1).fill("o").join(" | ")).error, "muchas");
  assert.equal(parseQuiz("pregunta | a | b").error, "sin correcta");
  assert.equal(parseQuiz("pregunta | *a | *b").error, "varias correctas");
});

test("el quiz lleva pollType QUIZ y la respuesta correcta", () => {
  const contenido = buildQuiz({ pregunta: "¿2+2?", opciones: ["3", "4", "5"], correcta: 1 });
  const encuesta = contenido.pollCreationMessageV3;

  assert.equal(encuesta.pollType, TIPO_QUIZ);
  assert.equal(encuesta.correctAnswer.optionName, "4");
  assert.equal(encuesta.selectableOptionsCount, 1);
  assert.equal(contenido.messageContextInfo.messageSecret.length, 32);

  const vuelta = roundTrip(contenido);
  assert.equal(vuelta.pollCreationMessageV3.pollType, 1);
  assert.equal(vuelta.pollCreationMessageV3.correctAnswer.optionName, "4");
  assert.equal(vuelta.pollCreationMessageV3.options.length, 3);
});

test("el quiz se niega a salir mal armado", () => {
  assert.throws(() => buildQuiz({ pregunta: "x", opciones: ["una"] }), /al menos 2/);
  assert.throws(() => buildQuiz({ pregunta: "x", opciones: Array(MAX_OPCIONES + 1).fill("o") }), /como mucho/);
  assert.throws(() => buildQuiz({ pregunta: "", opciones: ["a", "b"] }), /pregunta/);
  assert.throws(() => buildQuiz({ pregunta: "x", opciones: ["a", "b"], correcta: 9 }), /correcta/);
});

test("la encuesta con fotos se marca como de imagen", () => {
  const contenido = buildImagePoll({ pregunta: "¿Cuál?", opciones: ["A", "B"] });
  assert.equal(contenido.pollCreationMessageV3.pollContentType, CONTENIDO_IMAGEN);

  const multiple = buildImagePoll({ pregunta: "¿Cuáles?", opciones: ["A", "B", "C"], multiple: true });
  assert.equal(multiple.pollCreationMessage.selectableOptionsCount, 3);

  const vuelta = roundTrip(contenido);
  assert.equal(vuelta.pollCreationMessageV3.pollContentType, 2);
});

test("cada foto se cuelga de su opción por índice", () => {
  const hijo = { imageMessage: { url: "https://x" } };
  asociarFotoOpcion(hijo, { id: "ENCUESTA" }, 2);

  const asociacion = roundTrip(hijo).messageContextInfo.messageAssociation;
  assert.equal(asociacion.associationType, TIPO_FOTO_ENCUESTA);
  assert.equal(asociacion.messageIndex, 2);
  assert.throws(() => asociarFotoOpcion(hijo, {}), /encuesta/);
});

test("sendQuiz manda por relayMessage y sendImagePoll cuelga las fotos", async () => {
  const sock = socketFalso();
  const r = await sendQuiz(sock, "1@g.us", { pregunta: "¿2+2?", opciones: ["3", "4"], correcta: 1 });
  assert.equal(r.sent, true);
  assert.equal(sock.enviados[0].message.pollCreationMessageV3.pollType, 1);

  const malo = await sendQuiz(sock, "1@g.us", { pregunta: "x", opciones: ["una"] });
  assert.equal(malo.sent, false);

  const sinFotos = await sendImagePoll(socketFalso(), "1@g.us", {
    pregunta: "¿Cuál?", items: [{ texto: "A" }, { texto: "B" }],
  });
  assert.equal(sinFotos.sent, true);
  assert.equal(sinFotos.fotos, 0, "sin imagen no se cuelga nada, pero la encuesta sale");
});

// ── 6. Catálogo del laboratorio ────────────────────────────────────

test("todos los experimentos de contenido codifican contra el proto real", () => {
  const conContenido = EXPERIMENTOS.filter((e) => typeof e.construir === "function");
  assert.ok(conContenido.length >= 22, "se perdieron experimentos por el camino");

  for (const experimento of conContenido) {
    const contenido = experimento.construir({
      jid: "1@g.us",
      autor: "521555@s.whatsapp.net",
      urls: ["https://x/1.jpg"],
      quoted: CTX.full,
    });
    const vuelta = roundTrip(contenido);
    const campo = Object.keys(contenido).find((k) => k !== "messageContextInfo");
    assert.ok(vuelta[campo], `${experimento.clave}: se perdió ${campo} al codificar`);
  }
});

test("las tarjetas sueltas llevan los datos que se ven en pantalla", () => {
  assert.equal(buildTabla().richResponseMessage.submessages.length, 2);
  assert.equal(buildCodigo().richResponseMessage.submessages[1].messageType, SUB.CODIGO);
  assert.equal(buildChips().messageContextInfo.botMetadata.suggestedPromptMetadata.suggestedPrompts.length, 3);

  const llamada = buildLlamada({ titulo: "Anime", cuando: 1770000000000, video: false });
  assert.equal(llamada.scheduledCallCreationMessage.callType, 1);
  assert.equal(llamada.scheduledCallCreationMessage.scheduledTimestampMs, 1770000000000);

  const pago = buildPago({ monto: 50, moneda: "MXN" });
  assert.equal(pago.requestPaymentMessage.amount1000, 50000);
  assert.equal(pago.requestPaymentMessage.background.subtextArgb, 0xffff4fa3);

  const encuesta = buildEncuesta({ votos: [["Sí", 3], ["No", 1]] });
  assert.equal(encuesta.pollResultSnapshotMessage.pollVotes[0].optionVoteCount, 3);
});

test("las tarjetas nuevas llevan sus datos y se niegan a salir vacías", () => {
  assert.equal(buildQuizDemo().pollCreationMessageV3.correctAnswer.optionName, "Kenshi Yonezu");

  const etiqueta = buildEtiqueta({ jid: "521555@s.whatsapp.net", etiqueta: "Nivel 42" });
  assert.equal(etiqueta.extendedTextMessage.contextInfo.memberLabel.label, "Nivel 42");
  assert.deepEqual(etiqueta.extendedTextMessage.contextInfo.mentionedJid, ["521555@s.whatsapp.net"]);
  assert.equal(roundTrip(etiqueta).extendedTextMessage.contextInfo.memberLabel.label, "Nivel 42");

  const producto = buildProducto({ precio: 250, moneda: "MXN" });
  assert.equal(producto.productMessage.product.priceAmount1000, 250000);
  assert.equal(roundTrip(producto).productMessage.product.title, "Poción de vida");

  const comentario = buildComentario({ targetKey: { id: "OTRO", remoteJid: "1@g.us" }, cuerpo: "ole" });
  assert.equal(roundTrip(comentario).commentMessage.message.conversation, "ole");
  assert.throws(() => buildComentario({}), /comentar/);
});

test("la invitación necesita grupo y código de verdad", () => {
  assert.throws(() => buildInvitacion({}), /grupo/);
  const inv = buildInvitacion({ groupJid: "1@g.us", codigo: "ABC", nombre: "Shin" });
  assert.equal(inv.groupInviteMessage.inviteCode, "ABC");
  assert.ok(roundTrip(inv).groupInviteMessage.groupName === "Shin");
});

test("las zonas pinchables se guardan como polígonos en la imagen", () => {
  const imageMessage = { url: "https://x", mimetype: "image/jpeg" };
  anotarImagen(imageMessage, [{
    vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 0.5 }],
    lat: 19.6, lon: -99.05, nombre: "arriba",
  }]);

  const vuelta = roundTrip({ imageMessage });
  const zona = vuelta.imageMessage.interactiveAnnotations[0];
  assert.equal(zona.polygonVertices.length, 4);
  assert.equal(zona.location.name, "arriba");
  assert.throws(() => anotarImagen(null, []), /imageMessage/);
});

test("los experimentos se buscan por número y por nombre", () => {
  assert.equal(buscarExperimento("1"), EXPERIMENTOS[0]);
  assert.equal(buscarExperimento("tabla").clave, "tabla");
  assert.equal(buscarExperimento("999"), null);
  assert.equal(buscarExperimento(""), null);
  assert.equal(listarExperimentos().length, EXPERIMENTOS.length);
  assert.equal(listarExperimentos()[0].n, 1);
});

// ── 6. El comando ──────────────────────────────────────────────────

test(".lab sin argumentos lista todos los experimentos", async () => {
  const salida = await lab.handler(socketFalso(), { ...CTX, arg: "" });
  for (const e of EXPERIMENTOS) assert.ok(salida.includes(e.clave), `falta ${e.clave} en la lista`);
  assert.ok(salida.includes(".lab <número>"));
});

test(".lab con un nombre inventado explica cómo se usa", async () => {
  const salida = await lab.handler(socketFalso(), { ...CTX, arg: "trufa" });
  assert.match(salida, /No tengo ningún experimento/);
  assert.match(salida, /lab tabla/);
});

test(".lab tabla envía la tarjeta y dice qué mirar", async () => {
  const sock = socketFalso();
  const salida = await lab.handler(sock, { ...CTX, arg: "tabla" });
  assert.equal(sock.enviados.length, 1);
  assert.ok(sock.enviados[0].message.richResponseMessage);
  assert.match(salida, /Tabla nativa/);
});

test(".lab voz sin audio citado avisa en vez de romperse", async () => {
  const sock = socketFalso();
  const salida = await lab.handler(sock, { ...CTX, arg: "voz" });
  assert.equal(sock.enviados.length, 0);
  assert.match(salida, /responde a un audio/);
});

test(".lab es solo del dueño", () => {
  assert.equal(lab.ownerOnly, true);
  assert.equal(lab.name, "lab");
});

// ── 7. Panel de pasos nativo (lo de Meta AI) ───────────────────────

test("normalizarPasos traduce la lista cómoda a la del protocolo", () => {
  const [uno, dos] = normalizarPasos([
    { titulo: "Buscando", detalle: "3 resultados", estado: PASO.HECHO, razonando: true,
      fuentes: [{ titulo: "youtube.com", url: "https://youtu.be/x" }] },
    { titulo: "Bajando", secciones: [{ titulo: "Calidad", cuerpo: "128 kbps" }] },
  ]);

  assert.equal(uno.statusTitle, "Buscando");
  assert.equal(uno.status, PASO.HECHO);
  assert.equal(uno.isReasoning, true);
  assert.equal(uno.sourcesMetadata[0].sourceUrl, "https://youtu.be/x");
  assert.equal(dos.status, PASO.PLANEADO, "sin estado, el paso está planeado");
  assert.equal(dos.sections[0].sectionBody, "128 kbps");
});

test("el panel de pasos siempre lleva texto de respaldo", () => {
  assert.throws(() => buildStepsContent({ pasos: [] }), /pasos/);

  const contenido = buildStepsContent({
    descripcion: "Preparando",
    pasos: [{ titulo: "Buscando", estado: PASO.EJECUTANDO }],
  });
  assert.ok(contenido.extendedTextMessage.text, "sin texto no se lee nada si el panel no se dibuja");

  const vuelta = roundTrip(contenido);
  const panel = vuelta.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.equal(panel.progressDescription, "Preparando");
  assert.equal(panel.stepsMetadata[0].status, 2);
});

test("la edición mete el contenido nuevo entero, panel incluido", () => {
  assert.throws(() => buildStepsEdit(null, {}), /clave/);

  const contenido = buildStepsContent({ pasos: [{ titulo: "Listo", estado: PASO.HECHO }] });
  const edicion = buildStepsEdit({ id: "MSG1", remoteJid: "1@g.us", fromMe: true }, contenido, 1770000000000);

  assert.equal(edicion.protocolMessage.type, TIPO_EDICION);
  const vuelta = roundTrip(edicion);
  assert.equal(vuelta.protocolMessage.type, 14);
  assert.equal(
    vuelta.protocolMessage.editedMessage.messageContextInfo.botMetadata.progressIndicatorMetadata.stepsMetadata[0].status,
    3,
  );
});

test("el texto de respaldo marca cada paso con su símbolo", () => {
  const salida = renderPasosTexto([
    { titulo: "Uno", estado: PASO.HECHO },
    { titulo: "Dos", detalle: "en ello", estado: PASO.EJECUTANDO },
    { titulo: "Tres", estado: PASO.PLANEADO },
  ], "Trabajando");
  assert.match(salida, /\*Trabajando\*/);
  assert.match(salida, /● Uno/);
  assert.match(salida, /◐ Dos · en ello/);
  assert.match(salida, /○ Tres/);
});

test("el panel vivo se manda una vez y luego solo se edita", async () => {
  const sock = socketFalso();
  const panel = createNativeSteps(sock, "1@g.us", { minGapMs: 0, descripcion: "Descargando" });

  assert.equal(await panel.start([{ titulo: "Buscar" }, { titulo: "Bajar" }, { titulo: "Enviar" }]), true);
  assert.equal(sock.enviados.length, 1, "el arranque es un envío normal");
  assert.ok(panel.alive());

  await panel.avanzar(1, { detalle: "4.2 MB" });
  assert.equal(sock.enviados.length, 2);
  assert.equal(sock.enviados[1].message.protocolMessage.type, 14, "avanzar edita, no manda otro mensaje");

  const pasos = sock.enviados[1].message.protocolMessage.editedMessage
    .messageContextInfo.botMetadata.progressIndicatorMetadata.stepsMetadata;
  assert.equal(pasos[0].status, PASO.HECHO);
  assert.equal(pasos[1].status, PASO.EJECUTANDO);
  assert.equal(pasos[1].statusBody, "4.2 MB");
  assert.equal(pasos[2].status, PASO.PLANEADO);

  await panel.finish();
  const finales = sock.enviados[2].message.protocolMessage.editedMessage
    .messageContextInfo.botMetadata.progressIndicatorMetadata.stepsMetadata;
  assert.ok(finales.every((p) => p.status === PASO.HECHO));
  assert.equal(panel.alive(), false);

  await panel.avanzar(0);
  assert.equal(sock.enviados.length, 3, "cerrado ya no toca el chat");
});

test("el panel vivo no se cae si el socket falla", async () => {
  const panel = createNativeSteps({}, "1@g.us", { minGapMs: 0 });
  assert.equal(await panel.start([{ titulo: "Uno" }]), false);
  assert.equal(await panel.avanzar(0), false);
  assert.equal(panel.key(), null);
});

// ── 8. Bloques nuevos de la tarjeta rica ───────────────────────────

test("el carrusel de vídeos guarda portada, título y enlace", () => {
  const bloque = reels([{ titulo: "Idol", miniatura: "https://x/t.jpg", video: "https://x/v.mp4", perfil: "https://x/p.jpg" }]);
  const vuelta = roundTrip(buildRichContent([bloque]));
  const item = vuelta.richResponseMessage.submessages[0].contentItemsMetadata.itemsMetadata[0].reelItem;
  assert.equal(item.title, "Idol");
  assert.equal(item.thumbnailUrl, "https://x/t.jpg");
  assert.equal(item.videoUrl, "https://x/v.mp4");
});

test("el mapa centra solo y numera las chinchetas", () => {
  const bloque = mapa({ puntos: [{ lat: 10, lon: 20, titulo: "A" }, { lat: 20, lon: 40, titulo: "B" }] });
  assert.equal(bloque.mapMetadata.centerLatitude, 15);
  assert.equal(bloque.mapMetadata.centerLongitude, 30);
  assert.equal(bloque.mapMetadata.annotations[1].annotationNumber, 2);
  assert.throws(() => mapa({ puntos: [] }), /punto/);

  const vuelta = roundTrip(buildRichContent([bloque]));
  assert.equal(vuelta.richResponseMessage.submessages[0].mapMetadata.annotations.length, 2);
});

test("las fórmulas viajan con su tamaño", () => {
  const bloque = latex("{{0}}", [{ expr: "E=mc^2", ancho: 140, alto: 44 }]);
  const vuelta = roundTrip(buildRichContent([bloque]));
  const expr = vuelta.richResponseMessage.submessages[0].latexMetadata.expressions[0];
  assert.equal(expr.latexExpression, "E=mc^2");
  assert.equal(expr.width, 140);
});

test("las citas salen numeradas con su favicon", () => {
  assert.equal(fuentes([]), null);

  const contenido = buildRichContent([texto("hola")], {
    citas: [{ url: "https://es.wikipedia.org", favicon: "https://x/f.ico", proveedor: PROVEEDOR_FUENTE.GOOGLE }],
  });
  const vuelta = roundTrip(contenido);
  const fuente = vuelta.messageContextInfo.botMetadata.richResponseSourcesMetadata.sources[0];
  assert.equal(fuente.citationNumber, 1);
  assert.equal(fuente.faviconCdnUrl, "https://x/f.ico");
  assert.equal(fuente.provider, PROVEEDOR_FUENTE.GOOGLE);
});

test("el catálogo es una lista de tipo PRODUCT_LIST", () => {
  const contenido = buildCatalogo({ vendedor: "1@s.whatsapp.net" });
  const vuelta = roundTrip(contenido);
  assert.equal(vuelta.listMessage.listType, 2);
  assert.equal(vuelta.listMessage.productListInfo.productSections[0].products.length, 2);
});

// ── 9. La cola no debe cobrar cuota por editar ─────────────────────

test("esRelayLigero reconoce lo que no crea mensaje nuevo", () => {
  assert.equal(esRelayLigero({ protocolMessage: { type: 14 } }), true, "edición");
  assert.equal(esRelayLigero({ protocolMessage: { type: 0 } }), true, "borrado");
  assert.equal(esRelayLigero({ reactionMessage: { text: "✅" } }), true);
  assert.equal(esRelayLigero({ protocolMessage: { type: 5 } }), false);
  assert.equal(esRelayLigero({ extendedTextMessage: { text: "hola" } }), false);
  assert.equal(esRelayLigero(null), false);
});

// ── 10. Propina de la tercera excavación ───────────────────────────

test("una zona de la foto puede abrir un enlace o llevar canción", () => {
  const img = anotarImagen({ url: "https://x", mimetype: "image/jpeg" }, [
    { vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 0.5 }],
      nombre: "Escuchar", enlace: "https://youtu.be/x" },
    { vertices: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      cancion: { titulo: "Idol", autor: "YOASOBI" } },
    { vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }], lat: 19.6, lon: -99.05, nombre: "Ecatepec" },
  ]);

  const zonas = roundTrip({ imageMessage: img }).imageMessage.interactiveAnnotations;
  assert.equal(zonas[0].tapAction.tapUrl, "https://youtu.be/x");
  assert.equal(zonas[1].embeddedContent.embeddedMusic.artistAttribution, "YOASOBI");
  assert.equal(zonas[2].location.name, "Ecatepec");
  assert.throws(() => anotarImagen(null, []), /imageMessage/);
});

test("cualquier mensaje admite botón de enlace y mención de grupo", () => {
  const ctx = conMencionDeGrupo(
    conBotonEnlace({}, { url: "https://github.com/riokuroxi-svg/Shin-MD", texto: "Ver el repo" }),
    [{ jid: "1203@g.us", nombre: "Shin-MD" }],
  );
  const vuelta = roundTrip({ extendedTextMessage: { text: "mira @grupo", contextInfo: ctx } });
  assert.equal(vuelta.extendedTextMessage.contextInfo.actionLink.buttonTitle, "Ver el repo");
  assert.equal(vuelta.extendedTextMessage.contextInfo.groupMentions[0].groupSubject, "Shin-MD");
  assert.throws(() => conBotonEnlace({}, {}), /url/);
  assert.deepEqual(conMencionDeGrupo({ a: 1 }, []), { a: 1 });
});
