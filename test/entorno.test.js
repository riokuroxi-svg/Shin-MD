/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  entorno.test.js — Lo que el instalador hace con la máquina.
//
//  Instalar un bot no es solo copiar archivos: hay que tener Node, git
//  y —en un servidor— algo que lo levante si el VPS se reinicia. Todo
//  eso toca la máquina, así que se prueba con dobles: `apt-get`,
//  `systemctl` y `nodejs.org` simulados, y ninguna llamada real fuera
//  del directorio temporal.
//
//  Las tres reglas que se comprueban aquí, y que importan:
//    · Sin terminal no se instala NADA del sistema (ni con sudo, ni
//      apt, ni dnf): un `curl | sh` no puede decidir eso por ti.
//    · Node se puede instalar sin root, en tu carpeta, comprobando la
//      huella que publica nodejs.org. Si la huella no cuadra, no se
//      instala.
//    · `--doctor` y `--service --print` no cambian nada: solo miran y
//      cuentan.
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
const INSTALADOR = path.join(RAIZ, "install.sh");
const NODE_REAL = process.execPath;
const BIN_NODE = path.dirname(NODE_REAL);
const TMP = fs.realpathSync(os.tmpdir());
const NPM_REAL = (() => {
  const r = spawnSync("sh", ["-c", "command -v npm"], { encoding: "utf8" });
  return (r.stdout || "").trim();
})();
// Ruta absoluta al bash: cuando una prueba le da al instalador un PATH sin
// /bin (para simular un contenedor mínimo), spawnSync buscaría "bash" en ese
// PATH y no lo encontraría. El script se lanza siempre con su ruta real.
const BASH = (() => {
  const r = spawnSync("sh", ["-c", "command -v bash"], { encoding: "utf8" });
  return (r.stdout || "").trim();
})();
const TAR = (() => {
  const r = spawnSync("sh", ["-c", "command -v tar"], { encoding: "utf8" });
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

function correr(script, args, { cwd, raiz, home, pathExtra = [], env = {}, entrada } = {}) {
  if (raiz) assert.ok(path.resolve(raiz).startsWith(TMP + path.sep), `fuera de ${TMP}`);
  const hogar = home || temporal("shin-home");
  const entorno = {
    ...process.env,
    NO_COLOR: "1",
    HOME: hogar,
    PATH: [...pathExtra, BIN_NODE, process.env.PATH].join(":"),
    SHIN_NO_BORRAR: `${RAIZ}:${process.env.SHIN_NO_BORRAR || ""}`,
    SHIN_ESPACIO_MIN_MB: "1",
    ...(raiz ? { SHIN_INSTALL_ROOT: raiz } : {}),
    ...env,
  };
  assert.ok(BASH, "hace falta bash para las pruebas");
  const r = spawnSync(BASH, [script, ...args], {
    cwd: cwd || TMP,
    env: entorno,
    encoding: "utf8",
    input: entrada,
    timeout: 300_000,
  });
  return { status: r.status, salida: `${r.stdout || ""}${r.stderr || ""}`, home: hogar };
}

function crearOrigen(nombre = "shin-md") {
  const dir = temporal("shin-origen");
  escribir(path.join(dir, "package.json"), JSON.stringify({
    name: nombre,
    version: "9.9.9",
    private: true,
    type: "module",
    scripts: { start: "node index.js", postinstall: "node scripts/preparar.cjs" },
  }, null, 2) + "\n");
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
if (process.argv.includes("--check")) process.exit(fs.existsSync(marca) ? 0 : 1);
`);
  escribir(path.join(dir, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));
  git(dir, "init", "--quiet", "--initial-branch", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "origen de prueba");
  return dir;
}

function instalar(origen, extra = {}) {
  const raiz = temporal("shin-inst");
  const r = correr(INSTALADOR, ["--yes"], { cwd: raiz, raiz, env: { SHIN_REPO_URL: origen, ...extra } });
  assert.equal(r.status, 0, `la instalación debía funcionar:\n${r.salida}`);
  return { raiz, proyecto: path.join(raiz, "Shin-MD"), home: r.home };
}

/** Un nodejs.org de mentira: SHASUMS256.txt + el .tar.gz que describe. */
function publicarNode({ version = "22.5.0", arch = "linux-x64", huellaMala = false } = {}) {
  const dir = temporal("shin-nodejs");
  const carpeta = `node-v${version}-${arch}`;
  const staging = path.join(dir, "staging");
  // Los binarios son guiones de shell que delegan en el Node real: así el
  // instalador cree tener un Node de verdad y puede seguir trabajando.
  escribir(path.join(staging, carpeta, "bin", "node"), `#!/bin/sh
case "$*" in
  "-p process.versions.node") echo "${version}"; exit 0 ;;
esac
exec "${NODE_REAL}" "$@"
`, 0o755);
  escribir(path.join(staging, carpeta, "bin", "npm"), `#!/bin/sh
case "$1" in
  -v|--version) echo "10.9.9"; exit 0 ;;
esac
exec "${NPM_REAL}" "$@"
`, 0o755);

  const tarball = path.join(dir, `${carpeta}.tar.gz`);
  const empaquetar = spawnSync(TAR, ["-czf", tarball, "-C", staging, carpeta], { encoding: "utf8" });
  assert.equal(empaquetar.status, 0, `no pude empaquetar: ${empaquetar.stderr}`);

  const real = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
  const declarada = huellaMala ? "1".repeat(64) : real;
  escribir(path.join(dir, "SHASUMS256.txt"),
    `${declarada}  ${carpeta}.tar.gz\n` +
    `${"0".repeat(64)}  node-v${version}-linux-arm64.tar.gz\n`);
  return { dir, carpeta, tarball };
}

// ═══════════════════════════════════════════════════════════════════
//  Node sin root, desde nodejs.org, comprobando la huella
// ═══════════════════════════════════════════════════════════════════

test("instala Node sin root desde nodejs.org y comprueba su huella", () => {
  const origen = crearOrigen();
  const nodo = publicarNode();
  const raiz = temporal("shin-sinroot");
  const home = temporal("shin-casa-node");
  // Sin node en el PATH: es el caso de un VPS recién creado. Se deja lo
  // mínimo del sistema (sh, git, tar, curl) y nada de node ni npm.
  const minimo = temporal("shin-path-minimo");
  for (const bin of ["git", "tar", "curl", "gzip", "sha256sum", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "sleep", "mkdir", "mv", "rm", "chmod", "ln", "cat"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }

  const r = correr(INSTALADOR, ["--yes"], {
    cwd: raiz, raiz, home,
    env: {
      SHIN_REPO_URL: origen,
      PATH: `${minimo}:/usr/bin:/bin`,
      SHIN_NODE_BASE: `file://${nodo.dir}`,
    },
  });

  assert.equal(r.status, 0, `debía instalar Node y seguir:\n${r.salida}`);
  assert.match(r.salida, /nodejs\.org/);
  assert.match(r.salida, /node 22\.5\.0 en/);
  // Quedó en la carpeta del usuario, no en el sistema.
  assert.ok(fs.existsSync(path.join(home, ".local", "opt", "node", "bin", "node")));
  // Y el PATH se apuntó una sola vez, con marcas para poder deshacerlo.
  const perfil = ["/.bashrc", "/.profile", "/.zshrc"].map((f) => path.join(home, f)).find((f) => fs.existsSync(f));
  assert.ok(perfil, "tiene que dejar el PATH en algún archivo de perfil");
  const texto = fs.readFileSync(perfil, "utf8");
  assert.match(texto, /# >>> Shin-MD >>>/);
  assert.match(texto, /# <<< Shin-MD <<</);
  assert.ok(texto.includes(path.join(home, ".local", "opt", "node", "bin")));
  // Instalación completa: el bot quedó listo con ese Node.
  assert.ok(fs.existsSync(path.join(raiz, "Shin-MD", "node_modules", "express")));
  assert.ok(fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
});

test("el PATH no se apunta dos veces al repetir el comando", () => {
  const origen = crearOrigen();
  const nodo = publicarNode();
  const raiz = temporal("shin-rep");
  const home = temporal("shin-casa-rep");
  escribir(path.join(home, ".bashrc"), "# mi bashrc\n");
  const minimo = temporal("shin-path-minimo2");
  for (const bin of ["git", "tar", "curl", "gzip", "sha256sum", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "sleep", "mkdir", "mv", "rm", "chmod", "ln", "cat"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }
  const env = {
    SHIN_REPO_URL: origen,
    PATH: `${minimo}:/usr/bin:/bin`,
    SHIN_NODE_BASE: `file://${nodo.dir}`,
  };
  const uno = correr(INSTALADOR, ["--yes"], { cwd: raiz, raiz, home, env });
  assert.equal(uno.status, 0, uno.salida);
  const dos = correr(INSTALADOR, ["--yes"], { cwd: raiz, raiz, home, env });
  assert.equal(dos.status, 0, dos.salida);

  const texto = fs.readFileSync(path.join(home, ".bashrc"), "utf8");
  const bloques = texto.match(/# >>> Shin-MD >>>/g) || [];
  assert.equal(bloques.length, 1, `el bloque no puede repetirse:\n${texto}`);
  assert.equal(texto.match(/mi bashrc/)[0], "mi bashrc", "lo que había no se toca");
});

test("si la huella de Node no coincide, no se instala", () => {
  const origen = crearOrigen();
  const nodo = publicarNode({ huellaMala: true });
  const raiz = temporal("shin-node-malo");
  const home = temporal("shin-casa-node-malo");
  const minimo = temporal("shin-path-minimo3");
  for (const bin of ["git", "tar", "curl", "gzip", "sha256sum", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "sleep", "mkdir", "mv", "rm", "chmod", "ln", "cat"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }

  const r = correr(INSTALADOR, ["--yes"], {
    cwd: raiz, raiz, home,
    env: { SHIN_REPO_URL: origen, PATH: `${minimo}:/usr/bin:/bin`, SHIN_NODE_BASE: `file://${nodo.dir}` },
  });

  assert.notEqual(r.status, 0, "no puede seguir sin Node");
  assert.match(r.salida, /la huella de Node no coincide/);
  assert.ok(!fs.existsSync(path.join(home, ".local", "opt", "node", "bin", "node")),
    "no puede quedar un Node sin verificar");
});

// ═══════════════════════════════════════════════════════════════════
//  El sistema de paquetes: con permiso, y solo entonces
// ═══════════════════════════════════════════════════════════════════

test("sin terminal no se toca el gestor de paquetes, ni con --yes", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-sin-permiso");
  const falso = temporal("shin-apt");
  const registro = path.join(falso, "llamadas.log");
  // Un apt-get que apunta lo que le piden y no hace nada.
  escribir(path.join(falso, "apt-get"), `#!/bin/sh
echo "apt-get $*" >> "${registro}"
exit 0
`, 0o755);
  const minimo = temporal("shin-path-minimo4");
  for (const bin of ["git", "curl", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "sleep", "mkdir", "mv", "rm", "chmod", "ln", "cat"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }

  const r = correr(INSTALADOR, ["--yes"], {
    cwd: raiz, raiz,
    env: {
      SHIN_REPO_URL: origen,
      PATH: `${falso}:${minimo}:/usr/bin:/bin`,
      SHIN_NO_INSTALAR: "0",
      SHIN_NODE_BASE: `file://${path.join(raiz, "no-hay-node")}`,
    },
  });

  assert.notEqual(r.status, 0, "sin Node no se puede instalar");
  assert.match(r.salida, /Hace falta Node 22\.5\.0|demasiado antiguo \(hace falta 22\.5\.0/);
  assert.ok(!fs.existsSync(registro) || !/install/.test(fs.readFileSync(registro, "utf8")),
    "sin terminal no puede llamar a apt-get install");
});

test("con SHIN_PERMITIR_PAQUETAS=1 sí usa el gestor del sistema", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-con-permiso");
  const falso = temporal("shin-apt2");
  const registro = path.join(falso, "llamadas.log");
  escribir(path.join(falso, "apt-get"), `#!/bin/sh
echo "apt-get $*" >> "${registro}"
exit 0
`, 0o755);
  // `id -u` devolviendo 0: así se prueba la ruta de root sin necesitar root.
  escribir(path.join(falso, "id"), `#!/bin/sh
case "$1" in -u) echo 0 ;; *) echo "uid=0(root)" ;; esac
exit 0
`, 0o755);
  const minimo = temporal("shin-path-minimo5");
  for (const bin of ["git", "curl", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "sleep", "mkdir", "mv", "rm", "chmod", "ln", "cat"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }

  const r = correr(INSTALADOR, ["--yes"], {
    cwd: raiz, raiz,
    env: {
      SHIN_REPO_URL: origen,
      PATH: `${falso}:${minimo}:/usr/bin:/bin`,
      SHIN_NO_INSTALAR: "0",
      SHIN_PERMITIR_PAQUETAS: "1",
      SHIN_NODE_BASE: `file://${path.join(raiz, "no-hay-node")}`,
    },
  });

  // apt-get no instala nada de verdad, así que el script termina fallando;
  // lo que importa es que lo INTENTÓ porque se le dio permiso.
  assert.ok(fs.existsSync(registro), "tenía permiso: debía llamar a apt-get");
  assert.match(fs.readFileSync(registro, "utf8"), /nodejs/);
  assert.doesNotMatch(r.salida, /sin terminal interactiva/);
});

// ═══════════════════════════════════════════════════════════════════
//  --doctor : mirar sin tocar
// ═══════════════════════════════════════════════════════════════════

test("--doctor cuenta el estado y no cambia nada", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  const antes = fs.readdirSync(proyecto).sort().join(",");

  const r = correr(path.join(proyecto, "install.sh"), ["--doctor"], { cwd: proyecto, home });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /diagnóstico/);
  assert.match(r.salida, /\[equipo\]/);
  assert.match(r.salida, /\[node y npm\]/);
  assert.match(r.salida, /\[instalación\]/);
  assert.match(r.salida, /\[datos\]/);
  assert.match(r.salida, /todo en orden/);
  assert.match(r.salida, /no se muestra su contenido/,
    "del .env no puede salir ni una clave");
  assert.equal(fs.readdirSync(proyecto).sort().join(","), antes, "no puede tocar la instalación");
});

test("--doctor detecta una instalación rota y dice cómo arreglarla", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  fs.rmSync(path.join(proyecto, "node_modules"), { recursive: true, force: true });

  const r = correr(path.join(proyecto, "install.sh"), ["--doctor"], { cwd: proyecto, home });

  assert.notEqual(r.status, 0, "con algo roto no puede decir que todo está bien");
  assert.match(r.salida, /faltan módulos clave|no hay node_modules/);
  assert.match(r.salida, /shin repair|volver a instalar/);
});

test("--doctor sobre una carpeta sin nada lo dice, sin romperse", () => {
  const vacia = temporal("shin-vacia");
  const r = correr(INSTALADOR, ["--doctor", "--dir", path.join(vacia, "Shin-MD")], { cwd: vacia });
  assert.notEqual(r.status, 0, "sin instalación no puede decir que todo está bien");
  assert.match(r.salida, /no hay instalación/);
});

// ═══════════════════════════════════════════════════════════════════
//  --service : sobrevivir a un reinicio del VPS
// ═══════════════════════════════════════════════════════════════════

test("--service --print enseña la unidad y no escribe nada", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);

  const r = correr(path.join(proyecto, "install.sh"), ["--service", "--print"], { cwd: proyecto, home });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /\[Unit\]/);
  assert.match(r.salida, /\[Service\]/);
  assert.match(r.salida, /\[Install\]/);
  assert.match(r.salida, /Restart=always/);
  assert.ok(r.salida.includes(`WorkingDirectory=${proyecto}`));
  assert.ok(r.salida.includes(`ExecStart=${NODE_REAL} ${proyecto}/index.js`) ||
            new RegExp(`ExecStart=\\S*node ${proyecto.replace(/[/.]/g, "\\$&")}/index\\.js`).test(r.salida),
    "ExecStart tiene que ser una ruta absoluta al node que funciona");
  assert.match(r.salida, /Environment=PATH=.*\/bin/,
    "el PATH del servicio no es el de la terminal: hay que escribirlo");
  assert.match(r.salida, /NoNewPrivileges=yes/);
  assert.ok(!fs.existsSync(path.join(home, ".config", "systemd")), "no puede escribir la unidad con --print");
});

test("--service --user escribe la unidad y activa el servicio", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  const falso = temporal("shin-systemctl");
  const registro = path.join(falso, "llamadas.log");
  escribir(path.join(falso, "systemctl"), `#!/bin/sh
echo "systemctl $*" >> "${registro}"
exit 0
`, 0o755);

  const r = correr(path.join(proyecto, "install.sh"), ["--service", "--user", "--yes"], {
    cwd: proyecto, home, pathExtra: [falso],
  });

  assert.equal(r.status, 0, r.salida);
  const unidad = path.join(home, ".config", "systemd", "user", "shin-md.service");
  assert.ok(fs.existsSync(unidad), "tiene que dejar la unidad donde systemd la busca");
  const texto = fs.readFileSync(unidad, "utf8");
  assert.ok(texto.includes(`WorkingDirectory=${proyecto}`));
  assert.match(texto, /WantedBy=default\.target/);

  const llamadas = fs.readFileSync(registro, "utf8");
  assert.match(llamadas, /--user daemon-reload/);
  assert.match(llamadas, /--user enable --now shin-md/);
  assert.match(r.salida, /loginctl enable-linger/,
    "un servicio de usuario se para al cerrar sesión: hay que decirlo");
});

test("--service no se ofrece para un clon de desarrollo", () => {
  // Una carpeta con git y package.json pero sin marca de instalación es un
  // clon de trabajo: un servicio del sistema apuntando ahí se rompe solo.
  const origen = crearOrigen();
  const raiz = temporal("shin-clon");
  const clon = path.join(raiz, "Shin-MD");
  fs.mkdirSync(clon, { recursive: true });
  for (const f of ["package.json", "index.js", "install.sh", "package-lock.json"]) {
    fs.copyFileSync(path.join(origen, f), path.join(clon, f));
  }
  git(clon, "init", "--quiet", "--initial-branch", "main");

  const r = correr(path.join(clon, "install.sh"), ["--service", "--print", "--yes"], { cwd: clon });
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /instalación terminada|falta \.shin-install/);
});

test("sin systemd lo dice y ofrece la alternativa", () => {
  const origen = crearOrigen();
  const { proyecto, home } = instalar(origen);
  const vacio = temporal("shin-sin-systemctl");
  // PATH sin systemctl (pero con lo necesario para que el script respire).
  const minimo = temporal("shin-path-minimo6");
  for (const bin of ["git", "uname", "sed", "awk", "grep", "cut", "head", "mktemp", "dirname", "basename", "id", "mkdir", "mv", "rm", "ln", "cat", "du", "df", "pgrep", "wc", "tr"]) {
    const donde = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
    if (donde) fs.symlinkSync(donde, path.join(minimo, bin));
  }

  const r = correr(path.join(proyecto, "install.sh"), ["--service"], {
    cwd: proyecto, home, env: { PATH: `${vacio}:${minimo}:${BIN_NODE}` },
  });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /Unidad de systemd/);
  assert.match(r.salida, /no tiene systemd|pm2/);
});
