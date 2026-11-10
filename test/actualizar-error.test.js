/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// El fallo real que se reportó desde Termux:
//
//   ▸ Actualizando Shin-MD
//     ✗ No se pudo consultar el repositorio (¿sin conexión?).
//
// …cuando SÍ había conexión. El mensaje culpaba a la red sin pruebas y
// `--quiet` se tragaba lo que dijo git, así que la única pista se perdía.
//
// Estas pruebas sacan las funciones del instalador y las ejecutan solas:
//   1. Reintenta y termina conectando (el caso de la red móvil).
//   2. Si acaba fallando, ENSEÑA el mensaje de git.
//   3. Traduce cada fallo conocido a algo accionable.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const INSTALADOR = path.join(RAIZ, "install.sh");
// Ruta absoluta: la prueba de «sin git» vacía el PATH a propósito.
const BASH = "/bin/bash";

/** Saca una función del instalador por su nombre (con su cuerpo completo). */
async function extraerFuncion(nombre) {
  const texto = await fs.readFile(INSTALADOR, "utf8");
  const inicio = texto.indexOf(`\n${nombre}() {`);
  assert.notEqual(inicio, -1, `no encuentro la función ${nombre}() en install.sh`);
  // Se cuenta el anidamiento de llaves hasta cerrar la función.
  let i = texto.indexOf("{", inicio);
  let nivel = 0;
  for (; i < texto.length; i += 1) {
    if (texto[i] === "{") nivel += 1;
    else if (texto[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio, i + 1);
    }
  }
  throw new Error(`la función ${nombre}() no cierra`);
}

/**
 * Arma un script de bash con los ayudantes de salida y las funciones
 * pedidas, más el cuerpo de la prueba que se quiera correr.
 */
async function correrGuion(funciones, cuerpo, env = {}) {
  const trozos = [
    "set -u",
    'C_ROSA=""; C_NEG=""; C_RESET=""; C_VERDE=""; C_AMAR=""; C_GRIS=""; C_ROJO=""',
    "hay() { command -v \"$1\" >/dev/null 2>&1; }",
    'paso() { echo "▸ $*"; }',
    'bien() { echo "✓ $*"; }',
    'aviso() { echo "! $*" >&2; }',
    'dato() { echo "· $*"; }',
    'error() { echo "✗ $*" >&2; }',
    'morir() { error "$*"; exit 1; }',
  ];
  for (const f of funciones) trozos.push(await extraerFuncion(f));
  trozos.push(cuerpo);
  const guion = trozos.join("\n");
  return new Promise((resolve) => {
    execFile(BASH, ["-c", guion], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolve({ codigo: err ? err.code : 0, stdout, stderr });
    });
  });
}

test("reintenta y termina conectando cuando la red falla la primera vez", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shin-git-"));
  // git de mentira: falla una vez y luego funciona. Deja constancia de los
  // argumentos para comprobar que el 2.º intento fuerza HTTP/1.1.
  const falso = path.join(dir, "git");
  await fs.writeFile(
    falso,
    `#!/bin/sh
echo "$@" >> "${dir}/llamadas.txt"
contador="${dir}/n"
n=$(cat "$contador" 2>/dev/null || echo 0)
n=$((n+1)); echo "$n" > "$contador"
if [ "$n" -lt 2 ]; then
  echo "error: RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly" >&2
  exit 1
fi
exit 0
`,
    { mode: 0o755 },
  );

  const r = await correrGuion(
    ["consultar_repositorio"],
    `DESTINO="/tmp/x"
consultar_repositorio && echo "RESULTADO=ok"`,
    { PATH: `${dir}:${process.env.PATH}`, DESTINO: "/tmp/x" },
  );

  assert.equal(r.codigo, 0, "termina bien tras reintentar: " + r.stderr);
  assert.match(r.stdout, /RESULTADO=ok/);
  assert.match(r.stdout, /intento 1 falló; reintentando/);
  assert.match(r.stdout, /HTTP\/1\.1/, "el segundo intento fuerza HTTP/1.1");

  const llamadas = await fs.readFile(path.join(dir, "llamadas.txt"), "utf8");
  const lineas = llamadas.trim().split("\n");
  assert.equal(lineas.length, 2, "fueron dos intentos");
  assert.doesNotMatch(lineas[0], /http\.version/, "el primero va como siempre");
  assert.match(lineas[1], /http\.version=HTTP\/1\.1/, "el segundo, por HTTP/1.1");

  await fs.rm(dir, { recursive: true, force: true });
});

test("si no conecta, enseña el mensaje de git en vez de culpar a la red", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shin-git-"));
  const falso = path.join(dir, "git");
  await fs.writeFile(
    falso,
    `#!/bin/sh
echo "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com" >&2
exit 1
`,
    { mode: 0o755 },
  );

  const r = await correrGuion(
    ["consultar_repositorio", "explicar_fallo_de_red"],
    `DESTINO="/tmp/x"
consultar_repositorio || echo "RESULTADO=fallo"`,
    { PATH: `${dir}:${process.env.PATH}`, DESTINO: "/tmp/x" },
  );

  assert.match(r.stdout, /RESULTADO=fallo/);
  assert.match(r.stderr, /Could not resolve host: github\.com/, "el mensaje real de git, no una suposición");
  assert.match(r.stderr, /es el DNS, no GitHub/, "y la explicación de qué hacer");
  assert.match(r.stderr, /Nada se ha tocado/, "tranquila: no se movió nada");
  assert.match(r.stderr, /git -C \/tmp\/x fetch --tags origin/, "el comando exacto para probarlo a mano");

  await fs.rm(dir, { recursive: true, force: true });
});

test("sin git lo dice claro y no sigue", async () => {
  const r = await correrGuion(
    ["consultar_repositorio"],
    `DESTINO="/tmp/x"
consultar_repositorio || echo "RESULTADO=fallo"`,
    { PATH: "/nonexistent" }, // sin git, sin nada
  );
  assert.match(r.stderr, /No encuentro git/);
  assert.match(r.stderr, /pkg install git/, "en Termux se arregla así");
});

test("cada fallo conocido tiene su pista", async () => {
  const casos = [
    ["fatal: Could not resolve host: github.com", /DNS/],
    ["fatal: server certificate verification failed", /ca-certificates/],
    ["git: 'remote-https' is not a git command", /libcurl/],
    ["error: RPC failed; curl 92 HTTP/2 stream 0 was not closed cleanly", /HTTP\/1\.1/],
    ["fatal: Authentication failed for 'https://github.com/x/y'", /credenciales/],
    ["fatal: detected dubious ownership in repository", /safe\.directory/],
    ["fatal: unable to access 'https://github.com/': Connection timed out", /No hay salida a github\.com/],
    ["algo rarísimo que nadie previó", /No reconozco este fallo/],
  ];
  for (const [texto, esperado] of casos) {
    const r = await correrGuion(
      ["explicar_fallo_de_red"],
      `explicar_fallo_de_red "${texto.replace(/"/g, '\\"')}"`,
    );
    assert.match(r.stderr, esperado, `«${texto}» debería llevar a ${esperado}`);
  }
});

test("una etiqueta reescrita aguas arriba ya no impide actualizar", async () => {
  // El caso real, reproducido con git de verdad: el proyecto rehace una
  // etiqueta (pasó al corregir las firmas del historial), la instalación de
  // quien lo tenía guarda la vieja, y `git fetch --tags` se niega:
  //   ! [rejected]  v1 -> v1  (would clobber existing tag)
  // Eso devuelve código 1 y el instalador lo contaba como «¿sin conexión?».
  // Reproducido el 2026-11-10 en Termux.
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "shin-etiquetas-"));
  const origen = path.join(base, "origen");
  const clon = path.join(base, "clon");
  const git = async (args, cwd) =>
    new Promise((resolve, reject) => {
      execFile("git", ["-c", "user.name=prueba", "-c", "user.email=p@b", ...args], { cwd }, (err, out, errOut) =>
        err ? reject(new Error(errOut || err.message)) : resolve(out),
      );
    });

  await fs.mkdir(origen);
  await git(["init", "-q", "."], origen);
  await fs.writeFile(path.join(origen, "f"), "1\n");
  await git(["add", "f"], origen);
  await git(["commit", "-qm", "uno"], origen);
  await git(["tag", "-a", "v1", "-m", "uno"], origen);
  await git(["clone", "-q", origen, clon], base);

  // Aguas arriba se rehace la etiqueta.
  await git(["tag", "-d", "v1"], origen);
  await fs.writeFile(path.join(origen, "f"), "2\n");
  await git(["commit", "-qam", "dos"], origen);
  await git(["tag", "-a", "v1", "-m", "uno reescrito"], origen);

  // Con lo que hacía el instalador ANTES: falla.
  await assert.rejects(
    git(["fetch", "--tags", "origin"], clon),
    /clobber/,
    "sin --force, git rechaza la etiqueta (esto es el fallo original)",
  );

  // Con lo que hace ahora: la etiqueta se pone al día y devuelve 0.
  await git(["fetch", "--tags", "--force", "origin"], clon);
  const destino = await git(["rev-parse", "v1"], clon);
  const esperado = await git(["rev-parse", "v1"], origen);
  assert.equal(destino.trim(), esperado.trim(), "la etiqueta local queda como la remota");

  await fs.rm(base, { recursive: true, force: true });
});
