/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  presencia.test.js — el «pensando…» se manda, se borra y no deja
//  basura aunque el trabajo falle. Se prueba con un socket falso.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { conAviso, avisarPensando, mantenerEscribiendo } from "#menu-kit/presencia";

/** Socket falso que apunta todo lo que le piden. */
function sockFalso() {
  const visto = { presencia: [], enviados: [], borrados: [] };
  return {
    visto,
    sendPresenceUpdate: async (estado) => visto.presencia.push(estado),
    sendMessage: async (jid, contenido) => {
      if (contenido.delete) {
        visto.borrados.push(contenido.delete);
        return { key: contenido.delete };
      }
      const m = { key: { id: "msg-" + visto.enviados.length, remoteJid: jid } };
      visto.enviados.push({ contenido, key: m.key });
      return m;
    },
  };
}

test("presencia: el aviso se manda primero y se borra al terminar", async () => {
  const sock = sockFalso();
  const r = await conAviso(sock, "521@s.whatsapp.net", async () => "LISTO", { aviso: "_pensando…_" });

  assert.equal(r, "LISTO");
  assert.equal(sock.visto.enviados.length, 1, "un solo aviso");
  assert.equal(sock.visto.enviados[0].contenido.text, "_pensando…_");
  assert.equal(sock.visto.borrados.length, 1, "el aviso se borró");
  assert.equal(sock.visto.borrados[0].id, sock.visto.enviados[0].key.id);
  assert.ok(sock.visto.presencia.includes("composing"), "mostró «escribiendo…»");
  assert.ok(sock.visto.presencia.includes("paused"), "y lo apagó al final");
});

test("presencia: si el trabajo falla, el aviso se borra igual y el error sube", async () => {
  const sock = sockFalso();
  await assert.rejects(
    conAviso(sock, "521@s.whatsapp.net", async () => { throw new Error("boom"); }),
    /boom/,
  );
  assert.equal(sock.visto.borrados.length, 1, "no queda un «pensando…» colgado");
});

test("presencia: THINKING=off lo apaga del todo", async () => {
  process.env.THINKING = "off";
  try {
    const sock = sockFalso();
    const { mensaje, borrar } = await avisarPensando(sock, "x@s.whatsapp.net");
    assert.equal(mensaje, null);
    assert.equal(sock.visto.enviados.length, 0);
    await borrar(); // no debe lanzar
  } finally {
    delete process.env.THINKING;
  }
});

test("presencia: mantenerEscribiendo deja de refrescar al parar", async () => {
  const sock = sockFalso();
  const parar = await mantenerEscribiendo(sock, "x@s.whatsapp.net", { cadaMs: 10 });
  assert.equal(sock.visto.presencia[0], "composing");
  await parar();
  assert.equal(sock.visto.presencia.at(-1), "paused");
  const antes = sock.visto.presencia.length;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sock.visto.presencia.length, antes, "ya no refresca");
});
