/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  consola-bot.test.js — la cara del bot en la terminal.
//
//  Lo que se prueba aquí no es «que imprima algo», es que la pantalla
//  quede derecha: que las cajas cuadren en un móvil de 40 columnas y en
//  un VPS de 80, que el código de vinculación se lea entero, que no
//  quede ni rastro de QR y que `--qr` (viejo) siga funcionando sin
//  sorpresas.
//
//  Todo son funciones puras: entra un objeto, sale texto. Nada de red.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const ui = await import(path.join(RAIZ, "src", "services", "consola.js"));
const { parseArgs } = await import(path.join(RAIZ, "src", "lib", "cli-args.js"));

const limpio = (s) => ui.sinColor(String(s));

// ───────────────────────── el banner ─────────────────────────

test("el banner dice quién es, la versión y el autor", () => {
  const b = limpio(ui.banner({ version: "3.7.0", node: "22.1.0", plataforma: "termux" }));
  assert.match(b, /S H I N - M D/);
  assert.match(b, /3\.7\.0/);
  assert.match(b, /riokuroxi-svg/);
  assert.match(b, /AGPL-3\.0-only/);
  assert.match(b, /termux/, "en un móvil tiene que decir que es un móvil");
});

test("el banner no usa bloques: se ve en la fuente de Termux", () => {
  const b = limpio(ui.banner({ version: "3.7.0" }));
  // Los caracteres de bloque (█ ▀ ▄) se ven mal en las fuentes de Android y
  // descuadran el ancho. La cabecera es de una sola columna.
  assert.doesNotMatch(b, /[█▀▄▓▒░]/, "sin arte de bloque en el banner");
  for (const linea of b.split("\n")) {
    assert.ok([...linea].length <= 58, `línea demasiado ancha: ${JSON.stringify(linea)}`);
  }
});

// ───────────────────────── las cajas ─────────────────────────

test("las cajas cuadran a cualquier ancho, también en 40 columnas", () => {
  for (const ancho of [40, 46, 58, 80]) {
    const caja = ui.caja({
      titulo: "prueba",
      ancho,
      lineas: ["una línea corta", "y otra que es bastante más larga que la anterior para forzar el corte"],
    });
    const anchos = new Set(caja.map((l) => ui.anchoVisible(l)));
    assert.equal(anchos.size, 1, `ancho ${ancho}: la caja quedó descuadrada (${[...anchos].join(", ")})`);
    assert.equal([...anchos][0], ancho, `ancho ${ancho}: la caja no ocupa el ancho`);
  }
});

test("una línea larga se parte sin cortar palabras", () => {
  const caja = limpio(ui.caja({ ancho: 40, lineas: ["memoria local con SQLite y respaldos"] }).join("\n"));
  assert.match(caja, /memoria local/);
  assert.match(caja, /SQLite/);
  // Ninguna línea pasa del ancho, y no queda una palabra partida por la mitad.
  for (const linea of caja.split("\n")) assert.ok([...linea].length <= 40);
  assert.doesNotMatch(caja, /SQLi\s*\n\s*te/, "no se corta una palabra");
});

test("lo que cabe tal cual conserva sus espacios (centrado del código)", () => {
  const caja = ui.caja({ ancho: 58, lineas: [ui.centrar("ABCD", 54)] });
  const medio = caja[1];
  const texto = limpio(medio);
  assert.match(texto, /^│\s+ABCD\s+│$/, "el centrado sobrevive a la caja");
  assert.equal(ui.anchoVisible(medio), 58);
});

// ───────────────────────── la vinculación ─────────────────────────

test("el panel de vinculación explica el camino sin hablar de QR", () => {
  const texto = limpio(ui.panelVinculacion().join("\n"));
  assert.match(texto, /No hay que escanear nada/);
  assert.match(texto, /Dispositivos vinculados/);
  assert.doesNotMatch(texto, /\bQR\b/, "el QR ya no se menciona");
});

test("el panel del código lo muestra entero, separado y con los pasos", () => {
  const salida = limpio(ui.panelCodigo({ numero: "5215512345678", codigo: "ABCD-1234" }));
  assert.match(salida, /tu código/);
  // Separado para que no se confunda 8 con B; al quitar los espacios vuelve
  // a ser el código exacto que hay que teclear.
  assert.match(salida.replace(/\s+/g, ""), /ABCD-1234/);
  assert.match(salida, /cuenta: 5215512345678/);
  assert.match(salida, /1\. abre WhatsApp/);
  assert.match(salida, /4\. teclea el código/);
});

test("el código se adapta a códigos de otras longitudes sin romper la caja", () => {
  for (const codigo of ["ABCD-1234", "A1B2C3D4", "12345678"]) {
    const lineas = ui.panelCodigo({ numero: "1", codigo }).split("\n");
    for (const linea of lineas) {
      assert.ok(ui.anchoVisible(linea) <= 58, `se pasa de ancho con ${codigo}: ${JSON.stringify(linea)}`);
    }
  }
});

test("el panel de «en línea» enseña cuenta, versión, comandos y panel web", () => {
  const salida = limpio(ui.panelListo({
    version: "3.7.0", nombre: "Shin-MD", comandos: 213, prefijo: ".", web: "http://127.0.0.1:3000",
  }));
  assert.match(salida, /en línea/);
  assert.match(salida, /Shin-MD/);
  assert.match(salida, /v3\.7\.0/);
  assert.match(salida, /213/);
  assert.match(salida, /127\.0\.0\.1:3000/);
});

test("las filas de estado llevan su icono y su color por tipo", () => {
  const ok = ui.estado("ok", "conectado");
  const aviso = ui.estado("aviso", "reintento");
  const error = ui.estado("error", "sin sesión");
  assert.match(limpio(ok), /^ {2}✓ conectado$/);
  assert.match(limpio(aviso), /^ {2}! reintento$/);
  assert.match(limpio(error), /^ {2}✕ sin sesión$/);
  assert.notEqual(ok, aviso, "cada tipo se pinta distinto");
});

// ───────────────────────── argumentos ─────────────────────────

test("--code con número lo normaliza; sin número lo deja para preguntar", () => {
  assert.equal(parseArgs(["--code", "+52 55 1234 5678"]).phone, "5215512345678");
  assert.equal(parseArgs(["--code"]).phone, "");
  assert.equal(parseArgs(["--code"]).code, true);
});

test("--qr sigue aceptándose, pero hace lo mismo que --code y avisa", () => {
  const args = parseArgs(["--qr"]);
  assert.equal(args.code, true);
  assert.equal(args.qrDeprecado, true);
  // Un guion viejo no se rompe: se comporta como el flujo nuevo.
  assert.equal(parseArgs(["--qr", "--menu"]).menu, true);
});

test("nada de la consola depende de que haya terminal", () => {
  // Todo esto tiene que poder ejecutarse con la salida por una tubería
  // (systemd, pm2, docker logs): son cadenas, no dibujos con cursor.
  const piezas = [
    ui.banner({ version: "x" }),
    ui.panelVinculacion().join("\n"),
    ui.panelCodigo({ numero: "1", codigo: "AAAA-1111" }),
    ui.panelListo({ version: "x" }),
    ui.pieTeclas(),
    ui.preguntaNumero(),
  ];
  for (const p of piezas) {
    // eslint-disable-next-line no-control-regex -- se buscan justo esos códigos
    assert.doesNotMatch(p, /\x1b\[[0-9;?]*[ABCDHJKfsu]/, "sin mover el cursor ni limpiar la pantalla");
  }
});

// ────────────────────── registro de mensajes ──────────────────────

test("cada mensaje ocupa una sola línea y no descoloca el ancho", () => {
  const linea = ui.mensaje({
    hora: "14:03:22",
    quien: "Ana Pérez",
    donde: "Familia ❀",
    texto: "hola",
  });
  assert.equal(linea.split("\n").length, 1, "un mensaje no puede ocupar un cuadro entero");
  assert.ok(ui.anchoVisible(linea) <= ui.ANCHO, `se pasa del ancho: ${ui.anchoVisible(linea)}`);

  // Un texto larguísimo se recorta en la misma línea, con puntos suspensivos.
  const largo = ui.mensaje({ hora: "14:04:02", quien: "Luis", texto: "x".repeat(400) });
  assert.equal(largo.split("\n").length, 1);
  assert.ok(ui.anchoVisible(largo) <= ui.ANCHO, `el recorte no respeta el ancho: ${ui.anchoVisible(largo)}`);
  assert.match(ui.sinColor(largo), /…»?\s*$/, "se corta con puntos suspensivos");
});

test("el registro distingue un comando de un mensaje y enseña lo que tardó", () => {
  const cmd = ui.sinColor(ui.mensaje({ hora: "14:03:29", quien: "Ana", texto: ".menu", comando: true, ms: 118 }));
  const txt = ui.sinColor(ui.mensaje({ hora: "14:03:22", quien: "Ana", texto: "hola" }));
  assert.match(cmd, /\.menu/);
  assert.match(cmd, /118 ms/);
  assert.match(txt, /«hola»/);
  assert.doesNotMatch(txt, /ms/, "un mensaje normal no tarda nada en contestarse");
});

// ───────────────────────── el conector ─────────────────────────

test("el conector ya no sabe dibujar QR", () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "src", "core", "socket.js"), "utf8");
  assert.doesNotMatch(fuente, /qrcode-terminal/, "no debe quedar la librería de QR");
  assert.doesNotMatch(fuente, /qrcode\.generate/, "ni la llamada que lo dibujaba");
  assert.match(fuente, /panelCodigo/, "el código se muestra con el panel de la casa");
});

test("el QR no se dibuja ni siquiera si el conector lo manda", async () => {
  // Se levanta un socket falso que emite un QR y se comprueba que la consola
  // no imprime ni un bloque: solo el aviso de que falta el número.
  const { connectSocket } = await import(path.join(RAIZ, "src", "core", "socket.js"));
  const salida = [];
  const consolaOriginal = console.log;
  const warnOriginal = console.warn;
  console.log = (...a) => salida.push(a.join(" "));
  console.warn = (...a) => salida.push(a.join(" "));
  try {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "shin-sinqr-"));
    const oyentes = {};
    const socketFalso = {
      ev: { on: (n, f) => { oyentes[n] = f; }, process: async () => {} },
      user: { id: "1", name: "prueba" },
      ws: { close() {} },
      end() {},
      logout: async () => {},
      sendPresenceUpdate: async () => {},
      waitForSocketOpen: async () => {},
      sendMessage: async () => ({}),
      relayMessage: async () => ({}),
      groupFetchAllParticipating: async () => ({}),
    };
    const motor = {
      LIFECYCLE: { CONNECT: "connect" },
      transit() {}, emit() {}, onMessage() {},
      getHealth: () => ({ ok: true }), getState: () => "connect",
      getSendQueue: () => ({ enqueue: async (f) => f(), inPriority: () => false }),
      resetBootTime() {}, setGroupCount() {},
    };
    const modulo = connectSocket(motor, {
      pairingNumber: "",           // sin número: justo el caso del QR
      pairingMethod: "code",
      sessionDir: dir,
      pairingDelayMs: 1,
      deps: { makeSocket: () => socketFalso, fetchVersion: async () => ({ version: [2, 3000, 0] }) },
    });
    await modulo.start();
    await oyentes["connection.update"]({ qr: "2@abc,def,ghi,jkl+mno" });
    await new Promise((r) => setTimeout(r, 30));

    const texto = salida.join("\n");
    assert.doesNotMatch(texto, /[█▀▄]/, "no puede haber QR en pantalla");
    assert.match(texto, /reinicia con --code|PAIRING_NUMBER/, "y tiene que decir qué hacer");
  } finally {
    console.log = consolaOriginal;
    console.warn = warnOriginal;
  }
});
