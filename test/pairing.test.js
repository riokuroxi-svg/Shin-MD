/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  pairing.test.js — ¿El bot pide el código de vinculación cuando
//  arranca con --code?
//
//  Se probaba a mano: arrancar el bot, mirar la consola, esperar el
//  código. Eso no sirve como test (necesita teléfono y red) y por eso
//  este flujo nunca tuvo prueba. Ahora sí, gracias a dos costuras que
//  agregamos en socket.js: se puede pasar una fábrica de socket falsa
//  (deps.makeSocket) y un retardo más corto (pairingDelayMs).
//
//  OJO: aquí NO se llama a WhatsApp de verdad. Todo es un socket falso
//  en memoria. El número es inventado a propósito.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { connectSocket, formatearCodigoDeVinculacion } from "../src/core/socket.js";
import { normalizePhone, parseArgs, telefonoAleatorio } from "../src/lib/cli-args.js";

// ─── Piezas de mentira (pero con la misma forma que las de Baileys) ──

function eventosFalsos() {
  const mapa = new Map();
  return {
    on(ev, fn) {
      if (!mapa.has(ev)) mapa.set(ev, []);
      mapa.get(ev).push(fn);
    },
    emit(ev, ...args) {
      for (const fn of mapa.get(ev) || []) fn(...args);
    },
  };
}

/** Socket que registra lo que le pasa y no toca la red. */
function socketFalso(registro) {
  return {
    ev: eventosFalsos(),
    ws: { isOpen: true },
    user: null,
    requestPairingCode: async (phone) => {
      registro.llamadas.push(phone);
      return registro.codigo;
    },
    sendMessage: async () => ({}),
    relayMessage: async () => ({}),
    decodeJid: (j) => j,
    groupMetadata: async () => ({}),
    groupFetchAllParticipating: async () => ({}),
    logout: async () => {},
    end: () => {},
    waitForSocketOpen: async () => {},
    sendPresenceUpdate: async () => {},
  };
}

/**
 * Motor mínimo: connectSocket toca el motor para llevar la cuenta de
 * grupos, salud y estado. Se le da la misma forma que el real (vacío)
 * para poder arrancar sin levantar nada del bot.
 */
function motorFalso() {
  return {
    LIFECYCLE: { CONNECT: "connect" },
    transit() {},
    emit() {},
    onMessage() {},
    getHealth: () => ({ ok: true, groups: 0 }),
    getState: () => "connect",
    getSendQueue: () => ({ enqueue: async (fn) => fn(), inPriority: () => false }),
    resetBootTime() {},
    setGroupCount() {},
  };
}

/** Arranca connectSocket contra un socket falso y espera a que pida el código. */
async function arrancarConPairing({ numero, respuesta = "ABCD1234", retardo = 5 }) {
  const registro = { codigo: respuesta, llamadas: [] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-pairing-"));
  // Se intercepta la consola: lo que importa no es solo que el bot pida
  // el código, sino que el dueño pueda LEERLO en pantalla.
  const consolaOriginal = console.log;
  const salida = [];
  // eslint-disable-next-line require-atomic-updates -- es una prueba: la consola se devuelve en el finally
  console.log = (...a) => salida.push(a.join(" "));
  registro.salida = salida;
  try {
    const modulo = connectSocket(motorFalso(), {
      pairingNumber: numero,
      pairingMethod: "code",
      sessionDir: dir,
      pairingDelayMs: retardo,
      deps: {
        makeSocket: () => socketFalso(registro),
        fetchVersion: async () => ({ version: [2, 3000, 0] }),
      },
    });
    // connectSocket devuelve { start, getSocket }: el arranque real llama
    // a start() y deja la vinculación corriendo en segundo plano.
    await modulo.start();
    // Se le da tiempo al temporizador del pairing (5 ms + margen).
    await new Promise((r) => setTimeout(r, 120));
  } finally {
    console.log = consolaOriginal;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return registro;
}

// ─── Pruebas ─────────────────────────────────────────────────────────

test("con --code y un número: pide el código de vinculación", async () => {
  const args = parseArgs(["--code", "+525512345678"]);
  assert.equal(args.code, true, "debe reconocer la bandera --code");

  const registro = await arrancarConPairing({ numero: args.phone });
  assert.equal(registro.llamadas.length, 1, "debe pedir el código exactamente una vez");
  assert.equal(registro.llamadas[0], "5215512345678");
});

test("el número que se le pasa a WhatsApp es solo dígitos, sin +, espacios ni guiones", async () => {
  const registro = await arrancarConPairing({ numero: normalizePhone("+52 (55) 1234-5678") });
  assert.equal(registro.llamadas[0], "5215512345678");
  assert.match(registro.llamadas[0], /^\d+$/);
});

test("el código se formatea como XXXX-XXXX", () => {
  assert.equal(formatearCodigoDeVinculacion("ABCD1234"), "ABCD-1234");
  assert.equal(formatearCodigoDeVinculacion("12345678"), "1234-5678");
  assert.equal(formatearCodigoDeVinculacion(null), null);
  assert.equal(formatearCodigoDeVinculacion(""), "");
});

test("el código que se muestra en pantalla es el que devolvió WhatsApp", async () => {
  const registro = await arrancarConPairing({ numero: "5215512345678", respuesta: "WXYZ9876" });
  // eslint-disable-next-line no-control-regex -- quita los colores ANSI antes de comparar
  const pantalla = registro.salida.join("\n").replace(/\u001b\[[0-9;]*m/g, "");
  assert.match(pantalla, /Código de emparejamiento/, "debe avisar que hay un código");
  assert.match(pantalla, /WXYZ-9876/, "el código debe verse completo, no solo la etiqueta");
});

test("si WhatsApp no devuelve código, no se inventa nada", async () => {
  const registro = await arrancarConPairing({ numero: "5215512345678", respuesta: null });
  assert.equal(registro.llamadas.length, 1);
  assert.equal(formatearCodigoDeVinculacion(null), null, "sin código no hay nada que formatear");
});

test("sin --code no se pide ningún código (modo QR)", async () => {
  const args = parseArgs(["--qr"]);
  assert.equal(args.code, false);
  const registro = await arrancarConPairing({ numero: args.phone });
  assert.deepEqual(registro.llamadas, [], "el modo QR no debe pedir código");
});

test("normalizePhone respeta las reglas de México y Argentina", () => {
  assert.equal(normalizePhone("+52 55 1234 5678"), "5215512345678", "a México móvil le falta el 1");
  assert.equal(normalizePhone("5215512345678"), "5215512345678", "si ya trae el 1, no se toca");
  assert.equal(normalizePhone("521 55 1234 5678"), "5215512345678");
  assert.equal(normalizePhone("+54 11 2345 6789"), "5491123456789", "a Argentina móvil le falta el 9");
  assert.equal(normalizePhone("05491123456789"), "5491123456789", "sin ceros iniciales");
  assert.equal(normalizePhone("telefono"), "", "basura no produce número");
  assert.equal(normalizePhone(""), "");
});

test("un número inventado y distinto cada vez (así no se molesta a nadie)", () => {
  const a = telefonoAleatorio({ pais: "MX" });
  const b = telefonoAleatorio({ pais: "MX" });
  assert.match(a, /^521\d{10}$/);
  assert.match(b, /^521\d{10}$/);
  assert.notEqual(a, b, "dos números seguidos no deberían coincidir");

  // La semilla fija permite repetir una prueba que falle.
  const fijo = telefonoAleatorio({ pais: "AR", semilla: () => 0.5 });
  assert.equal(fijo, "549" + "5".repeat(10));
});
