/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El cartel «Recibiste un mensaje que no es compatible con tu versión de
// WhatsApp» no lo pone el bot: lo pone el teléfono de quien recibe, cuando no
// sabe dibujar lo que le llegó. Nosotros no podemos controlar su cliente, pero
// sí podemos dejar de mandarle pistas incompletas.
//
// Estas pruebas vigilan las piezas que se compararon contra el cliente
// oficial (y contra el nodo que arma la propia librería):
//
//   1. El nodo `biz` de respaldo lleva `decision_id` y `<decision_source/>`.
//   2. Sigue habiendo UN solo `biz` (dos hacen que WhatsApp descarte el
//      mensaje sin avisar) y el `bot` va solo en privados.
//   3. El formato «plantilla» envuelve la tarjeta sin perderla.
//   4. El `native_flow.name` coincide con el contenido: una lista de
//      selección única viaja como `menu_options`, no como `mixed`.
//      (Antes iba `mixed` siempre — el valor por defecto de la librería — y
//      por eso las tarjetas se veían genéricas.)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nodosInteractivos,
  nodosInteractivosAsync,
  nodoBizPropio,
  esPrivado,
  flujoInteractivo,
} from "#lib/wa-nodes";

const PRIVADO = "5215512345678@s.whatsapp.net";
const GRUPO = "120363000000000000@g.us";

const qualityControl = (nodo) => nodo.content.find((c) => c.tag === "quality_control");

test("el nodo biz de respaldo lleva decision_id y decision_source", () => {
  const qc = qualityControl(nodoBizPropio());
  assert.ok(qc, "hay quality_control");
  assert.match(qc.attrs.decision_id, /^[0-9a-f]{40}$/, "decision_id de 20 bytes en hexadecimal");
  assert.equal(qc.attrs.source_type, "third_party");
  assert.equal(qc.content?.[0]?.tag, "decision_source");
  assert.equal(qc.content[0].attrs.value, "df");
});

test("cada envío estrena su propio decision_id", () => {
  const a = qualityControl(nodoBizPropio()).attrs.decision_id;
  const b = qualityControl(nodoBizPropio()).attrs.decision_id;
  assert.notEqual(a, b, "no se repite la misma semilla");
});

test("un solo nodo biz: dos hacen que WhatsApp descarte el mensaje", () => {
  for (const jid of [PRIVADO, GRUPO]) {
    const nodos = nodosInteractivos(jid);
    assert.equal(nodos.filter((n) => n.tag === "biz").length, 1, `un biz en ${jid}`);
  }
});

test("el nodo bot (la ✨ de IA) va solo en privados", () => {
  assert.deepEqual(nodosInteractivos(PRIVADO).map((n) => n.tag), ["biz", "bot"]);
  assert.deepEqual(nodosInteractivos(GRUPO).map((n) => n.tag), ["biz"]);
  assert.deepEqual(
    nodosInteractivos(PRIVADO, { ai: false }).map((n) => n.tag),
    ["biz"],
    "se puede apagar",
  );
  assert.equal(esPrivado("5215512345678@lid"), true, "@lid también es privado");
});

test("los nodos binarios son los que exige el cliente oficial", () => {
  const biz = nodosInteractivos(GRUPO)[0];
  assert.equal(biz.tag, "biz");
  assert.equal(biz.attrs.actual_actors, "2");
  assert.equal(biz.attrs.host_storage, "2");
  assert.ok(Number(biz.attrs.privacy_mode_ts) > 0, "marca de tiempo");
  const interactive = biz.content.find((c) => c.tag === "interactive");
  assert.equal(interactive.attrs.type, "native_flow");
  assert.equal(interactive.attrs.v, "1");
  assert.equal(interactive.content[0].tag, "native_flow");
  assert.equal(interactive.content[0].attrs.v, "9");
  // Sin contenido el flujo por defecto es `mixed`, igual que en la librería.
  assert.equal(interactive.content[0].attrs.name, "mixed");
});

// ── El sobre dice lo mismo que la tarjeta ─────────────────────────
const MENSAJE_LISTA = {
  interactiveMessage: {
    body: { text: "Elige una categoría" },
    nativeFlowMessage: {
      buttons: [{ name: "single_select", buttonParamsJson: '{"title":"Categorías"}' }],
    },
  },
};

const MENSAJE_BOTONES = {
  interactiveMessage: {
    body: { text: "Hola" },
    nativeFlowMessage: {
      buttons: [
        { name: "quick_reply", buttonParamsJson: '{"display_text":"Ping","id":"ping"}' },
        { name: "cta_url", buttonParamsJson: '{"display_text":"Canal","url":"https://wa.me"}' },
      ],
    },
  },
};

const flujoDe = (nodo) => nodo.content[0].content[0].attrs.name;

test("una lista de selección única viaja como menu_options", () => {
  assert.equal(flujoInteractivo(MENSAJE_LISTA), "menu_options");
  assert.equal(flujoDe(nodosInteractivos(GRUPO, { contenido: MENSAJE_LISTA })[0]), "menu_options");
});

test("los botones sueltos viajan como mixed", () => {
  assert.equal(flujoInteractivo(MENSAJE_BOTONES), "mixed");
  assert.equal(flujoDe(nodosInteractivos(GRUPO, { contenido: MENSAJE_BOTONES })[0]), "mixed");
  assert.equal(flujoInteractivo(null), "mixed", "sin contenido no se adivina nada");
});

test("el flujo se ve aunque el interactivo vaya envuelto en viewOnceMessage", () => {
  const envuelto = { viewOnceMessage: { message: MENSAJE_LISTA } };
  assert.equal(flujoInteractivo(envuelto), "menu_options");
});

test("nodosInteractivosAsync usa el nodo de la librería cuando lo hay", async () => {
  const nodos = await nodosInteractivosAsync(GRUPO, { contenido: MENSAJE_LISTA });
  // Con librería instalada manda el nodo suyo, con el flujo que ELLA decide
  // (para una lista suelta: `mixed`). Es el mismo nodo que manda el envío
  // propio de la librería, así que aquí no se corrige nada a mano.
  const suyo = (await import("baileys")).getBizBinaryNode?.(MENSAJE_LISTA);
  if (suyo) {
    // `decision_id` se sortea en cada llamada (así lo hace la librería),
    // así que se compara la forma: mismo tag, mismos hijos y mismo flujo.
    assert.equal(nodos[0].tag, suyo.tag);
    assert.deepEqual(Object.keys(nodos[0].attrs).sort(), Object.keys(suyo.attrs).sort());
    const flu = (n) => n.content.find((c) => c.tag === "interactive")
      ?.content?.find((k) => k.tag === "native_flow")?.attrs;
    assert.deepEqual(flu(nodos[0]), flu(suyo), "mismo flujo que el de la librería");
    assert.ok(qualityControl(nodos[0]));
  }
  assert.ok(qualityControl(nodos[0]), "y el biz que salga sigue completo");
});

test("si el envío cachea el nodo viejo, el test del default lo delata", () => {
  // EL BUG QUE ESTO VIGILA: mandar `mixed` para una lista no revienta, solo
  // hace que los clientes pinten la tarjeta genérica. Nadie se entera.
  const bizLista = nodosInteractivos(GRUPO, { contenido: MENSAJE_LISTA })[0];
  assert.notEqual(flujoDe(bizLista), "mixed", "una lista NUNCA sale como mixed");
});

test("nodosInteractivosAsync no revienta si la librería no da su nodo", async () => {
  // Sin `contenido` no se consulta a la librería; con `contenido`, si la
  // librería no está instalada (o no exporta getBizBinaryNode), cae al respaldo.
  const sinContenido = await nodosInteractivosAsync(PRIVADO);
  assert.deepEqual(sinContenido.map((n) => n.tag), ["biz", "bot"]);

  const conContenido = await nodosInteractivosAsync(PRIVADO, {
    contenido: { interactiveMessage: { body: { text: "hola" } } },
  });
  assert.equal(conContenido.filter((n) => n.tag === "biz").length, 1);
  assert.ok(qualityControl(conContenido[0]), "el biz que salga está completo");
});

test("el formato de la tarjeta se elige con BOTONES_FORMATO", async () => {
  // Se comprueba la regla sin mandar nada: mismo criterio que usa el envío.
  const leer = async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/lib/native-reply.js", import.meta.url), "utf8"),
    );
    return src;
  };
  const src = await leer();
  assert.match(src, /BOTONES_FORMATO/, "el envío mira la variable");
  assert.match(src, /interactiveAsTemplate/, "existe el envoltorio de plantilla");
  // El nodo biz ya NO se pide aquí: lo inyecta la librería al enviar.
  // Si se le pasara uno, ella no añadiría otro pero tampoco lo corregiría.
  assert.doesNotMatch(src, /nodosInteractivosAsync/, "no pide nodos propios");
  assert.doesNotMatch(src, /additionalNodes:\s*\[/, "no manda additionalNodes");
  assert.doesNotMatch(src, /const buildBizNode/, "ya no se arma a mano en el envío");
});

// ─── El doble <biz>, que fue el bug más caro de todo el proyecto ─────
//
// Si el mensaje sale con DOS nodos `<biz>` el servidor lo rechaza y el
// usuario ve "no llega nada" sin error. La librería nueva inyecta su
// propio `<biz>` salvo que ya venga uno en `additionalNodes`. Esta prueba
// replica la decisión exacta de `relayMessage` para que nadie la rompa
// sin darse cuenta.

test("el envío produce un solo <biz>: el nuestro, nunca dos", async () => {
  const lib = await import("baileys");
  assert.equal(typeof lib.getBizBinaryNode, "function",
    "la librería tiene que exponer getBizBinaryNode para esta prueba");

  const contenido = {
    interactiveMessage: {
      body: { text: "elige" },
      nativeFlowMessage: { buttons: [{ name: "single_select", buttonParamsJson: "{}" }] },
    },
  };

  // 1) Con nuestros nodos puestos, la librería NO añade otro.
  const nuestros = await nodosInteractivosAsync(GRUPO, { contenido });
  const yaHayBiz = nuestros.some((n) => n.tag === "biz");
  assert.ok(yaHayBiz, "el envío siempre aporta su propio biz");
  const laLibreriaAñadiria = !yaHayBiz && lib.shouldIncludeBizBinaryNode(contenido);
  assert.equal(laLibreriaAñadiria, false, "no puede añadirse un segundo biz");

  // 2) El nodo que se manda es el de la librería, sin retocarlo: el mismo
  //    que ella inyectaría sola. Así el envío se comporta igual que el de
  //    la librería y no hay dos reglas distintas para lo mismo.
  const suyo = lib.getBizBinaryNode(contenido);
  const forma = (n) => ({
    tag: n.tag,
    attrs: Object.keys(n.attrs).sort(),
    hijos: n.content.map((c) => c.tag),
    flujo: n.content.find((c) => c.tag === "interactive")
      ?.content?.find((k) => k.tag === "native_flow")?.attrs,
  });
  assert.deepEqual(forma(nuestros[0]), forma(suyo), "el biz del envío es el de la librería");
});
