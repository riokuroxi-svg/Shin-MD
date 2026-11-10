/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  publicar.test.js — El comando que saca una versión.
//
//  Publicar es el momento en que un error se queda para siempre: una
//  etiqueta mal puesta no se puede "despublicar" sin que alguien la haya
//  descargado ya. Por eso estas pruebas usan un repositorio de verdad
//  (git real, remoto local, sin red) y comprueban qué quedó escrito:
//  la versión, la huella, los números del README, la etiqueta y lo que
//  se le pidió a `gh`.
//
//  `gh` es un doble: apunta las llamadas en vez de llamar a GitHub.
//  Ninguna prueba toca la red ni publica nada.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const TMP = fs.realpathSync(os.tmpdir());
const BASH = (() => spawnSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim())();

const temporales = [];
function temporal(etiqueta = "shin-pub") {
  const d = fs.mkdtempSync(path.join(TMP, `${etiqueta}-`));
  temporales.push(d);
  assert.ok(fs.realpathSync(d).startsWith(TMP + path.sep), `fuera de ${TMP}`);
  return d;
}
process.on("exit", () => {
  for (const d of temporales) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

function escribir(archivo, contenido, modo) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, contenido);
  if (modo) fs.chmodSync(archivo, modo);
}

function git(cwd, ...args) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "prueba", GIT_AUTHOR_EMAIL: "p@e.st",
      GIT_COMMITTER_NAME: "prueba", GIT_COMMITTER_EMAIL: "p@e.st",
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/** Una copia del repositorio, con su propio remoto `origin` local. */
function copiaDelRepo(version = "3.7.0") {
  const trabajo = temporal("shin-repo");
  const remoto = temporal("shin-remoto");
  for (const f of ["install.sh", "shin.sh", "README.md"]) {
    fs.copyFileSync(path.join(RAIZ, f), path.join(trabajo, f));
  }
  escribir(path.join(trabajo, "scripts", "firma-instalador.mjs"),
    fs.readFileSync(path.join(RAIZ, "scripts", "firma-instalador.mjs"), "utf8"));
  escribir(path.join(trabajo, "scripts", "publicar.mjs"),
    fs.readFileSync(path.join(RAIZ, "scripts", "publicar.mjs"), "utf8"));
  // `publicar.mjs` importa el cuadre de versiones: sin este archivo la copia
  // no arranca y todas las pruebas de aquí fallarían por un módulo que falta.
  escribir(path.join(trabajo, "scripts", "versiones.mjs"),
    fs.readFileSync(path.join(RAIZ, "scripts", "versiones.mjs"), "utf8"));
  escribir(path.join(trabajo, "package.json"), JSON.stringify({
    name: "shin-md", version, license: "AGPL-3.0-only", type: "module",
    scripts: { publicar: "node scripts/publicar.mjs" },
    // Como el repositorio de verdad: el resumen saca de aquí la URL pública
    // cuando `origin` no es de GitHub.
    repository: { type: "git", url: "git+https://github.com/riokuroxi-svg/Shin-MD.git" },
  }, null, 2) + "\n");

  escribir(path.join(trabajo, "package-lock.json"), JSON.stringify({
    name: "shin-md", version, lockfileVersion: 3, requires: true,
    packages: { "": { name: "shin-md", version, license: "AGPL-3.0-only" } },
  }, null, 2) + "\n");

  git(trabajo, "init", "--quiet", "--initial-branch", "main");
  git(trabajo, "add", "-A");
  git(trabajo, "commit", "--quiet", "-m", "inicio");
  git(remoto, "init", "--quiet", "--bare", "--initial-branch", "main");
  git(trabajo, "remote", "add", "origin", remoto);
  git(trabajo, "push", "--quiet", "origin", "main");
  return { trabajo, remoto };
}

/** Un `gh` que apunta lo que le piden. */
function ghFalso() {
  const dir = temporal("shin-gh");
  const registro = path.join(dir, "llamadas.log");
  escribir(path.join(dir, "gh"), `#!/bin/sh
echo "gh $*" >> "${registro}"
case "$1" in
  auth) exit 0 ;;
  release) echo "https://github.com/ejemplo/shin/releases/tag/x"; exit 0 ;;
esac
exit 0
`, 0o755);
  return { dir, registro, leer: () => (fs.existsSync(registro) ? fs.readFileSync(registro, "utf8") : "") };
}

/**
 * Simular una máquina SIN `gh`.
 *
 * Los runners de GitHub traen `gh` instalado, así que las pruebas que dan
 * por hecho que no lo hay fallaban allí y no aquí. El primer intento fue
 * quitar del PATH las carpetas que tienen un `gh`… y en esos mismos runners
 * `gh` y `git` viven en la misma carpeta: el script se quedaba sin `git`.
 * La manera buena es decírselo al script: `--sin-gh` (o SHIN_SIN_GH=1),
 * que además sirve de verdad cuando `gh` está instalado pero sin sesión.
 */
const SIN_GH = { SHIN_SIN_GH: "1" };

function publicar(repo, args = [], { gh, env = {} } = {}) {
  const entorno = {
    ...process.env,
    NO_COLOR: "1",
    PATH: gh ? `${gh}:${process.env.PATH}` : process.env.PATH,
    // El token se borra a propósito, aunque lo haya en el entorno: si alguien
    // publica de verdad con `GH_TOKEN` puesto, las pruebas que simulan «sin
    // gh» dejarían de simularlo y verían una release por la API. Pasó: la
    // suite se puso en rojo justo durante una publicación, y por un motivo
    // que no tenía nada que ver con lo publicado. Cada prueba que quiere un
    // token lo pasa explícitamente.
    GH_TOKEN: "",
    GITHUB_TOKEN: "",
    // La identidad va aquí y no solo en el helper de git: `publicar` hace su
    // propio `git commit`, y en un runner de CI no hay `user.name` global.
    // Sin esto, las trece pruebas de este archivo fallaban en GitHub Actions
    // con «empty ident name» mientras pasaban en cualquier máquina ya usada.
    GIT_AUTHOR_NAME: "prueba",
    GIT_AUTHOR_EMAIL: "p@e.st",
    GIT_COMMITTER_NAME: "prueba",
    GIT_COMMITTER_EMAIL: "p@e.st",
    ...env,
  };
  // Se llama al script directamente: `npm run` añadiría ruido y su propio
  // manejo de argumentos a una prueba que quiere ver el resultado exacto.
  const r = spawnSync(process.execPath, [path.join(repo, "scripts", "publicar.mjs"), ...args], {
    cwd: repo,
    encoding: "utf8",
    env: entorno,
    input: "s\n",
    timeout: 120_000,
  });
  return { status: r.status, salida: `${r.stdout || ""}${r.stderr || ""}` };
}

const hash = (archivo) => crypto.createHash("sha256").update(fs.readFileSync(archivo)).digest("hex");

// ═══════════════════════════════════════════════════════════════════

test("una orden: sube versión, firma, etiqueta, push y release", () => {
  const { trabajo, remoto } = copiaDelRepo("3.7.0");
  const gh = ghFalso();

  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si"], { gh: gh.dir });

  assert.equal(r.status, 0, r.salida);
  // 1. versión en package.json, package-lock.json y datos.json
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, "package.json"), "utf8")).version, "3.7.1");
  const cerrojo = JSON.parse(fs.readFileSync(path.join(trabajo, "package-lock.json"), "utf8"));
  assert.equal(cerrojo.version, "3.7.1", "el lock no puede quedarse atrás");
  assert.equal(cerrojo.packages[""].version, "3.7.1");
  // 2. huella nueva y synchronizada con shin.sh
  const sumas = fs.readFileSync(path.join(trabajo, "SHA256SUMS"), "utf8");
  assert.match(sumas, new RegExp(`^${hash(path.join(trabajo, "install.sh"))}  install\\.sh$`, "m"));
  assert.match(sumas, new RegExp(`^${hash(path.join(trabajo, "shin.sh"))}  shin\\.sh$`, "m"));
  assert.match(fs.readFileSync(path.join(trabajo, "shin.sh"), "utf8"), /SHIN_VERSION:-v3\.7\.1/);
  // 3. etiqueta creada, anotada, y en el remoto
  // `refs/tags/x` a secas apunta al OBJETO etiqueta; el commit se pide con ^{}.
  assert.equal(git(trabajo, "rev-parse", "-q", "--verify", "refs/tags/v3.7.1^{commit}"), git(trabajo, "rev-parse", "HEAD"));
  assert.equal(git(trabajo, "cat-file", "-t", "v3.7.1"), "tag", "tiene que ser una etiqueta anotada");
  assert.equal(git(remoto, "rev-parse", "-q", "--verify", "refs/tags/v3.7.1^{commit}"), git(trabajo, "rev-parse", "HEAD"));
  assert.equal(git(remoto, "rev-parse", "main"), git(trabajo, "rev-parse", "main"));
  // 4. release con los tres archivos y notas generadas
  const llamadas = gh.leer();
  assert.match(llamadas, /release create v3\.7\.1 install\.sh shin\.sh SHA256SUMS/);
  assert.match(llamadas, /--generate-notes/);
  assert.match(llamadas, /--verify-tag/);
  // 5. dice cómo se instala lo publicado
  assert.match(r.salida, /raw\.githubusercontent\.com\/.*\/v3\.7\.1\/shin\.sh/);
});

test("sin versión, sube el parche", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  const gh = ghFalso();
  const r = publicar(trabajo, ["--rapido", "--si"], { gh: gh.dir });
  assert.equal(r.status, 0, r.salida);
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, "package.json"), "utf8")).version, "3.7.1");
  assert.match(r.salida, /v3\.7\.1/);
});

test("entiende minor y major", () => {
  for (const [pedido, esperado] of [["minor", "3.8.0"], ["major", "4.0.0"]]) {
    const { trabajo } = copiaDelRepo("3.7.4");
    const gh = ghFalso();
    const r = publicar(trabajo, [pedido, "--rapido", "--si"], { gh: gh.dir });
    assert.equal(r.status, 0, r.salida);
    assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, "package.json"), "utf8")).version, esperado);
  }
});

test("--seco enseña el plan y no toca nada", () => {
  const { trabajo, remoto } = copiaDelRepo("3.7.0");
  const antes = git(trabajo, "rev-parse", "HEAD");
  const gh = ghFalso();

  const r = publicar(trabajo, ["3.9.0", "--seco"], { gh: gh.dir });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /3\.9\.0/);
  assert.match(r.salida, /no se ha tocado nada/);
  assert.equal(git(trabajo, "rev-parse", "HEAD"), antes, "no puede haber commit");
  assert.equal(git(trabajo, "tag", "--list").trim(), "", "no puede haber etiqueta");
  assert.equal(gh.leer(), "", "no puede haber llamado a gh");
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, "package.json"), "utf8")).version, "3.7.0");
  assert.equal(git(remoto, "rev-parse", "main"), antes);
});

test("si la etiqueta ya existe, se para antes de tocar nada", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  git(trabajo, "tag", "-a", "v3.7.0", "-m", "ya estaba");
  const antes = git(trabajo, "rev-parse", "HEAD");
  const gh = ghFalso();

  const r = publicar(trabajo, ["3.7.0", "--rapido", "--si"], { gh: gh.dir });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /ya existe/);
  assert.match(r.salida, /git tag -d v3\.7\.0/, "tiene que decir cómo deshacerlo");
  assert.equal(git(trabajo, "rev-parse", "HEAD"), antes);
  assert.equal(gh.leer(), "");
});

test("desde otra rama no publica", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  git(trabajo, "checkout", "--quiet", "-b", "pruebas");
  const gh = ghFalso();
  const r = publicar(trabajo, ["--rapido", "--si"], { gh: gh.dir });
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /estás en "pruebas"/);
});

test("--sin-release publica código y etiqueta, sin GitHub Release", () => {
  const { trabajo, remoto } = copiaDelRepo("3.7.0");
  const gh = ghFalso();
  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si", "--sin-release"], { gh: gh.dir });
  assert.equal(r.status, 0, r.salida);
  assert.equal(gh.leer(), "", "no puede llamar a gh");
  assert.ok(git(remoto, "tag", "--list").includes("v3.7.1"), "pero la etiqueta sí se sube");
});

test("sin gh avisa y deja todo listo para la release manual", () => {
  const { trabajo, remoto } = copiaDelRepo("3.7.0");
  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si"], { env: SIN_GH });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /no encuentro `gh`/);
  assert.ok(git(remoto, "tag", "--list").includes("v3.7.1"));
  assert.match(r.salida, /gh release create v3\.7\.1/, "tiene que dar la orden que falta");
});

test("si la suite falla, no se publica nada", () => {
  const { trabajo, remoto } = copiaDelRepo("3.7.0");
  // Una prueba que siempre falla: la suite real se corta con código 1.
  escribir(path.join(trabajo, "scripts", "run-tests.mjs"),
    "console.error('✕ prueba roja de mentira');process.exit(1);\n");
  escribir(path.join(trabajo, "test"), "");
  fs.rmSync(path.join(trabajo, "test"), { force: true });
  fs.mkdirSync(path.join(trabajo, "test"));
  escribir(path.join(trabajo, "test", "resumen-suite.json"), JSON.stringify({ pasan: 0, total: 1, archivos: 1, fallos: 1 }));

  const antes = git(trabajo, "rev-parse", "HEAD");
  const gh = ghFalso();
  const r = publicar(trabajo, ["3.7.1", "--si"], { gh: gh.dir });

  assert.notEqual(r.status, 0, "con la suite en rojo no puede seguir");
  assert.equal(git(trabajo, "rev-parse", "HEAD"), antes, "no puede haber commit");
  assert.equal(git(remoto, "tag", "--list").trim(), "", "no puede haber etiqueta en el remoto");
  assert.equal(gh.leer(), "", "no puede haber release");
});

test("sin gh pero con GH_TOKEN, la release se anuncia por la API", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  // `--seco` no llama a la red: lo que se comprueba es que el plan ya cuenta
  // con la release, para que la orden única no acabe en «subí el código pero
  // no hay release».
  const r = publicar(trabajo, ["3.9.0", "--seco"], { env: { ...SIN_GH, GH_TOKEN: "token-de-prueba" } });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /release v3\.9\.0 por la API/, r.salida);
  assert.doesNotMatch(r.salida, /sin GitHub Release/, "no debe renunciar a la release si hay token");
});

test("sin gh y sin token, avisa en vez de fallar", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  const r = publicar(trabajo, ["3.9.0", "--seco"], { env: { ...SIN_GH, GH_TOKEN: "", GITHUB_TOKEN: "" } });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /sin GitHub Release/);
  assert.match(r.salida, /GH_TOKEN/, "tiene que decir cómo arreglarlo");
});

test("--sin-gh fuerza la API aunque gh esté instalado", () => {
  // La otra manera de decirlo, además de SHIN_SIN_GH=1. Sirve de verdad en
  // una máquina con `gh` instalado pero sin sesión iniciada.
  const { trabajo } = copiaDelRepo("3.7.0");
  const r = publicar(trabajo, ["3.9.0", "--seco", "--sin-gh"], {
    env: { GH_TOKEN: "token-de-prueba" },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /release v3\.9\.0 por la API/, r.salida);
  assert.doesNotMatch(r.salida, /gh release create/, "no puede planear usar gh");
});

test("sin identidad de git se para con un mensaje que sirve de algo", () => {
  // Un runner de CI, un contenedor o una máquina recién instalada no tienen
  // `user.name`. Antes, `git commit` moría con «empty ident name» al final de
  // todo, después de la suite entera. Ahora se comprueba antes de tocar nada.
  const { trabajo } = copiaDelRepo("3.7.0");
  const antes = git(trabajo, "rev-parse", "HEAD");
  const vacio = temporal("shin-sin-identidad");
  const r = publicar(trabajo, ["3.9.0", "--si"], {
    env: {
      HOME: vacio,
      XDG_CONFIG_HOME: path.join(vacio, ".config"),
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_AUTHOR_NAME: "",
      GIT_AUTHOR_EMAIL: "",
      GIT_COMMITTER_NAME: "",
      GIT_COMMITTER_EMAIL: "",
    },
  });
  assert.notEqual(r.status, 0, "sin identidad no puede seguir");
  assert.match(r.salida, /git no sabe quién eres/, r.salida);
  assert.match(r.salida, /git config --global user\.name/, "tiene que decir cómo arreglarlo");
  assert.equal(git(trabajo, "rev-parse", "HEAD"), antes, "y no puede dejar nada a medias");
});

test("el README queda con los números reales de la suite", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  fs.writeFileSync(path.join(trabajo, "README.md"),
    "# Shin-MD\n\n<img alt=\"300/300 pruebas\">\n\nbadge 300%2F300%20pruebas\n\nnpm test  # las 300 pruebas\n");
  fs.mkdirSync(path.join(trabajo, "test"), { recursive: true });
  fs.writeFileSync(path.join(trabajo, "test", "resumen-suite.json"),
    JSON.stringify({ pasan: 345, total: 345, archivos: 40, fallos: 0 }));

  const gh = ghFalso();
  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si", "--sin-release"], { gh: gh.dir });
  assert.equal(r.status, 0, r.salida);

  const readme = fs.readFileSync(path.join(trabajo, "README.md"), "utf8");
  assert.match(readme, /345\/345 pruebas/);
  assert.match(readme, /345%2F345%20pruebas/);
  assert.match(readme, /# las 345 pruebas/);
  assert.doesNotMatch(readme, /300/, "no puede quedar ningún número viejo");
});

test("el comando de instalación apunta a GitHub, nunca a una ruta local", () => {
  // 1. `origin` es una carpeta del disco (como en una copia de pruebas):
  //    la URL tiene que salir del `repository` del package.json.
  const uno = copiaDelRepo("3.7.0");
  const gh1 = ghFalso();
  const r1 = publicar(uno.trabajo, ["3.7.1", "--rapido", "--si", "--sin-release"], { gh: gh1.dir });
  assert.equal(r1.status, 0, r1.salida);
  assert.match(r1.salida, /raw\.githubusercontent\.com\/riokuroxi-svg\/Shin-MD\/v3\.7\.1\/shin\.sh/);
  assert.doesNotMatch(r1.salida, /raw\.githubusercontent\.com\/\.\./, "no puede colarse una ruta");

  // 2. `origin` sí es de GitHub: se usa tal cual, quitando el `.git`.
  //    El `insteadOf` desvía el push a una carpeta local para no tocar la red;
  //    la URL guardada sigue siendo la de GitHub, que es lo que se lee.
  const dos = copiaDelRepo("3.7.0");
  git(dos.trabajo, "remote", "set-url", "origin", "git@github.com:ejemplo/otro.git");
  git(dos.trabajo, "config", `url.${dos.remoto}.insteadOf`, "git@github.com:ejemplo/otro.git");
  const gh2 = ghFalso();
  const r2 = publicar(dos.trabajo, ["3.7.1", "--rapido", "--si", "--sin-release"], { gh: gh2.dir });
  assert.equal(r2.status, 0, r2.salida);
  assert.match(r2.salida, /raw\.githubusercontent\.com\/ejemplo\/otro\/v3\.7\.1\/shin\.sh/);
});

test("la huella publicada cuadra de verdad (sha256sum -c)", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  const gh = ghFalso();
  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si", "--sin-release"], { gh: gh.dir });
  assert.equal(r.status, 0, r.salida);

  // El flujo real de la release: los tres archivos, en una carpeta, y
  // `sha256sum -c` como lo haría cualquiera que se baje la versión.
  const publicados = temporal("shin-assets");
  for (const f of ["install.sh", "shin.sh", "SHA256SUMS"]) {
    fs.copyFileSync(path.join(trabajo, f), path.join(publicados, f));
  }
  const check = spawnSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: publicados, encoding: "utf8" });
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /install\.sh: OK/);
  assert.match(check.stdout, /shin\.sh: OK/);
});

test("no deja el repositorio en un estado a medias", () => {
  const { trabajo } = copiaDelRepo("3.7.0");
  const gh = ghFalso();
  const r = publicar(trabajo, ["3.7.1", "--rapido", "--si"], { gh: gh.dir });
  assert.equal(r.status, 0, r.salida);
  // Todo lo que escribió quedó commiteado: nada suelto para el siguiente.
  assert.equal(git(trabajo, "status", "--porcelain"), "", "no puede quedar nada sin commitear");
  assert.equal(git(trabajo, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  void BASH;
});
