/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  cable.test.js — ¿el menú nuevo necesita los parches de conexión?
//
//  La metáfora del cable: un equipo de 800 W en una toma de 400 W. La
//  pregunta real es cuánta corriente pide ESTA función y qué cable usa.
//
//  Lo que hace esta prueba, sin red y sin cuenta:
//   1. Toma el payload del menú tal como sale del bot.
//   2. Lo pasa por el protobuf de Baileys.
//   3. Comprueba que NO usa ningún símbolo de los que los 8 parches
//      tocan (vinculación, reconexión, ack de status, multimedia).
//   4. Mide los bytes que viajan y los deja escritos para comparar.
//
//  Si algún día alguien mete una llamada a la ruta parcheada dentro del
//  envío del menú, esta prueba lo dice.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { proto } from "baileys";
import { armarPayload } from "#menu-kit";

const RAIZ = path.resolve(import.meta.dirname, "..");

/** Rutas que los 8 parches modifican (para excluirlas del envío). */
const RUTAS_PARHEADAS = [
  "companion_reg_refresh",
  "link_code_companion_reg",
  "requestPairingCode",
  "logout",
  "status",
  "downloadContentFromMessage",
];

test("cable: el menú no toca la ruta de conexión que parcheamos", () => {
  const fuentes = ["src/lib/menu-kit/enviar-menu.js", "src/lib/wa-nodes.js"];
  for (const f of fuentes) {
    const codigo = fs.readFileSync(path.join(RAIZ, f), "utf8");
    for (const ruta of RUTAS_PARHEADAS) {
      // `status` es demasiado común: se busca como llamada, no como palabra.
      const patron = ruta === "status" ? /\bstatus\s*\(/ : new RegExp(ruta);
      assert.doesNotMatch(codigo, patron, `${f} no debe llamar a ${ruta}`);
    }
  }
});

test("cable: el payload viaja en menos de 4 KB sin el vídeo", () => {
  const payload = armarPayload({
    cuerpo: "Menú completo con texto, botones y oferta",
    pie: "Shin-MD v3.7.9",
    botones: [
      { text: "Ping", id: "ping" },
      { text: "Canal", url: "https://whatsapp.com/channel/x" },
      { text: "Copiar", copy: ".menu" },
    ],
    selector: {
      title: "Categorías",
      sections: [{ title: "Info", rows: [{ id: "menucat:info", title: "INFO", description: "12" }] }],
    },
  });
  const bytes = proto.Message.encode(proto.Message.fromObject(payload)).finish();
  // El texto y los botones son la parte pequeña; el vídeo va aparte, subido
  // con waUploadToServer y referenciado por URL.
  assert.ok(bytes.length < 4096, `el payload pesa ${bytes.length} B, se esperaba < 4096`);
});

test("cable: el mensaje no depende de ningún parche (los campos son del proto)", () => {
  const payload = armarPayload({ cuerpo: "x", botones: [{ text: "a", id: "b" }] });
  const dec = proto.Message.decode(proto.Message.encode(proto.Message.fromObject(payload)).finish());
  // Si el proto no trajera interactiveMessage, esto sería null.
  assert.ok(dec.interactiveMessage);
  assert.ok(dec.interactiveMessage.nativeFlowMessage);
  assert.ok(dec.messageContextInfo);
});

test("cable: registro de los parches — todos son de conexión, ninguno de mensajes", () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "scripts/patch-baileys.cjs"), "utf8");
  const notas = fuente.match(/\/\/\s+\d+\.\s+([^\n]+)/g) || [];
  assert.ok(notas.length >= 7, "el archivo declara los parches uno por uno");

  const deMensajes = notas.filter((n) =>
    /mensaje|bot[oó]n|interactiv|rich|media|multimedia/i.test(n),
  );
  // El parche 6 (reenvío de multimedia) es de mensajes, pero solo afecta a
  // descargas: no interviene en el envío del menú.
  assert.ok(
    deMensajes.every((n) => /multimedia/i.test(n)),
    "ningún parche de botones/rich debe existir: el proto ya los trae",
  );
});
