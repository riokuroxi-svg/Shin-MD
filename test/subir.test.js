/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Pruebas de `.subir`: el candado de rutas se comprueba en un árbol de mentira,
// no en el repositorio de verdad. Escribir en el repo desde una prueba es la
// clase de broma que se descubre tres commits después.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import subir, { separar, resolverRuta, escribir, MAX_CARACTERES } from "../cmds/owner/subir.js";

function arbol() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "shin-subir-"));
  fs.mkdirSync(path.join(raiz, "cmds", "owner"), { recursive: true });
  fs.mkdirSync(path.join(raiz, ".git"), { recursive: true });
  fs.writeFileSync(path.join(raiz, ".git", "config"), "x");
  fs.writeFileSync(path.join(raiz, "README.md"), "viejo");
  return raiz;
}

const motivo = (raiz, ruta) => {
  const r = resolverRuta(raiz, ruta);
  return r.ok ? null : r.motivo;
};

test("separa ruta y contenido por la primera barra", () => {
  assert.deepEqual(separar("notas.txt | hola"), { ruta: "notas.txt", contenido: "hola" });
  assert.deepEqual(separar("a.js | if (x) { y(); } | z"), {
    ruta: "a.js",
    contenido: "if (x) { y(); } | z",
  });
  assert.equal(separar("sin barra"), null);
  assert.equal(separar(""), null);
  assert.equal(separar(undefined), null);
});

test("quita un solo espacio tras la barra y respeta la indentación", () => {
  assert.equal(separar("a.txt | texto").contenido, "texto");
  assert.equal(separar("a.txt |  texto").contenido, " texto", "el segundo espacio es contenido");
  assert.equal(
    separar("a.js |\n    const x = 1;").contenido,
    "    const x = 1;",
    "la indentación se conserva"
  );
});

test("rutas buenas: archivo suelto y carpeta que ya existe", () => {
  const raiz = arbol();
  const uno = resolverRuta(raiz, "notas.txt");
  assert.equal(uno.ok, true);
  assert.equal(uno.relativa, "notas.txt");
  const dos = resolverRuta(raiz, "cmds/owner/nuevo.js");
  assert.equal(dos.ok, true);
  assert.equal(dos.relativa, path.join("cmds", "owner", "nuevo.js"));
});

test("no se puede salir de la carpeta del bot", () => {
  const raiz = arbol();
  assert.ok(motivo(raiz, "../../etc/passwd"), "con .. tiene que negarse");
  assert.ok(motivo(raiz, "/etc/passwd"), "con ruta absoluta tiene que negarse");
  assert.equal(motivo(raiz, ""), "Falta la ruta.");
  assert.equal(motivo(raiz, "   "), "Falta la ruta.");
});

test(".git queda protegido, también por dentro", () => {
  const raiz = arbol();
  assert.match(motivo(raiz, ".git"), /\.git\/` está protegido/);
  assert.match(motivo(raiz, ".git/config"), /\.git\/` está protegido/);
  assert.match(motivo(raiz, ".git/hooks/pre-commit"), /\.git\/` está protegido/);
});

test("una carpeta no se sobrescribe", () => {
  const raiz = arbol();
  assert.match(motivo(raiz, "cmds"), /es una carpeta/);
});

test("un enlace simbólico que sale del bot se detecta (path.resolve no lo ve)", () => {
  const raiz = arbol();
  const fuera = fs.mkdtempSync(path.join(os.tmpdir(), "shin-fuera-"));
  try {
    fs.symlinkSync(fuera, path.join(raiz, "datos"), "dir");
  } catch {
    return; // sistema sin enlaces simbólicos: no hay nada que probar
  }
  assert.ok(
    path.resolve(raiz, "datos/x.txt").startsWith(raiz),
    "path.resolve sí lo deja pasar: por eso hace falta realpath"
  );
  const r = resolverRuta(raiz, "datos/x.txt");
  assert.equal(r.ok, false, "tiene que negarse");
  assert.match(r.motivo, /enlace/);
});

test("escribe de verdad y devuelve la ruta relativa y el tamaño", () => {
  const raiz = arbol();
  const r = escribir(raiz, "nuevo/dir/x.txt", "hola mundo");
  assert.equal(r.ok, true);
  assert.equal(r.caracteres, 10);
  assert.equal(fs.readFileSync(path.join(raiz, "nuevo", "dir", "x.txt"), "utf8"), "hola mundo");
});

test("el comando contesta con el uso cuando falta la barra o la ruta", async () => {
  const sinBarra = await subir.handler({}, { arg: "notas.txt" });
  assert.match(sinBarra, /Uso: \*\.subir ruta \| contenido\*/);
  const sinRuta = await subir.handler({}, { arg: " | hola" });
  assert.match(sinRuta, /Falta la ruta/);
});

test("el comando rechaza contenido por encima del tope antes de escribir", async () => {
  const enorme = "x".repeat(MAX_CARACTERES + 1);
  const r = await subir.handler({}, { arg: "grande.txt | " + enorme });
  assert.match(r, /demasiado largo/);
  assert.match(r, new RegExp(String(MAX_CARACTERES)));
  assert.equal(
    fs.existsSync(path.join(path.resolve("."), "grande.txt")),
    false,
    "no debe escribir nada"
  );
});

test("el comando escribe dentro del bot y lo dice", async () => {
  const antes = fs.readFileSync(path.join(process.cwd(), "cmds", "owner", "subir.js"), "utf8");
  const r = await subir.handler({}, { arg: ".tmp-subir-prueba.txt | hola" });
  const destino = path.join(process.cwd(), ".tmp-subir-prueba.txt");
  try {
    assert.match(r, /✓ Actualizado: `\.tmp-subir-prueba\.txt`/);
    assert.equal(fs.readFileSync(destino, "utf8"), "hola");
  } finally {
    fs.rmSync(destino, { force: true });
  }
  assert.equal(
    fs.readFileSync(path.join(process.cwd(), "cmds", "owner", "subir.js"), "utf8"),
    antes
  );
});

test("el aviso de recarga solo sale con comandos de cmds/", async () => {
  const dentro = await subir.handler({}, { arg: "cmds/owner/prueba-tmp.js | x" });
  const fuera = await subir.handler({}, { arg: ".prueba-tmp.txt | x" });
  try {
    assert.match(dentro, /usa \*\.restart\* o \*\.fix\* para cargarlo/);
    assert.doesNotMatch(fuera, /restart|recargado/);
  } finally {
    fs.rmSync(path.join(process.cwd(), "cmds", "owner", "prueba-tmp.js"), { force: true });
    fs.rmSync(path.join(process.cwd(), ".prueba-tmp.txt"), { force: true });
  }
});
