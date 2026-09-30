/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  tanda5.test.js — Traducción
//
//  Nada de estas pruebas toca internet: el fetch se inyecta. Así la
//  suite no depende de que Google esté de buenas (que no lo está:
//  devuelve 429 muy a menudo, y por eso hay un segundo proveedor).
// ═══════════════════════════════════════════════════════════════════

import test from "node:test";
import assert from "node:assert/strict";
import { proto } from "baileys";

import {
  IDIOMAS, MAX_TEXTO, resolverIdioma, nombreIdioma, banderaIdioma,
  parsePeticion, parseGoogle, parseMyMemory, detectarIdioma,
  traducir, limpiarCache, tamanoCache, debeTraducir, crearFreno,
  buildTraduccionContent, renderTraduccionTexto, sendTraduccion,
} from "#lib/translate";

import { decidir, idiomaDelChat } from "../cmds/group/autotraducir.js";

function respuesta(datos, ok = true, status = 200) {
  return { ok, status, json: async () => datos };
}
const GOOGLE_OK = [[["Buenos días", "Good morning", null, null, 10]], null, "en"];
const MYMEMORY_OK = { responseData: { translatedText: "Buenos días" }, responseStatus: 200 };

function socketFalso() {
  const enviados = [];
  return {
    enviados,
    user: { id: "1@s.whatsapp.net" },
    async relayMessage(jid, message, opts) { enviados.push({ tipo: "relay", jid, message }); return opts?.messageId; },
    async sendMessage(jid, contenido) { enviados.push({ tipo: "texto", jid, contenido }); return { key: { id: "X" } }; },
  };
}

const roundTrip = (c) => proto.Message.decode(proto.Message.encode(proto.Message.fromObject(c)).finish());

// ── 1. Idiomas como los escribe la gente ──────────────────────────

test("el idioma se entiende escrito de cualquier manera", () => {
  for (const entrada of ["en", "EN", "inglés", "ingles", "INGLES", "english", "en-US"]) {
    assert.equal(resolverIdioma(entrada), "en", `falla con "${entrada}"`);
  }
  assert.equal(resolverIdioma("japones"), "ja");
  assert.equal(resolverIdioma("português"), "pt");
  assert.equal(resolverIdioma("pt-BR"), "pt");
  assert.equal(resolverIdioma("klingon"), null);
  assert.equal(resolverIdioma(""), null);
  assert.equal(nombreIdioma("ja"), "japonés");
  assert.equal(banderaIdioma("ru"), "🇷🇺");
  assert.equal(banderaIdioma("xx"), "🌐");
  assert.ok(Object.keys(IDIOMAS).length >= 25);
});

test("la petición se entiende con y sin mensaje citado", () => {
  assert.deepEqual(parsePeticion(["inglés", "hola", "mundo"], ""),
    { ok: true, idioma: "en", texto: "hola mundo", recortado: false });
  assert.deepEqual(parsePeticion(["en"], "texto citado"),
    { ok: true, idioma: "en", texto: "texto citado", recortado: false });
  assert.deepEqual(parsePeticion([], "texto citado"),
    { ok: true, idioma: "es", texto: "texto citado", recortado: false });

  const solo = parsePeticion(["hola"], "");
  assert.equal(solo.ok, true);
  assert.equal(solo.texto, "hola", "una palabra suelta que no es idioma es el texto");

  assert.equal(parsePeticion([], "").ok, false);
  const largo = parsePeticion(["en", "a".repeat(MAX_TEXTO + 500)], "");
  assert.equal(largo.texto.length, MAX_TEXTO);
  assert.equal(largo.recortado, true);
});

// ── 2. Detector de idioma, sin red ────────────────────────────────

test("el detector acierta con los idiomas del grupo", () => {
  const casos = [
    ["Good morning, how are you doing today?", "en"],
    ["Hola a todos, ¿cómo va todo?", "es"],
    ["Bom dia, tudo bem com você?", "pt"],
    ["Bonjour, comment allez-vous", "fr"],
    ["Guten Morgen, wie geht es dir?", "de"],
    ["Ciao, come stai? Molto bene", "it"],
    ["おはようございます", "ja"],
    ["Привет, как дела", "ru"],
    ["안녕하세요", "ko"],
    ["مرحبا كيف حالك", "ar"],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(detectarIdioma(texto).codigo, esperado, `falla con "${texto}"`);
  }
  assert.equal(detectarIdioma("ok").codigo, null, "dos letras no dan para decidir");
  assert.equal(detectarIdioma("xkcd qwrt zzz").codigo, null, "si no sabe, lo dice");
});

// ── 3. Lectura de los dos proveedores ─────────────────────────────

test("se entienden las dos formas de respuesta", () => {
  assert.deepEqual(parseGoogle(GOOGLE_OK), { texto: "Buenos días", de: "en" });
  assert.deepEqual(parseGoogle([[["Hola, ", "Hi, "], ["¿qué tal?", "how are you?"]], null, "en-US"]),
    { texto: "Hola, ¿qué tal?", de: "en" }, "junta los trozos y recorta la región");
  assert.equal(parseGoogle(null), null);
  assert.equal(parseGoogle([[]]), null);

  assert.deepEqual(parseMyMemory(MYMEMORY_OK), { texto: "Buenos días", de: "" });
  assert.equal(parseMyMemory({ responseData: { translatedText: "x" }, responseStatus: 403 }), null);
  assert.equal(parseMyMemory({}), null);
});

// ── 4. La traducción y sus caídas ─────────────────────────────────

test("traduce con el primer proveedor y guarda en memoria", async () => {
  limpiarCache();
  let llamadas = 0;
  const fetchFalso = async () => { llamadas += 1; return respuesta(GOOGLE_OK); };

  const r = await traducir("Good morning", "es", { fetchImpl: fetchFalso });
  assert.equal(r.ok, true);
  assert.equal(r.texto, "Buenos días");
  assert.equal(r.de, "en");
  assert.equal(r.a, "es");
  assert.match(r.proveedor, /Google/);

  const otra = await traducir("Good morning", "es", { fetchImpl: fetchFalso });
  assert.equal(otra.cacheado, true, "la segunda no vuelve a salir a la red");
  assert.equal(llamadas, 1);
  assert.ok(tamanoCache() >= 1);
});

test("si el primero devuelve 429, tira del segundo", async () => {
  limpiarCache();
  const vistos = [];
  const fetchFalso = async (url) => {
    vistos.push(url);
    if (url.includes("googleapis")) return respuesta("<html>Sorry</html>", false, 429);
    return respuesta(MYMEMORY_OK);
  };

  const r = await traducir("Good morning", "es", { fetchImpl: fetchFalso });
  assert.equal(r.ok, true);
  assert.equal(r.texto, "Buenos días");
  assert.equal(r.proveedor, "MyMemory");
  assert.equal(vistos.length, 2, "probó los dos");
  assert.equal(r.de, "en", "MyMemory no dice el idioma: lo pone el detector");
  assert.equal(r.deAdivinado, true);
});

test("si fallan los dos, avisa en vez de lanzar", async () => {
  limpiarCache();
  const r = await traducir("hola", "en", { fetchImpl: async () => { throw new Error("sin internet"); } });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "sin internet");

  const lento = await traducir("hola", "en", {
    fetchImpl: (url, opciones) => new Promise((_, rechaza) => {
      opciones.signal.addEventListener("abort", () => {
        const e = new Error("abortado"); e.name = "AbortError"; rechaza(e);
      });
    }),
    timeoutMs: 20,
  });
  assert.equal(lento.ok, false);
  assert.equal(lento.motivo, "tiempo-agotado");

  assert.equal((await traducir("", "es")).motivo, "sin-texto");
  assert.equal((await traducir("hola", "klingon")).motivo, "idioma-desconocido");
});

// ── 5. Frenos del modo automático ─────────────────────────────────

test("no se traduce lo que no hace falta", () => {
  assert.equal(debeTraducir("Hola a todos, buenos días", { destino: "es" }).si, false,
    "si ya está en el idioma del grupo, ni se llama al traductor");
  assert.equal(debeTraducir("Good morning everyone, how are you", { destino: "es" }).si, true);
  assert.equal(debeTraducir("ok", { destino: "es" }).motivo, "muy-corto");
  assert.equal(debeTraducir("😂😂😂😂😂😂", { destino: "es" }).si, false);
  assert.equal(debeTraducir("https://x.com/algo", { destino: "es" }).motivo, "solo-enlace");
  assert.equal(debeTraducir(".play idol yoasobi", { destino: "es" }).motivo, "es-un-comando");
  assert.equal(debeTraducir("Good morning everyone", { destino: "" }).motivo, "sin-destino");
});

test("el freno corta las ráfagas y el abuso por hora", () => {
  const f = crearFreno({ huecoMs: 1000, porHora: 3 });
  const t = 1_000_000;
  assert.equal(f.permite("g1", t), true);
  assert.equal(f.permite("g1", t + 500), false, "demasiado seguido");
  assert.equal(f.permite("g1", t + 1200), true);
  assert.equal(f.permite("g1", t + 2400), true);
  assert.equal(f.permite("g1", t + 3600), false, "tope por hora");
  assert.equal(f.permite("g2", t + 3600), true, "el tope es por grupo");
  assert.equal(f.permite("g1", t + 3_700_000), true, "pasada la hora, se reinicia");
  f.olvidar("g1");
  assert.equal(f.tamano(), 1);
});

test("la decisión del hook junta todos los frenos", () => {
  const base = { texto: "Good morning everyone", idioma: "es" };
  assert.equal(decidir(base).si, true);
  assert.equal(decidir({ ...base, esGrupo: false }).motivo, "no-es-grupo");
  assert.equal(decidir({ ...base, esBot: true }).motivo, "es-del-bot");
  assert.equal(decidir({ ...base, esPrincipal: false }).motivo, "otro-bot-manda");
  assert.equal(decidir({ ...base, idioma: "" }).motivo, "apagado");

  assert.equal(idiomaDelChat({ autotr: "inglés" }), "en");
  assert.equal(idiomaDelChat({ autotr: "off" }), "");
  assert.equal(idiomaDelChat({}), "");
  assert.equal(idiomaDelChat(null), "");
});

// ── 6. La tarjeta ─────────────────────────────────────────────────

test("la tarjeta lleva banderas, aviso, fuente y botón de copiar", () => {
  const contenido = buildTraduccionContent({
    original: "Good morning", traduccion: "Buenos días", de: "en", a: "es",
    fuente: { url: "https://translate.googleapis.com", favicon: "https://f.ico" },
  });
  const v = roundTrip(contenido);

  assert.match(v.interactiveMessage.body.text, /🇬🇧 inglés/);
  assert.match(v.interactiveMessage.body.text, /🇪🇸 español/);
  assert.match(v.interactiveMessage.body.text, /Buenos días/);

  const botones = v.interactiveMessage.nativeFlowMessage.buttons;
  assert.equal(botones[0].name, "cta_copy");
  assert.equal(JSON.parse(botones[0].buttonParamsJson).copy_code, "Buenos días");

  const meta = v.messageContextInfo.botMetadata;
  assert.match(meta.messageDisclaimerText, /autom/i);
  assert.equal(meta.richResponseSourcesMetadata.sources[0].faviconCdnUrl, "https://f.ico");

  const sinBotones = buildTraduccionContent({ traduccion: "Buenos días", de: "en", a: "es", conBotones: false });
  assert.equal(sinBotones.interactiveMessage.nativeFlowMessage.buttons.length, 0);
  assert.throws(() => buildTraduccionContent({ traduccion: "  " }), /traducción/);
});

test("el respaldo en texto dice lo mismo sin tarjeta", () => {
  const t = renderTraduccionTexto({ traduccion: "Buenos días", de: "en", a: "es" });
  assert.match(t, /inglés/);
  assert.match(t, /español/);
  assert.match(t, /Buenos días/);
});

test("si la tarjeta no sale, cae al texto plano en vez de perderse", async () => {
  const sock = socketFalso();
  const ok = await sendTraduccion(sock, "1@g.us", { traduccion: "Buenos días", de: "en", a: "es" });
  assert.equal(ok.sent, true);
  assert.equal(ok.modo, "tarjeta");
  assert.equal(sock.enviados[0].tipo, "relay");

  const roto = {
    user: { id: "1@s.whatsapp.net" },
    enviados: [],
    async relayMessage() { throw new Error("relay caído"); },
    async sendMessage(jid, contenido) { this.enviados.push(contenido); return {}; },
  };
  const caida = await sendTraduccion(roto, "1@g.us", { traduccion: "Buenos días", de: "en", a: "es" });
  assert.equal(caida.sent, true);
  assert.equal(caida.modo, "texto");
  assert.match(roto.enviados[0].text, /Buenos días/);

  const muerto = await sendTraduccion({}, "1@g.us", { traduccion: "x" });
  assert.equal(muerto.sent, false);
});
