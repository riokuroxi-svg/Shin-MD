/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  rich.test.js — la tarjeta enriquecida se codifica con el proto real.
//
//  Lo que se comprueba no es «mi función devuelve esto», sino que el
//  mensaje **pasa por el protobuf de Baileys y vuelve intacto**: si el
//  proto del paquete no tuviera estos campos, esta prueba fallaría.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarBytes, comoTexto, texto, tabla, codigo, latex } from "#menu-kit/rich";

test("rich v2: texto, tabla y código sobreviven al protobuf", () => {
  const sub = [
    texto("Reporte de .menu"),
    tabla("Categorías", [["info", "12"], ["downloads", "31"]]),
    codigo("sock.sendMessage(jid, {text:'hola'})", "js"),
    latex("e^{i\\pi}+1=0"),
  ];
  const { bytes, decodificado } = armarBytes(sub);

  assert.ok(bytes.length > 0, "el mensaje tiene que ocupar bytes");
  const r = decodificado.botForwardedMessage?.message?.richResponseMessage;
  assert.ok(r, "tiene que venir dentro de botForwardedMessage → richResponseMessage");
  assert.equal(r.submessages.length, 4);
  assert.deepEqual(r.submessages.map((s) => s.messageType), [2, 4, 5, 8]);
  assert.equal(r.submessages[0].messageText, "Reporte de .menu");
  assert.equal(r.submessages[1].tableMetadata.rows[1].items[0], "downloads");
  assert.match(r.submessages[2].codeMetadata.codeBlocks[0].codeContent, /sendMessage/);
});

test("rich v2: cada submessage se puede leer como texto (el respaldo)", () => {
  const t = comoTexto([
    texto("hola"),
    tabla("T", [["a", "b"]]),
    codigo("console.log(1)"),
    latex("x^2"),
  ]);
  assert.match(t, /hola/);
  assert.match(t, /a {2}│ {2}b/);
  assert.match(t, /```console\.log\(1\)```/);
  assert.match(t, /x\^2/);
});

test("rich v2: sin submessages no revienta", () => {
  const { decodificado } = armarBytes([]);
  const r = decodificado.botForwardedMessage?.message?.richResponseMessage;
  assert.ok(r);
  assert.equal(r.submessages.length, 0);
  assert.equal(comoTexto([]), "");
});
