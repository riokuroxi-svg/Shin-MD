/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
// ═══════════════════════════════════════════════════════════════════
//  tanda6.test.js — El cableado: lo que estaba en el laboratorio,
//  ahora en los comandos de todos los días.
//
//  Nada aquí toca la red ni WhatsApp: el socket es de mentira y se
//  revisa el mensaje exacto que se habría enviado.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSheetParams, MAX_BOTONES_VISIBLES, nodosInteractivos, sendInteractive,
  quickReply, ctaUrl, ctaCopy, ctaReminder, ctaLocation, ctaCall, ctaWebview,
} from "../src/commands/interactive.js";
import { createProgress } from "../src/lib/progress.js";
import { parsePeticionEncuesta, explicarError } from "../cmds/utils/encuesta.js";
import { planAlbum } from "../src/lib/album.js";

/** Socket de mentira: guarda lo que se le manda. */
function socketFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: "1@s.whatsapp.net" },
    async relayMessage(jid, message, opts) { enviados.push({ via: "relay", jid, message, opts }); return opts?.messageId; },
    async sendMessage(jid, content) { enviados.push({ via: "send", jid, content }); return { key: { id: "FAKE" } }; },
  };
}

// ── 1. La hoja inferior: el cuarto botón ya no se pierde ───────────
test("con tres botones o menos no hace falta hoja inferior", () => {
  const tres = [quickReply("A", "a"), quickReply("B", "b"), quickReply("C", "c")];
  assert.equal(buildSheetParams(tres), null);
  assert.equal(MAX_BOTONES_VISIBLES, 3);
});

test("a partir del cuarto botón se pide la hoja inferior", () => {
  const cuatro = [quickReply("A", "a"), quickReply("B", "b"), quickReply("C", "c"), ctaUrl("D", "https://x.dev")];
  const params = buildSheetParams(cuatro, { titulo: "Más", boton: "Ver todo", divisiones: [2] });
  assert.equal(typeof params, "string", "messageParamsJson tiene que ser una CADENA");
  const j = JSON.parse(params);
  assert.equal(j.has_multiple_buttons, true);
  assert.equal(j.bottom_sheet.in_thread_buttons_limit, 3);
  assert.equal(j.bottom_sheet.list_title, "Más");
  assert.equal(j.bottom_sheet.button_title, "Ver todo");
  assert.deepEqual(j.bottom_sheet.divider_indices, [2]);
});

test("los botones nuevos llevan el nombre y los campos que espera WhatsApp", () => {
  assert.equal(ctaReminder("Avísame").name, "cta_reminder");
  assert.equal(JSON.parse(ctaReminder("Avísame").buttonParamsJson).display_text, "Avísame");
  assert.equal(ctaLocation().name, "send_location");
  assert.equal(ctaCall("Llamar", "5215500000000").name, "cta_call");
  assert.equal(JSON.parse(ctaCall("Llamar", 5215500000000).buttonParamsJson).phone_number, "5215500000000");
  const web = ctaWebview("Repo", "https://github.com/riokuroxi-svg/Shin-MD");
  assert.equal(web.name, "open_webview");
  assert.equal(JSON.parse(web.buttonParamsJson).link.in_app_webview, true);
  assert.equal(JSON.parse(ctaCopy("Copiar", ".").buttonParamsJson).copy_code, ".");
});

// ── 2. El panel de pasos nativo del .play ──────────────────────────
test("el progreso con pasos manda UN mensaje y lo edita, como antes", async () => {
  const sock = socketFalso();
  const prog = createProgress(sock, "1@g.us", {
    descripcion: "Yoasobi · Idol",
    pasos: [{ titulo: "Buscando" }, { titulo: "Descargando" }, { titulo: "Enviando" }],
  });

  await prog.start({ title: "Descargando audio", detail: "Yoasobi · Idol", pct: 20 });
  await prog.finish({ title: "Listo", detail: "audio · 3:32", pct: 100 });

  assert.equal(prog.modo(), "nativo");
  assert.equal(sock.enviados.length, 2, "un envío y una edición: mismo coste que la barra vieja");

  const panel = sock.enviados[0].message.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.equal(panel.stepsMetadata.length, 3);
  assert.equal(panel.progressDescription, "Yoasobi · Idol");

  // Regla de oro: toda imagen (o panel) con respaldo en texto. Y ese
  // texto es la LISTA DE PASOS, no la barra vieja: en grupos WhatsApp
  // no admite el nodo `bot`, así que puede que el panel no se dibuje
  // y lo único que quede sea este texto. Tiene que valerse solo.
  const texto = sock.enviados[0].message.extendedTextMessage.text;
  assert.match(texto, /Yoasobi · Idol/, "lleva de qué va");
  assert.match(texto, /◐ Buscando/, "el paso en marcha, marcado");
  assert.match(texto, /○ Descargando/, "y los que faltan");

  const edicion = sock.enviados[1].message.protocolMessage;
  assert.equal(edicion.type, 14, "la edición es protocolMessage tipo 14");
  const fin = edicion.editedMessage.messageContextInfo.botMetadata.progressIndicatorMetadata;
  assert.ok(fin.stepsMetadata.every((p) => p.status === 3), "todos los pasos acaban completados");
  // El cierre también se lee: pasos en ● y el resumen debajo.
  const textoFinal = edicion.editedMessage.extendedTextMessage.text;
  assert.match(textoFinal, /● Enviando/);
  assert.match(textoFinal, /✅ Listo/);
});

test("si el panel nativo no sale, el progreso vuelve solo a la barra de texto", async () => {
  const roto = {
    user: { id: "1@s.whatsapp.net" },
    enviados: [],
    async relayMessage() { throw new Error("relay caído"); },
    async sendMessage(jid, content) { this.enviados.push(content); return { key: { id: "T" } }; },
  };
  const prog = createProgress(roto, "1@g.us", { pasos: [{ titulo: "Uno" }, { titulo: "Dos" }] });
  await prog.start({ title: "Descargando audio", detail: "prueba", pct: 20 });

  assert.equal(prog.modo(), "texto", "cae a la barra clásica sin romper el comando");
  assert.equal(roto.enviados.length, 1);
  assert.match(roto.enviados[0].text, /Descargando audio/);
});

// ── 3. .encuesta: quiz y voto múltiple ─────────────────────────────
test("una encuesta normal sigue siendo una encuesta normal", () => {
  const r = parsePeticionEncuesta("¿Qué pizza?|Pepperoni|Hawaiana|4 Quesos");
  assert.equal(r.ok, true);
  assert.equal(r.tipo, "encuesta");
  assert.equal(r.selectableCount, 1);
  assert.deepEqual(r.opciones, ["Pepperoni", "Hawaiana", "4 Quesos"]);
});

test("el asterisco convierte la encuesta en quiz nativo", () => {
  const r = parsePeticionEncuesta("¿Capital de Japón?|Kioto|*Tokio|Osaka");
  assert.equal(r.tipo, "quiz");
  assert.equal(r.correcta, 1);
  assert.deepEqual(r.opciones, ["Kioto", "Tokio", "Osaka"], "el asterisco no se ve en la opción");
});

test("multi delante deja votar varias opciones", () => {
  const r = parsePeticionEncuesta("multi ¿Qué días?|Lunes|Martes|Viernes");
  assert.equal(r.selectableCount, 3);
  assert.equal(r.pregunta, "¿Qué días?");
});

test("los errores de la encuesta se explican sin jerga", () => {
  assert.equal(parsePeticionEncuesta("").error, "vacio");
  assert.equal(parsePeticionEncuesta("solo texto").error, "sin-plecas");
  assert.equal(parsePeticionEncuesta("¿A?|Sola").error, "pocas");
  assert.equal(parsePeticionEncuesta("¿A?|*X|*Y").error, "varias correctas");
  assert.match(explicarError("varias correctas"), /una\* respuesta correcta/);
  assert.match(explicarError("pocas", "#"), /#encuesta/);
});

test("el quiz que sale por el cable es pollType 1 con su respuesta correcta", async () => {
  const { sendQuiz } = await import("../src/lib/poll-plus.js");
  const sock = socketFalso();
  const r = await sendQuiz(sock, "1@g.us", { pregunta: "¿Capital de Japón?", opciones: ["Kioto", "Tokio", "Osaka"], correcta: 1 });
  assert.equal(r.sent, true);
  const poll = sock.enviados[0].message.pollCreationMessageV3;
  assert.equal(poll.pollType, 1);
  assert.equal(poll.correctAnswer.optionName, "Tokio");
  assert.equal(poll.selectableOptionsCount, 1);
});

// ── 4. El álbum de .imagen (el comando que estaba roto) ────────────
test("las imágenes de .imagen tienen la forma que pide el álbum", () => {
  const medias = [
    { image: { url: "https://x/1.jpg" }, caption: "uno" },
    { image: { url: "https://x/2.jpg" }, caption: "dos" },
  ];
  const plan = planAlbum(medias);
  assert.equal(plan.ok, true);
  assert.equal(plan.imagenes, 2);
  assert.equal(plan.videos, 0);
});

test("el formato viejo de .imagen (type/data) ya no colaba", () => {
  // Así lo mandaba antes, a un método que ni existía en el bot.
  const viejo = [{ type: "image", data: { url: "https://x/1.jpg" } }, { type: "image", data: { url: "https://x/2.jpg" } }];
  assert.equal(planAlbum(viejo).ok, false);
});

test("el comando .imagen ya no llama a un método inexistente", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../cmds/downloads/imagen.js", import.meta.url), "utf8");
  assert.ok(!src.includes("sendAlbumMessage"), "sock.sendAlbumMessage no existe en este bot");
  assert.ok(src.includes("sendAlbum("), "usa la librería de álbum de verdad");
});

// ── 5. La nota de voz con onda propia ──────────────────────────────
test("cada texto firma una onda distinta y válida", async () => {
  const { waveformFromText, esWaveformValida, MUESTRAS } = await import("../src/lib/waveform.js");
  const a = waveformFromText("Hola, soy Shin");
  const b = waveformFromText("otra frase distinta");
  assert.equal(a.length, MUESTRAS);
  assert.ok(esWaveformValida(a));
  assert.notDeepEqual(Array.from(a), Array.from(b));
  assert.deepEqual(Array.from(a), Array.from(waveformFromText("Hola, soy Shin")), "la misma frase da siempre la misma onda");
});

// ── 6. Los nodos binarios: por qué los botones no salían en grupos ─
//
//  WhatsApp no rechaza un interactivo sin envoltorio: lo acepta y el
//  teléfono lo tira sin dibujar nada. Por eso parecía que "en grupos
//  no se puede" y se acabó mandando texto plano.
test("el envoltorio binario es el que espera WhatsApp", () => {
  const enGrupo = nodosInteractivos("1203630000@g.us");
  assert.equal(enGrupo.length, 1, "en grupo solo va el nodo biz");
  assert.equal(enGrupo[0].tag, "biz");
  const inter = enGrupo[0].content[0];
  assert.equal(inter.tag, "interactive");
  assert.deepEqual(inter.attrs, { type: "native_flow", v: "1" });
  assert.deepEqual(inter.content[0].attrs, { v: "9", name: "mixed" });
});

test("en privado se añade el nodo bot (el de la chispita de IA)", () => {
  const priv = nodosInteractivos("52155@s.whatsapp.net");
  assert.equal(priv.length, 2);
  assert.deepEqual(priv[1], { tag: "bot", attrs: { biz_bot: "1" } });
  // y se puede pedir sin la chispita
  assert.equal(nodosInteractivos("52155@s.whatsapp.net", { ai: false }).length, 1);
});

test("en un GRUPO ya se manda el interactivo, no texto plano", async () => {
  const sock = socketFalso();
  await sendInteractive(sock, "1203630000@g.us", {
    body: "menú de grupo",
    buttons: [quickReply("A", "a"), quickReply("B", "b")],
  });
  assert.equal(sock.enviados.length, 1);
  assert.equal(sock.enviados[0].via, "relay", "antes esto salía como texto plano");
  assert.equal(sock.enviados[0].opts.additionalNodes[0].tag, "biz");
});

test("los canales siguen recibiendo texto: ahí no hay botones que valgan", async () => {
  const sock = socketFalso();
  await sendInteractive(sock, "12036@newsletter", { body: "aviso", buttons: [quickReply("A", "a")] });
  assert.equal(sock.enviados[0].via, "send");
});

test("SHIN_BOTONES_GRUPO=0 devuelve los grupos a texto plano", async () => {
  const sock = socketFalso();
  process.env.SHIN_BOTONES_GRUPO = "0";
  try {
    await sendInteractive(sock, "1203630000@g.us", { body: "hola", buttons: [quickReply("A", "a")] });
    assert.equal(sock.enviados[0].via, "send", "el interruptor de emergencia funciona");
  } finally {
    delete process.env.SHIN_BOTONES_GRUPO;
  }
});

test("las encuestas relayeadas a mano llevan la marca que pone baileys", async () => {
  const { sendQuiz } = await import("../src/lib/poll-plus.js");
  const sock = socketFalso();
  await sendQuiz(sock, "1@g.us", { pregunta: "¿Sí o no?", opciones: ["Sí", "No"], correcta: 0 });
  const nodos = sock.enviados[0].opts.additionalNodes;
  assert.deepEqual(nodos, [{ tag: "meta", attrs: { polltype: "creation" } }],
    "sin esta marca el servidor no la registra como encuesta nueva");
});

// ── 7. Por qué el .menu seguía saliendo en texto dentro del grupo ──
test("el menú ya no se salta la tarjeta cuando el chat es un grupo", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../cmds/main/menu.js", import.meta.url), "utf8");
  assert.ok(!src.includes("if (ctx.isGroup || menuVariant === 2)"),
    "esa condición mandaba TODOS los grupos a la rama de texto, antes de llegar a los botones");
  assert.ok(src.includes("if (menuVariant === 2)"));
});

test("el interactivo ya no se envuelve en viewOnce (era lo que mataba los botones)", async () => {
  const sock = socketFalso();
  await sendInteractive(sock, "1203630000@g.us", { body: "menú", buttons: [quickReply("A", "a")] });
  const enviado = sock.enviados[0].message;
  // Recordatorio: los campos ausentes del proto salen como null, no
  // como undefined. Por eso se comprueba el valor, no el tipo exacto.
  assert.ok(!enviado.viewOnceMessage, "envolver deja los botones grises o los borra");
  assert.ok(enviado.interactiveMessage, "el interactivo va en la raíz, como en native-reply");
});

test("con SHIN_INTERACTIVO_VIEWONCE=1 se puede volver al envoltorio viejo", async () => {
  const sock = socketFalso();
  process.env.SHIN_INTERACTIVO_VIEWONCE = "1";
  try {
    await sendInteractive(sock, "1203630000@g.us", { body: "x", buttons: [quickReply("A", "a")] });
    assert.ok(sock.enviados[0].message.viewOnceMessage?.message?.interactiveMessage);
  } finally {
    delete process.env.SHIN_INTERACTIVO_VIEWONCE;
  }
});

test("el envoltorio binario es el MISMO que usa el .play, que sí se ve", () => {
  // native-reply.js es el único camino cuyos botones aparecían en el
  // grupo del usuario. sendInteractive ahora manda nodos idénticos.
  const n = nodosInteractivos("1203630000@g.us")[0];
  assert.equal(n.attrs.actual_actors, "2");
  assert.equal(n.attrs.host_storage, "2");
  assert.match(n.attrs.privacy_mode_ts, /^\d+$/);
  assert.deepEqual(n.content.map((c) => c.tag), ["interactive", "quality_control"]);
  assert.equal(n.content[1].attrs.source_type, "third_party");
});

test("los chats @lid también cuentan como privados", () => {
  assert.equal(nodosInteractivos("52155@lid").length, 2, "WhatsApp ya usa @lid en privados");
  assert.equal(nodosInteractivos("1203630000@g.us").length, 1);
});

// ── 8. El panel de pasos también necesitaba el envoltorio ─────────
test("el panel de pasos viaja con sus nodos binarios", async () => {
  const { createProgress } = await import("../src/lib/progress.js");
  const enGrupo = socketFalso();
  const p1 = createProgress(enGrupo, "1203630000@g.us", { pasos: [{ titulo: "Uno" }, { titulo: "Dos" }] });
  await p1.start({ title: "x", pct: 10 });
  assert.deepEqual(enGrupo.enviados[0].opts.additionalNodes.map((n) => n.tag), ["biz"]);

  const enPrivado = socketFalso();
  const p2 = createProgress(enPrivado, "52155@s.whatsapp.net", { pasos: [{ titulo: "Uno" }, { titulo: "Dos" }] });
  await p2.start({ title: "x", pct: 10 });
  assert.deepEqual(enPrivado.enviados[0].opts.additionalNodes.map((n) => n.tag), ["biz", "bot"],
    "el nodo bot es el que hace que el cliente lea botMetadata");
});

test("la hoja inferior de native-params pide has_multiple_buttons", async () => {
  const { buildBottomSheet, buildMessageParams } = await import("../src/lib/native-params.js");
  const j = JSON.parse(buildMessageParams({ bottomSheet: buildBottomSheet({ inThreadLimit: 2, buttonTitle: "Más" }) }));
  assert.equal(j.has_multiple_buttons, true, "sin esto WhatsApp ignora la hoja");
  assert.equal(j.bottom_sheet.in_thread_buttons_limit, 2);
  // y sin hoja no se manda nada: un JSON vacío pinta una franja gris
  assert.equal(buildMessageParams({}), "");
});

test("la tarjeta del .play ya no pide que cites el mensaje con cuatro números", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../cmds/downloads/play.js", import.meta.url), "utf8");
  assert.ok(!src.includes("*3* = video como doc"), "aquel bloque de instrucciones sobraba");
  assert.ok(src.includes("Abrir en YouTube") && src.includes("Copiar enlace"),
    "la tarjeta estrena botones de enlace y de copiar");
  assert.ok(src.includes("buildBottomSheet"), "y la hoja para los que no caben");
});

// ── 9. Barrido: ningún interactivo puede salir sin envoltorio ─────
//
//  Esta es la prueba que faltaba. El verificador pilló que la tarjeta
//  de traducción se mandaba pelada y por eso sus botones no salían.
//  Ahora, si alguien añade otro sitio que relaye un interactivo sin
//  additionalNodes, la suite se queja aquí y no en el móvil de nadie.
test("todo módulo que relaye un interactivo pasa los nodos binarios", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../src/lib/", import.meta.url);
  const ficheros = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  const culpables = [];

  for (const f of ficheros) {
    const src = await readFile(new URL(f, dir), "utf8");
    const mandaInteractivo = src.includes("interactiveMessage") && src.includes("relayMessage");
    if (!mandaInteractivo) continue;
    if (!src.includes("additionalNodes")) culpables.push(f);
  }
  assert.deepEqual(culpables, [], "estos mandan botones que nadie va a ver");
});

test("el envoltorio está definido UNA vez y lo usan todos", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../src/lib/", import.meta.url);
  const ficheros = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  const copias = [];
  for (const f of ficheros) {
    if (f === "wa-nodes.js") continue;
    const src = await readFile(new URL(f, dir), "utf8");
    if (src.includes('tag: "biz"') || src.includes("tag: 'biz'")) copias.push(f);
  }
  assert.deepEqual(copias, [],
    "copiar el envoltorio es cómo se quedó la traducción sin botones");
});

test("#lib/wa-nodes hace lo que promete", async () => {
  const { nodosInteractivos, nodosEncuesta, esPrivado } = await import("../src/lib/wa-nodes.js");
  assert.equal(esPrivado("52155@s.whatsapp.net"), true);
  assert.equal(esPrivado("52155@lid"), true);
  assert.equal(esPrivado("1203630000@g.us"), false);
  assert.equal(nodosInteractivos("1203630000@g.us").length, 1);
  assert.equal(nodosInteractivos("52155@lid").length, 2);
  assert.equal(nodosInteractivos("52155@lid", { ai: false }).length, 1);
  assert.deepEqual(nodosEncuesta(), [{ tag: "meta", attrs: { polltype: "creation" } }]);
});

// ── 10. Los comandos recién cableados ─────────────────────────────
test(".guardar arma el keepInChatMessage correcto", async () => {
  const { puedeGuardarse, caducidadDelMensaje, enPalabras } = await import("../cmds/group/guardar.js");
  assert.equal(puedeGuardarse(null, 604800).motivo, "sin-cita");
  assert.equal(puedeGuardarse({ key: { id: "X" } }, 0).motivo, "sin-temporales");
  assert.equal(puedeGuardarse({ key: { id: "X" } }, 604800).si, true);

  const citado = { key: { id: "X" }, message: { extendedTextMessage: { contextInfo: { expiration: 604800 } } } };
  assert.equal(caducidadDelMensaje(citado), 604800);
  assert.equal(enPalabras(604800), "7 días");
  assert.equal(enPalabras(86400), "24 horas");

  const { buildKeep, GUARDAR } = await import("../src/lib/native-actions.js");
  assert.equal(buildKeep({ id: "X" }).keepInChatMessage.keepType, GUARDAR.GUARDAR);
  assert.equal(buildKeep({ id: "X" }, { deshacer: true }).keepInChatMessage.keepType, GUARDAR.DESHACER);
});

test(".acortar y .tourl entregan el enlace listo para copiar", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const f of ["../cmds/utils/acortar.js", "../cmds/utils/tourl.js"]) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(src.includes("ctaCopy"), f + " debería dejar copiar el enlace");
    assert.ok(src.includes("fallbackText"), f + " necesita respaldo en texto");
  }
});

// ── 11. El pase de estilo ─────────────────────────────────────────
//
//  El sistema de diseño existía desde hace tandas y lo usaban 9 de
//  212 comandos. El resto seguía con su adorno a mano. Como
//  reescribir 101 ficheros es la mejor forma de romper algo, el
//  texto se peina en el punto único de envío. Estas pruebas fijan
//  que el peinado sea cobarde: ante la duda, no toca nada.
test("estilizar da la cara de la casa a los avisos sueltos", async () => {
  const { estilizar } = await import("../src/lib/theme.js");

  const ayuda = estilizar("《✧》 Responde a una imagen con .tourl para subirlo.");
  assert.match(ayuda, /^💡 ─+/, "un 'responde a…' es una pista, no un error");
  assert.match(ayuda, /Responde a una imagen/);
  assert.ok(!ayuda.includes("《✧》"), "el adorno viejo se va");

  assert.match(estilizar("ꕥ No se pudo descargar el archivo."), /^❌/);
  assert.match(estilizar("《✧》 Solo el dueño puede hacer eso."), /^🔒/);
  assert.match(estilizar("✎ Tu descripción ha sido eliminada."), /^✅/);
  assert.match(estilizar("ꕥ Espera unos segundos."), /^🕐/);
});

test("estilizar NO toca lo que no debe", async () => {
  const { estilizar, boxMain, boxData } = await import("../src/lib/theme.js");

  const menu = boxMain("MENÚ", ["una línea", "otra"]);
  assert.equal(estilizar(menu), menu, "lo que ya es de la casa se queda igual");
  assert.equal(estilizar(boxData("DATOS", [["a", "b"]])), boxData("DATOS", [["a", "b"]]));

  const codigo = "《✧》 mira esto:\n```js\nconst x = 1;\n```";
  assert.equal(estilizar(codigo), codigo, "el código no se toca ni con adorno");

  const largo = "《✧》 " + "x".repeat(800);
  assert.equal(estilizar(largo), largo, "lo largo es una ficha, no un aviso");

  const normal = "Hola, esto es una respuesta cualquiera.";
  assert.equal(estilizar(normal), normal, "sin adorno no hay nada que arreglar");

  assert.equal(estilizar(""), "");
  assert.equal(estilizar(null), null);
  assert.equal(estilizar(42), 42);
});

test("el pase de estilo está enchufado en el punto único de envío", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/core/socket.js", import.meta.url), "utf8");
  assert.ok(src.includes("estilizar(c.text)"), "si no, los 212 comandos siguen cada uno a su aire");
  assert.ok(src.includes('SHIN_ESTILO'), "y con interruptor de emergencia");
});

test("los avisos de permisos los redacta el sistema, no el middleware", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/commands/middleware/permissions.js", import.meta.url), "utf8");
  assert.ok(src.includes('state("onlyOwner")'));
  assert.ok(src.includes('state("onlyAdmin")'));
  assert.ok(src.includes('state("botNotAdmin")'));
  assert.ok(!src.includes("Solo el dueño* puede usar"), "el texto a mano sobra");
});

test("ningún comando nuevo debería estrenar adornos a mano", async () => {
  // Aviso suave: los 531 mensajes viejos los peina el punto de envío,
  // pero lo nuevo debería nacer ya con state() o las cajas.
  const { readFile } = await import("node:fs/promises");
  for (const f of ["../cmds/group/guardar.js", "../cmds/group/pin.js", "../cmds/utils/ptv.js"]) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(!src.includes("《✧》"), f + " debería usar el sistema de diseño");
  }
});
