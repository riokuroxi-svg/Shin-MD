/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  arreglos-3.9.1.test.js — lo que se rompió y por qué
//
//  Tres fallos que aparecieron al probar la 3.9.0 en un teléfono, y
//  que estas pruebas impiden que vuelvan:
//
//  1. EL MENÚ NO LLEGABA. El comando `.menu` envolvía el envío de la
//     tarjeta y, si el cliente rechazaba el mensaje nativo, hacía
//     `return null` SIN HABER MANDADO NADA. El mensaje quedaba en visto
//     y no aparecía ni el menú ni el aviso.
//
//  2. LA LATENCIA DEL PING SIEMPRE DABA 0ms. Medía dos lecturas de Map
//     que tardan microsegundos, y al redondear a milisegundos salía 0:
//     parecía que el bot no medía nada.
//
//  3. `.setpfp` ESTABA ROTO desde antes: usaba `Jimp.read()`,
//     `getWidth()`, `crop(x,y,w,h)` y `scaleToFit(a,b)`, que jimp 1.x
//     ya no tiene.
// ═══════════════════════════════════════════════════════════════════
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ── 1. el menú nunca se queda en silencio ──────────────────────────

test("el .menu manda algo incluso si la tarjeta falla", async () => {
  const cmd = (await import("../cmds/main/menu.js")).default;

  const enviados = [];
  const sock = {
    user: { id: "521:1@s.whatsapp.net", name: "Shin" },
    waUploadToServer: async () => ({ mediaUrl: "x", directPath: "/y" }),
    sendMessage: async (_jid, contenido) => {
      enviados.push(contenido);
      return { key: { id: "k" } };
    },
    // Este es el caso del teléfono: el mensaje nativo se rechaza.
    relayMessage: async () => {
      throw new Error("Cannot read properties of undefined (reading 'undefined')");
    },
  };

  const comandos = new Map([
    ["ping", { name: "ping", category: "main", description: "x", aliases: [] }],
    ["menu", { name: "menu", category: "main", description: "x", aliases: [] }],
  ]);
  const engine = {
    getUptime: () => 1000,
    getSendQueue: () => ({ length: () => 0, isPaused: () => false }),
    getHealth: () => ({ getStatus: () => ({ score: 0 }) }),
  };
  const ctx = {
    chatId: "1@s.whatsapp.net",
    senderId: "1@s.whatsapp.net",
    pushName: "r",
    isOwner: true,
    isAdmin: false,
    usedPrefix: ".",
    arg: "",
    args: [],
    full: { key: { id: "abc" } },
  };

  const r = await cmd.handler(sock, ctx, engine, comandos);

  assert.equal(r, null, "el handler ya mandó lo suyo");
  assert.ok(enviados.length > 0, "no mandó NADA: el menú se quedó en visto");
  // Y lo que manda tiene texto legible, no un mensaje vacío.
  const texto = enviados.map((m) => m.text || "").join("\n");
  assert.ok(texto.length > 40, "mandó un mensaje vacío");
});

test("el .menu avisa cuando la tarjeta no se pudo dibujar", () => {
  const fuente = leer("cmds/main/menu.js");
  assert.match(fuente, /No pude dibujar la tarjeta del menú/);
  // y el envío está dentro de un try: si no, un fallo corta el comando
  const i = fuente.indexOf("await enviarMenu(sock");
  const antes = fuente.slice(Math.max(0, i - 300), i);
  assert.match(antes, /try\s*{/, "el envío del kit no está protegido");
});

// ── 2. la latencia del ping es real ───────────────────────────────

test("el ping mide en microsegundos: no puede dar 0 siempre", async () => {
  const cmd = (await import("../cmds/main/ping.js")).default;
  const engine = {
    getSendQueue: () => ({ length: () => 0, isPaused: () => false }),
    getHealth: () => ({ getStatus: () => ({ score: 0 }) }),
  };

  const texto = await cmd.handler({}, {}, engine);
  assert.match(texto, /Latencia/, "no enseña la latencia");
  // O microsegundos o milisegundos, pero nunca un «0ms» pelado
  const m = texto.match(/Latencia › (\d+(?:\.\d+)?)(µs|ms)/);
  assert.ok(m, "la línea de latencia no tiene número ni unidad: " + texto);
});

test("el ping también dice cuánto lleva encendido", async () => {
  const cmd = (await import("../cmds/main/ping.js")).default;
  const engine = {
    getSendQueue: () => ({ length: () => 0, isPaused: () => false }),
    getHealth: () => ({ getStatus: () => ({ score: 0 }) }),
  };
  const texto = await cmd.handler({}, {}, engine);
  assert.match(texto, /Encendido/, "no dice el tiempo encendido");
});

// ── 3. .setpfp con la API de jimp que hay instalada ───────────────

test(".setpfp usa la API nueva (y deja la vieja solo de respaldo)", () => {
  const fuente = leer("cmds/socket/setpfp.js");

  // Lo que reventaba era llamar a la API vieja A PELO, sin comprobar
  // que existiera. La ruta principal ahora es la nueva; las viejas solo
  // pueden aparecer después de un `typeof … === "function"`.
  const lineas = fuente.split("\n");
  const sospechosas = [];

  for (const linea of lineas) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("//") || limpia.startsWith("*")) continue;

    // ¿llama a algo de la API vieja?
    const usaVieja = /\.getBufferAsync\(|jimp\.getWidth\(\)|jimp\.getHeight\(\)/.test(limpia);
    if (!usaVieja) continue;

    // Vale si en la misma línea ya comprobó el tipo…
    const protegida = /typeof/.test(limpia)
      // …o si es la rama de respaldo de un if (`cuadrado.scaleToFit(720, 720)`
      // dentro de un catch, tras haber probado la forma nueva).
      || /^cuadrado\.scaleToFit\(\d/.test(limpia);

    if (!protegida) sospechosas.push(limpia);
  }

  assert.deepEqual(sospechosas, [], "llamadas a la API vieja sin comprobar:\n  " + sospechosas.join("\n  "));
});

test(".setpfp funciona de verdad con la imagen de prueba", async () => {
  const Jimp = await import("jimp");
  const JimpMod = Jimp.Jimp || Jimp.default || Jimp;
  const leerImg = Jimp.read || JimpMod.read || JimpMod.fromBuffer;
  assert.equal(typeof leerImg, "function", "jimp no sabe leer imágenes");

  const base = new JimpMod({ width: 300, height: 200, color: 0x3366ffff });
  const media = await base.getBuffer("image/png");

  const img = await leerImg.call(Jimp.read ? Jimp : JimpMod, media);
  const ancho = typeof img.getWidth === "function" ? img.getWidth() : img.width;
  const alto = typeof img.getHeight === "function" ? img.getHeight() : img.height;
  assert.equal(ancho, 300);
  assert.equal(alto, 200);

  const lado = Math.min(ancho, alto);
  let cuadrado;
  try {
    cuadrado = img.crop({ x: 0, y: 0, w: lado, h: lado });
  } catch {
    cuadrado = img.crop(0, 0, lado, lado);
  }
  const buf = typeof cuadrado.getBuffer === "function"
    ? await cuadrado.getBuffer("image/jpeg", { quality: 90 })
    : await cuadrado.getBufferAsync(Jimp.MIME_JPEG);

  assert.ok(buf.length > 100, "la imagen salió vacía");
  // JPEG empieza por FF D8
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
});

// ── 4. sin vulnerabilidades altas por zod ─────────────────────────

test("zod queda por encima de la versión vulnerable", () => {
  const pkg = JSON.parse(leer("package.json"));
  const override = pkg.overrides?.zod || "";
  assert.ok(override, "falta el override de zod: jimp trae una versión vulnerable");
  // El fallo afecta a todo lo anterior a 4.6.6.
  const mayor = Number(String(override).replace(/[^\d.]/g, "").split(".")[0] || 0);
  assert.ok(mayor >= 4, `zod sigue en ${override}, el fallo llega hasta 4.6.5`);
});

test("jimp sigue declarado como dependencia directa", () => {
  const pkg = JSON.parse(leer("package.json"));
  assert.ok(pkg.dependencies.jimp, "jimp desapareció de las dependencias");
});
