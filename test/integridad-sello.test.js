/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  integridad-sello.test.js — CAPA 1: el sello deja de ser un adorno
//
//  Cada prueba de este archivo corresponde a un fallo que tenía la
//  versión anterior. Si alguien vuelve a "simplificar" el sello, uno de
//  estos nombres se pone rojo y dice exactamente qué se perdió:
//
//    · baileys/lib estaba exento entero            → se detecta un cambio ahí
//    · solo se hasheaban ciertas extensiones       → un .txt nuevo se detecta
//    · el sello vivía dentro de node_modules       → vive en data/ y sobrevive
//    · un cambio de enlace pasaba limpio           → se detecta
//    · sello ausente o ilegible se aceptaba        → estricto falla cerrado
//    · cualquiera podía re-sellar                  → sello firmado con HMAC
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  sellar,
  compararConSello,
  revisarAlArrancar,
  huellaArbol,
  claveDe,
  MARCA,
  RUTA_SELLO,
} from "#lib/integridad";

/** Un proyecto falso con lo justo: package.json, lock y un node_modules. */
function proyecto({ conClave = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-integridad-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "bot-prueba", version: "1.0.0", dependencies: { baileys: "7.0.0" } })
  );
  fs.writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages: {} })
  );
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(path.join(nm, "baileys", "lib"), { recursive: true });
  fs.writeFileSync(path.join(nm, "baileys", "lib", "socket.js"), "module.exports = 1;\n");
  fs.mkdirSync(path.join(nm, "otro", "test"), { recursive: true });
  fs.writeFileSync(path.join(nm, "otro", "index.js"), "module.exports = 2;\n");
  fs.writeFileSync(path.join(nm, "otro", "test", "datos.txt"), "hola\n");
  if (conClave) fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  return dir;
}

const SELLO = (dir) => path.join(dir, RUTA_SELLO);

test("sella el árbol y después lo encuentra igual", () => {
  const dir = proyecto();
  const h = sellar({ raiz: dir });
  assert.equal(h.paquetes, 3);
  assert.ok(h.firmado, "el sello tiene que salir firmado");
  assert.equal(fs.existsSync(SELLO(dir)), true, "el sello se escribe en data/");

  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "igual");
  assert.equal(r.firmaOk, true);
});

test("un cambio dentro de baileys/lib se detecta: ya no está exento", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  // Un byte de más en la librería que ve los mensajes y las credenciales.
  fs.writeFileSync(
    path.join(dir, "node_modules", "baileys", "lib", "socket.js"),
    "module.exports = 1; // x\n"
  );
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "cambio");
  assert.deepEqual(r.cambiados, ["baileys/lib/socket.js"]);
});

test("un archivo .txt nuevo se detecta: ya no hay filtro de extensiones", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  fs.writeFileSync(path.join(dir, "node_modules", "otro", "payload.txt"), "no debería estar\n");
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "cambio");
  assert.deepEqual(r.nuevos, ["otro/payload.txt"]);
});

test("un archivo escondido en una carpeta llamada test tampoco se escapa", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  fs.writeFileSync(path.join(dir, "node_modules", "otro", "test", "oculto.js"), "x\n");
  const r = compararConSello({ raiz: dir });
  assert.deepEqual(r.nuevos, ["otro/test/oculto.js"]);
});

test("un archivo borrado se detecta", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  fs.unlinkSync(path.join(dir, "node_modules", "otro", "index.js"));
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "cambio");
  assert.deepEqual(r.faltan, ["otro/index.js"]);
});

test("el sello vive fuera de node_modules: se lleva el árbol y el sello sigue", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  fs.rmSync(path.join(dir, "node_modules"), { recursive: true, force: true });
  assert.ok(fs.existsSync(SELLO(dir)), "npm ci borra node_modules, no data/");
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "cambio", "sin árbol, todo el sello aparece como desaparecido");
  assert.equal(r.faltan.length, 3);
});

test("un sello reescrito a mano se marca como inválido, no como cambio normal", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  // El atacante clásico: cambia el archivo y rehace el JSON sin la clave.
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");
  const sello = JSON.parse(fs.readFileSync(SELLO(dir), "utf8"));
  sello.archivos["baileys/lib/socket.js"] = "0".repeat(64);
  sello.selloEn = new Date().toISOString();
  fs.writeFileSync(SELLO(dir), JSON.stringify(sello));

  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "sello-invalido");
  assert.equal(r.firmaOk, false);
});

test("un sello sin firma con clave disponible también es inválido", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  const sello = JSON.parse(fs.readFileSync(SELLO(dir), "utf8"));
  delete sello.firma;
  fs.writeFileSync(SELLO(dir), JSON.stringify(sello));
  assert.equal(compararConSello({ raiz: dir }).estado, "sello-invalido");
});

test("un sello ilegible no se confunde con un árbol limpio", () => {
  const dir = proyecto();
  fs.writeFileSync(SELLO(dir), "{ esto no es json");
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "sello-invalido");
  assert.equal(r.firmaOk, false);
});

test("un enlace re-apuntado se detecta", () => {
  const dir = proyecto();
  const enlace = path.join(dir, "node_modules", "atajo");
  try {
    fs.symlinkSync(path.join(dir, "node_modules", "otro", "index.js"), enlace);
  } catch {
    return; // sistema sin permisos de symlink: la prueba no aplica
  }
  sellar({ raiz: dir });
  fs.rmSync(enlace, { force: true });
  fs.symlinkSync(path.join(dir, "node_modules", "otro", "test", "datos.txt"), enlace);
  const r = compararConSello({ raiz: dir });
  assert.equal(r.estado, "cambio");
  assert.ok(r.enlaces.some((e) => /re-apuntado/.test(e)));
});

test("sin sello: avisar deja arrancar, estricto no (falla cerrado)", () => {
  const dir = proyecto();
  const suave = revisarAlArrancar({ raiz: dir, modo: "avisar" });
  assert.equal(suave.estado, "sin-sello");
  assert.equal(suave.ok, true, "en avisar, no tener sello solo se avisa");

  const duro = revisarAlArrancar({ raiz: dir, modo: "estricto" });
  assert.equal(duro.ok, false, "en estricto, sin sello no se puede demostrar nada");
});

test("con el árbol cambiado: avisar arranca, estricto no", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  fs.writeFileSync(path.join(dir, "node_modules", "otro", "index.js"), "cambiado\n");
  assert.equal(revisarAlArrancar({ raiz: dir, modo: "avisar" }).ok, true);
  assert.equal(revisarAlArrancar({ raiz: dir, modo: "estricto" }).ok, false);
});

test("con el sello inválido tampoco se arranca en estricto", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  const sello = JSON.parse(fs.readFileSync(SELLO(dir), "utf8"));
  sello.archivos["otro/index.js"] = "f".repeat(64);
  fs.writeFileSync(SELLO(dir), JSON.stringify(sello));
  const r = revisarAlArrancar({ raiz: dir, modo: "estricto" });
  assert.equal(r.estado, "sello-invalido");
  assert.equal(r.ok, false);
});

test("la clave del sello no vive dentro de node_modules ni en el JSON", () => {
  const dir = proyecto();
  const clave = claveDe(dir, { crear: true });
  assert.equal(typeof clave, "string");
  assert.ok(clave.length >= 32);
  assert.ok(fs.existsSync(path.join(dir, "data", ".shin-clave")));
  assert.equal(fs.existsSync(path.join(dir, "node_modules", ".shin-clave")), false);

  sellar({ raiz: dir });
  const crudo = fs.readFileSync(SELLO(dir), "utf8");
  assert.equal(crudo.includes(clave), false, "la clave no se escribe en el sello");

  // Permisos: solo el dueño.
  const modo = fs.statSync(path.join(dir, "data", ".shin-clave")).mode & 0o777;
  assert.equal(modo, 0o600);
});

test("otra clave distinta no valida el sello (no se puede firmar a ciegas)", () => {
  const dir = proyecto();
  sellar({ raiz: dir });
  const r = compararConSello({ raiz: dir, clave: "clave-de-otro-sitio" });
  assert.equal(r.estado, "sello-invalido");
});

test("la huella cuenta todos los archivos y escribe la marca del sello", () => {
  const dir = proyecto();
  const h = huellaArbol(path.join(dir, "node_modules"));
  assert.equal(h.archivos.size, 3);
  assert.ok(h.bytes > 0);

  sellar({ raiz: dir });
  const sello = JSON.parse(fs.readFileSync(SELLO(dir), "utf8"));
  assert.equal(sello.marca, MARCA);
  assert.equal(sello.firmaAlgoritmo, "hmac-sha256");
});
