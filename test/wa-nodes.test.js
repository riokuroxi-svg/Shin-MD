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
// Estas pruebas vigilan las dos piezas que se compararon contra el cliente
// oficial (y contra el nodo que arma la propia librería):
//
//   1. El nodo `biz` de respaldo lleva `decision_id` y `<decision_source/>`.
//   2. Sigue habiendo UN solo `biz` (dos hacen que WhatsApp descarte el
//      mensaje sin avisar) y el `bot` va solo en privados.
//   3. El formato «plantilla» envuelve la tarjeta sin perderla.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nodosInteractivos,
  nodosInteractivosAsync,
  nodoBizPropio,
  esPrivado,
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
  assert.equal(interactive.content[0].attrs.name, "mixed");
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
  assert.match(src, /interactiveMessageTemplate/, "existe el envoltorio de plantilla");
  assert.match(src, /nodosInteractivosAsync/, "el nodo biz lo pregunta a la librería");
  assert.doesNotMatch(src, /const buildBizNode/, "ya no se arma a mano en el envío");
});
