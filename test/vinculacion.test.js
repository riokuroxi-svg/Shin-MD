/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  vinculacion.test.js — que el bot nunca arranque sin saber de quién es.
//
//  El fallo reportado, con todas sus letras: se instalaba, se arrancaba,
//  y el bot se iba solo a WhatsApp sin preguntar el número: acababa
//  enseñando un QR que en un móvil no se puede escanear. La causa no era
//  el QR, era que `npm start` lanza al bot con la entrada cerrada (para
//  que el panel sea lo único que escribe) y el arranque, al no poder
//  preguntar, seguía adelante.
//
//  Lo que se comprueba aquí:
//
//    1. La sesión se lee de verdad: no hay, está a medias, o sirve.
//    2. La decisión (preguntar, usar, no hacer nada o pararse) es la
//       correcta en las cinco combinaciones posibles.
//    3. Arrancar sin sesión y sin terminal NO pone el bot en marcha: se
//       para con código 1 y dice la orden exacta que hay que escribir.
//    4. `npm start` hace lo mismo, porque es el que se usa de verdad.
//    5. En ningún camino aparece un QR.
//
//  Nada de red: los dos arranques se paran antes de conectar.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const TMP = fs.realpathSync(os.tmpdir());

const { estadoSesion, planDeVinculacion } = await import(
  path.join(RAIZ, "src", "lib", "vinculacion.js")
);

const temporales = [];
function carpetaSesion({ registrada, conCreds = true } = {}) {
  const d = fs.mkdtempSync(path.join(TMP, "shin-sesion-"));
  temporales.push(d);
  const db = new DatabaseSync(path.join(d, "auth.db"));
  db.exec("CREATE TABLE creds (id INTEGER PRIMARY KEY, data TEXT)");
  if (conCreds) {
    db.prepare("INSERT INTO creds (id, data) VALUES (1, ?)").run(JSON.stringify({ registered: registrada }));
  }
  db.close();
  return d;
}
process.on("exit", () => {
  for (const d of temporales) fs.rmSync(d, { recursive: true, force: true });
});

const SESION_VACIA = fs.mkdtempSync(path.join(TMP, "shin-vacia-"));
temporales.push(SESION_VACIA);

// ─────────────────────── leer la sesión ───────────────────────

test("sin archivo de sesión no hay nada que reutilizar", () => {
  const r = estadoSesion(path.join(TMP, "no-existe-shin"));
  assert.equal(r.hay, false);
  assert.equal(r.registrada, false);
});

test("una sesión con credenciales registradas sí se reutiliza", () => {
  const r = estadoSesion(carpetaSesion({ registrada: true }));
  assert.equal(r.hay, true);
  assert.equal(r.registrada, true);
});

test("una vinculación a medias no cuenta como sesión buena", () => {
  // Es el caso que más duele: el archivo existe, así que el bot arranca,
  // no conecta, y acaba pidiendo un QR. Aquí se ve que no se confunde.
  const r = estadoSesion(carpetaSesion({ registrada: false }));
  assert.equal(r.hay, true);
  assert.equal(r.registrada, false);
  assert.match(r.motivo, /a medias/);
});

test("un archivo que no es una base de datos se trata como sesión rota", () => {
  const d = fs.mkdtempSync(path.join(TMP, "shin-rota-"));
  temporales.push(d);
  fs.writeFileSync(path.join(d, "auth.db"), "esto no es sqlite");
  const r = estadoSesion(d);
  assert.equal(r.registrada, false);
  assert.match(r.motivo, /no se puede leer/);
});

// ─────────────────────── la decisión ───────────────────────

const registrada = { hay: true, registrada: true, motivo: "sesión registrada" };
const aMedias = { hay: true, registrada: false, motivo: "la vinculación quedó a medias" };
const ninguna = { hay: false, registrada: false, motivo: "no hay sesión" };

test("con sesión buena y sin órdenes, no se pregunta nada", () => {
  const p = planDeVinculacion({ args: {}, sesion: registrada, hayTerminal: true });
  assert.equal(p.accion, "nada");
});

test("--menu fuerza la vinculación aunque la sesión sirva", () => {
  const p = planDeVinculacion({ args: { menu: true }, sesion: registrada, hayTerminal: true });
  assert.equal(p.accion, "preguntar");
});

test("un número en la orden manda sobre todo: no se pregunta", () => {
  const p = planDeVinculacion({
    args: { code: true, phone: "5215512345678" },
    sesion: ninguna,
    hayTerminal: true,
  });
  assert.equal(p.accion, "usar");
  assert.equal(p.numero, "5215512345678");
});

test("PAIRING_NUMBER del .env se normaliza y tampoco se pregunta", () => {
  const p = planDeVinculacion({
    args: {},
    env: { PAIRING_NUMBER: "+52 55 1234 5678" },
    sesion: ninguna,
    hayTerminal: true,
  });
  assert.equal(p.accion, "usar");
  // México móvil: WhatsApp guarda la forma 52+1+número.
  assert.equal(p.numero, "5215512345678");
});

test("sin número pero con terminal, se pregunta", () => {
  const p = planDeVinculacion({ args: {}, sesion: ninguna, hayTerminal: true });
  assert.equal(p.accion, "preguntar");
});

test("sin número y sin terminal, se para: no se arranca a ciegas", () => {
  const p = planDeVinculacion({ args: {}, sesion: ninguna, hayTerminal: false });
  assert.equal(p.accion, "salir");
  assert.match(p.motivo, /no hay sesión/);
});

test("una sesión a medias sin terminal también se para (y lo explica)", () => {
  const p = planDeVinculacion({ args: {}, sesion: aMedias, hayTerminal: false });
  assert.equal(p.accion, "salir");
  assert.match(p.motivo, /a medias/);
});

// ─────────────────────── el arranque de verdad ───────────────────────

/** Lanza una orden sin terminal: entrada cerrada y salida por un tubo. */
function arrancar(args, { archivo = "index.js", env = {} } = {}) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, archivo), ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    input: "",
    timeout: 60_000,
    env: {
      ...process.env,
      SESSION_DIR: SESION_VACIA,
      PAIRING_NUMBER: "",
      NO_COLOR: "1",
      ...env,
    },
  });
  const salida = `${r.stdout || ""}${r.stderr || ""}`;
  return { codigo: r.status, salida };
}

test("`node index.js` sin sesión y sin terminal no arranca el bot", () => {
  const r = arrancar([]);
  assert.equal(r.codigo, 1, `debería salir con 1:\n${r.salida}`);
  assert.match(r.salida, /--code/, "tiene que decir cómo se arranca");
  assert.match(r.salida, /PAIRING_NUMBER/, "y la otra manera, sin argumentos");
  // Lo que NO puede pasar: que se ponga a conectar y a pedir QR.
  assert.doesNotMatch(r.salida, /Conectando con WhatsApp/);
  assert.doesNotMatch(r.salida, /código QR/i);
  assert.doesNotMatch(r.salida, /Escanea/i);
});

test("`npm start` (la consola) tampoco arranca el bot sin número ni terminal", () => {
  const r = arrancar([], { archivo: path.join("scripts", "consola.mjs") });
  assert.equal(r.codigo, 1, `debería salir con 1:\n${r.salida}`);
  assert.match(r.salida, /npm start -- --code/, "tiene que enseñar la orden exacta");
  assert.match(r.salida, /PAIRING_NUMBER/);
  assert.doesNotMatch(r.salida, /bot arrancado/, "no puede llegar a levantar el bot");
  assert.doesNotMatch(r.salida, /código QR/i);
});

test("con el número en el entorno, la consola sí arranca el bot", () => {
  // No se espera a que conecte: basta con ver que pasa del punto donde
  // antes se quedaba mirando el QR. Se corta a los 20 s.
  const r = spawnSync(
    process.execPath,
    [path.join(RAIZ, "scripts", "consola.mjs")],
    {
      cwd: RAIZ,
      encoding: "utf8",
      input: "",
      timeout: 20_000,
      env: { ...process.env, SESSION_DIR: SESION_VACIA, PAIRING_NUMBER: "5215512345678", NO_COLOR: "1" },
    }
  );
  const salida = `${r.stdout || ""}${r.stderr || ""}`;
  assert.match(salida, /bot arrancado/, "el supervisor tiene que levantar el bot");
  assert.match(salida, /vinculando con el número 5215512345678/);
  assert.doesNotMatch(salida, /código QR/i);
});

// ─────────────────────── el QR no existe ───────────────────────

test("ni el arranque ni la consola pueden dibujar un QR", () => {
  const conQr = [];
  for (const archivo of ["boot/index.js", path.join("scripts", "consola.mjs"), path.join("src", "core", "socket.js")]) {
    const texto = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
    // Se busca la impresión, no la palabra: los comentarios sí hablan del
    // QR (explican por qué no está), y esos se quedan.
    for (const linea of texto.split("\n")) {
      if (/^\s*(\/\/|\*)/.test(linea)) continue;
      if (/qrcode-terminal|qrcode\.generate|printQRInTerminal:\s*true/.test(linea)) {
        conQr.push(`${archivo}: ${linea.trim()}`);
      }
    }
  }
  assert.deepEqual(conQr, [], `hay ${conQr.length} forma(s) de volver a dibujar un QR`);
});
