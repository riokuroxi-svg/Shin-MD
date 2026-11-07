/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  instalador.test.js — El instalador de un comando, probado de verdad.
//
//  Cada prueba ejecuta `install.sh` como lo haría un usuario: bash,
//  git y npm reales, en una carpeta temporal. Lo que se simula es lo
//  que no se puede tener aquí (un Android, un npm que falla, un
//  Ctrl+C), y se simula por el mismo camino que usaría el sistema
//  operativo: stubs en el PATH y señales al grupo de procesos.
//
//  Dos reglas que esta suite se impone a sí misma:
//   · Nada fuera de un directorio temporal. Toda carpeta que se le
//     entrega al instalador se comprueba antes de ejecutar nada.
//   · Siempre se ejecuta el install.sh DE LA INSTALACIÓN bajo prueba,
//     nunca el del repositorio de trabajo: así una prueba no puede
//     operar sobre el código que la está ejecutando.
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
const BIN_NODE = path.dirname(process.execPath);
const TMP = fs.realpathSync(os.tmpdir());

// ─────────────────────── utilidades ───────────────────────
const temporales = [];
function temporal(etiqueta = "shin") {
  const d = fs.mkdtempSync(path.join(TMP, `${etiqueta}-`));
  temporales.push(d);
  return d;
}
process.on("exit", () => {
  for (const d of temporales) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

/** Ninguna prueba puede salirse del directorio temporal. */
function dentroDeTmp(destino) {
  const real = path.resolve(destino);
  assert.ok(real.startsWith(TMP + path.sep), `ruta fuera de ${TMP}: ${real}`);
  return real;
}

function escribir(archivo, contenido, modo) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, contenido);
  if (modo) fs.chmodSync(archivo, modo);
}

function hashDe(archivo) {
  return crypto.createHash("sha256").update(fs.readFileSync(archivo)).digest("hex");
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

/** Corre el instalador indicado y devuelve { status, salida }. */
// Cada llamada al instalador recibe su propio $HOME, dentro de tmp. Sin esto,
// un --uninstall con --dir guarda los datos junto a $HOME de verdad y la suite
// iba dejando carpetas "Shin-MD-datos-*" en la carpeta del usuario.
const HOGARES = [];
function hogarFalso() {
  const d = temporal("shin-home");
  HOGARES.push(d);
  return d;
}

function correr(script, args, { cwd, raiz, env = {}, entrada } = {}) {
  if (raiz) dentroDeTmp(raiz);
  if (cwd) dentroDeTmp(cwd);
  const hogar = env.HOME || hogarFalso();
  const entorno = {
    ...process.env,
    NO_COLOR: "1",
    PATH: `${BIN_NODE}:${process.env.PATH}`,
    // Cinturón y tirantes: ni el instalador ni una prueba pueden borrar el
    // repositorio desde el que se ejecuta esta suite.
    SHIN_NO_BORRAR: `${RAIZ}:${process.env.SHIN_NO_BORRAR || ""}`,
    // El entorno de pruebas es un tmpfs pequeño; el umbral real se prueba aparte.
    SHIN_ESPACIO_MIN_MB: "1",
    HOME: hogar,
    // Ojo: no se pone SHIN_INSTALL_ROOT cuando no se pide, porque eso marca
    // el destino como explícito y desactiva la deducción desde la carpeta.
    ...(raiz ? { SHIN_INSTALL_ROOT: raiz } : {}),
    ...env,
  };
  const MARCA = path.join(RAIZ, "node_modules");
  const antes = fs.existsSync(MARCA);
  const r = spawnSync("bash", [script, ...args], {
    cwd: cwd || RAIZ,
    env: entorno,
    encoding: "utf8",
    input: entrada,
    timeout: 300_000,
  });
  if (antes && !fs.existsSync(MARCA)) {
    throw new Error(`ESTA LLAMADA BORRÓ node_modules del repositorio:\n  script=${script}\n  args=${args.join(" ")}\n  cwd=${cwd}\n  raiz=${raiz}`);
  }
  return { status: r.status, salida: `${r.stdout || ""}${r.stderr || ""}` };
}

/** Un repo de origen mínimo: package.json, entrypoint y un postinstall
 *  que deja las dependencias y el conector "parcheados" en su sitio. */
function crearOrigen() {
  const dir = temporal("shin-origen");
  escribir(path.join(dir, "package.json"), JSON.stringify({
    name: "shin-md",
    version: "9.9.9",
    private: true,
    type: "module",
    scripts: { postinstall: "node scripts/preparar.cjs" },
  }, null, 2) + "\n");
  escribir(path.join(dir, "index.js"), "export const arrancado = true;\n");
  escribir(path.join(dir, ".env.example"), "OWNER_NUMBER=\nPAIRING_METHOD=code\n");
  escribir(path.join(dir, "src", "storage", "migrations.js"),
    "export const MIGRATIONS = [\n  { version: 1, name: \"core\", up() {} },\n  { version: 2, name: \"economia\", up() {} }\n];\n");
  escribir(path.join(dir, ".gitignore"), "node_modules/\n.env\nbackups/\n");
  escribir(path.join(dir, "package-lock.json"), JSON.stringify({
    name: "shin-md", version: "9.9.9", lockfileVersion: 3, requires: true,
    packages: { "": { name: "shin-md", version: "9.9.9" } },
  }, null, 2) + "\n");

  // postinstall: deja los módulos que el instalador comprueba.
  escribir(path.join(dir, "scripts", "preparar.cjs"), `
const fs = require("node:fs");
const path = require("node:path");
const nm = path.join(__dirname, "..", "node_modules");
if (process.env.FIXTURE_FALLO_POSTINSTALAR === "1") {
  console.error("postinstall: fallo simulado");
  process.exit(1);
}
for (const m of ["express", "pino", "baileys", "sharp"]) {
  const d = path.join(nm, m);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: m, version: "1.0.0", main: "index.js" }));
  fs.writeFileSync(path.join(d, "index.js"), "module.exports = {};\\n");
}
const lib = path.join(nm, "baileys", "lib");
fs.mkdirSync(lib, { recursive: true });
if (process.env.FIXTURE_PARCHE_ROTO !== "1") {
  fs.writeFileSync(path.join(lib, ".parcheado"), "8 de 8\\n");
}
`);
  // El "conector": --check devuelve 0 solo si los parches están puestos.
  escribir(path.join(dir, "scripts", "patch-baileys.cjs"), `
const fs = require("node:fs");
const path = require("node:path");
const marca = path.join(__dirname, "..", "node_modules", "baileys", "lib", ".parcheado");
const puesto = fs.existsSync(marca);
if (process.argv.includes("--check")) {
  console.log(puesto ? "los 8 parches están aplicados" : "faltan parches");
  process.exit(puesto ? 0 : 1);
}
console.log("aplicando parches");
process.exit(0);
`);
  escribir(path.join(dir, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));
  git(dir, "init", "--quiet", "--initial-branch", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "origen de prueba");
  return dir;
}

/** Instala desde `origen` en una raíz temporal nueva. */
function instalacionLista(origen) {
  const raiz = temporal("shin-inst");
  const r = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(r.status, 0, `la instalación debía funcionar:\n${r.salida}`);
  const proyecto = path.join(raiz, "Shin-MD");
  return { raiz, proyecto, instalador: path.join(proyecto, "install.sh") };
}

/** Crea una base SQLite real (no un archivo con texto dentro: el instalador
 *  ahora se niega a seguir si no puede copiarla de forma consistente). */
function baseSqlite(ruta, filas = 3) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.rmSync(ruta, { force: true });
  const r = spawnSync(process.execPath, ["--no-warnings", "-e", `
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("CREATE TABLE mensajes (id INTEGER PRIMARY KEY, texto TEXT)");
    const ins = db.prepare("INSERT INTO mensajes (texto) VALUES (?)");
    for (let i = 0; i < Number(process.argv[2]); i++) ins.run("fila " + i);
    db.close();
  `, ruta, String(filas)], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no pude crear la base de prueba: ${r.stderr}`);
}

/** Datos de usuario: .env con un secreto, sesión y base de datos. */
function sembrarDatos(proyecto) {
  escribir(path.join(proyecto, ".env"), "OWNER_NUMBER=5210000000000\nSECRETO=no-se-toca\n");
  escribir(path.join(proyecto, "Sessions", "Owner", "auth.db"), "credenciales-de-verdad");
  baseSqlite(path.join(proyecto, "data", "shin.db"));
  return {
    env: hashDe(path.join(proyecto, ".env")),
    sesion: hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")),
    base: hashDe(path.join(proyecto, "data", "shin.db")),
  };
}

// ─────────────────────── vigilancia del repositorio ───────────────────────
// Esta suite ejecuta un instalador que borra cosas. Aunque todas las pruebas
// están encerradas en os.tmpdir(), se deja constancia del estado del
// repositorio desde el que corre: si algo lo altera, se ve al final y falla.
function firmaDelRepo() {
  const entradas = fs.readdirSync(RAIZ).sort();
  const pkg = crypto.createHash("sha256").update(fs.readFileSync(path.join(RAIZ, "package.json"))).digest("hex");
  return { entradas, pkg, tests: fs.readdirSync(path.join(RAIZ, "test")).length };
}
const REPO_AL_EMPEZAR = firmaDelRepo();

// ─────────────────────── pruebas ───────────────────────

test("detecta Termux y avisa de lo que Android hace con el bot", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-termux");
  const falso = temporal("shin-prefix");
  const registro = path.join(falso, "llamadas.log");
  escribir(path.join(falso, "bin", "pkg"),
    `#!/bin/sh\necho "pkg $*" >> "${registro}"\nexit 0\n`, 0o755);
  escribir(path.join(falso, "bin", "termux-wake-lock"),
    `#!/bin/sh\necho "wakelock" >> "${registro}"\nexit 0\n`, 0o755);

  const r = correr(INSTALADOR, ["--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, TERMUX_VERSION: "0.118.3", PREFIX: falso },
  });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /Android \/ Termux detectado/);
  assert.match(r.salida, /Acquire wakelock/);
  assert.match(r.salida, /procesos hijos/);

  const llamadas = fs.readFileSync(registro, "utf8");
  assert.match(llamadas, /pkg install -y ffmpeg/, "debe instalar ffmpeg con pkg");
  assert.match(llamadas, /pkg install -y yt-dlp/, "el binario propio de yt-dlp no corre en Android");
  assert.match(llamadas, /wakelock/, "debe pedir el wakelock");
});

test("detecta la arquitectura aunque uname diga aarch64", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-arch");
  const falso = temporal("shin-uname");
  // npm que falla al instalar: aquí solo interesa la línea de entorno.
  escribir(path.join(falso, "uname"),
    `#!/bin/sh\ncase "$1" in -m) echo aarch64 ;; -s) echo Linux ;; *) echo Linux ;; esac\n`, 0o755);
  escribir(path.join(falso, "npm"),
    "#!/bin/sh\ncase \"$1\" in -v|--version) echo 10.9.2; exit 0;; *) exit 1;; esac\n", 0o755);

  const r = correr(INSTALADOR, ["--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, PATH: `${falso}:${BIN_NODE}:${process.env.PATH}` },
  });

  assert.match(r.salida, /arm64/);
});

test("se niega a instalar con Node o npm demasiado viejos", () => {
  const origen = crearOrigen();
  const falso = temporal("shin-nodo18");
  escribir(path.join(falso, "node"),
    "#!/bin/sh\ncase \"$1\" in -p) echo 18.20.0;; *) exit 0;; esac\n", 0o755);

  const viejo = correr(INSTALADOR, ["--yes"], {
    raiz: temporal("shin-viejo"),
    env: { SHIN_REPO_URL: origen, PATH: `${falso}:${BIN_NODE}:${process.env.PATH}` },
  });
  assert.notEqual(viejo.status, 0);
  assert.match(viejo.salida, /demasiado antiguo/);
  assert.match(viejo.salida, /22\.5\.0/);

  const falsoNpm = temporal("shin-npm9");
  escribir(path.join(falsoNpm, "npm"),
    "#!/bin/sh\ncase \"$1\" in -v|--version) echo 9.8.1; exit 0;; *) exit 1;; esac\n", 0o755);
  const npmViejo = correr(INSTALADOR, ["--yes"], {
    raiz: temporal("shin-viejo2"),
    env: { SHIN_REPO_URL: origen, PATH: `${falsoNpm}:${BIN_NODE}:${process.env.PATH}` },
  });
  assert.notEqual(npmViejo.status, 0);
  assert.match(npmViejo.salida, /npm 9\.8\.1/);
});

test("instala en una carpeta vacía y deja el proyecto en marcha", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-nuevo");
  const r = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /instalado/);
  assert.ok(fs.existsSync(path.join(proyecto, "index.js")));
  assert.ok(fs.existsSync(path.join(proyecto, "node_modules", "baileys")));
  assert.ok(fs.existsSync(path.join(proyecto, ".env")), "debe crear .env desde el ejemplo");
  assert.match(r.salida, /conector: los 8 parches aplicados/);
  assert.match(fs.readFileSync(path.join(proyecto, ".shin-install"), "utf8"), /version=9\.9\.9/);
});

test("se niega a instalar encima de una carpeta que no es suya", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-ocupada");
  const ocupada = path.join(raiz, "Shin-MD");
  escribir(path.join(ocupada, "cosas-del-usuario.txt"), "no me borres\n");

  const r = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /no está vacía/);
  assert.ok(fs.existsSync(path.join(ocupada, "cosas-del-usuario.txt")), "no puede tocar archivos ajenos");
});

test("la segunda pasada actualiza en vez de duplicar", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  const marcas = sembrarDatos(proyecto);

  const otra = correr(instalador, ["--yes"], { raiz, cwd: proyecto, env: { SHIN_REPO_URL: origen } });
  assert.equal(otra.status, 0, otra.salida);
  assert.match(otra.salida, /Ya hay una instalación/);

  const copias = fs.readdirSync(raiz).filter((n) => n.startsWith("Shin-MD") && !n.includes("datos"));
  assert.deepEqual(copias, ["Shin-MD"], "no debe haber dos proyectos");
  assert.equal(hashDe(path.join(proyecto, ".env")), marcas.env);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), marcas.base);
});

test("si npm falla, no deja nada marcado como instalado", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-npmfalla");
  const falso = temporal("shin-npmroto");
  escribir(path.join(falso, "npm"),
    "#!/bin/sh\ncase \"$1\" in -v|--version) echo 10.9.2; exit 0;; *) echo 'npm ERR! red caída' >&2; exit 1;; esac\n", 0o755);

  const r = correr(INSTALADOR, ["--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, PATH: `${falso}:${BIN_NODE}:${process.env.PATH}` },
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /Falló la instalación de dependencias/);
  assert.match(r.salida, /Nada quedó marcado como instalado/);
  assert.ok(!fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")),
    "una instalación a medias no puede parecer buena");

  // Y la siguiente pasada, con npm sano, la completa.
  const buena = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(buena.status, 0, buena.salida);
  assert.ok(fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
});

test("si el postinstall no deja el conector sano, lo detecta y aborta", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-postinst");

  const r = correr(INSTALADOR, ["--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, FIXTURE_PARCHE_ROTO: "1" },
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /parches NO están completos/);
  assert.match(r.salida, /--repair/);
  assert.ok(!fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
});

test("actualizar conserva .env, la sesión y la base de datos", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);

  // Un commit nuevo en el origen: la actualización tiene algo que traer.
  escribir(path.join(origen, "NOVEDADES.md"), "versión nueva\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "novedad");

  const r = correr(instalador, ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /código actualizado/);
  assert.match(r.salida, /datos respaldados/);
  assert.ok(fs.existsSync(path.join(proyecto, "NOVEDADES.md")), "debe traer lo nuevo");
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")), antes.sesion);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), antes.base);
  assert.ok(fs.readdirSync(path.join(proyecto, "backups")).length > 0, "debe respaldar antes de tocar");
});

test("actualizar no pisa cambios propios en archivos del proyecto", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  escribir(path.join(proyecto, "index.js"), "// mi cambio local\nexport const mio = true;\n");

  const r = correr(instalador, ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No los toco/);
  assert.match(fs.readFileSync(path.join(proyecto, "index.js"), "utf8"), /mi cambio local/);
});

test("reparar reconstruye dependencias sin tocar los datos", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);
  fs.rmSync(path.join(proyecto, "node_modules"), { recursive: true, force: true });

  const r = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /instalación reparada/);
  assert.ok(fs.existsSync(path.join(proyecto, "node_modules", "baileys")));
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")), antes.sesion);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), antes.base);
});

test("desinstalar pregunta antes y guarda los datos al lado", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);

  const cancelado = correr(instalador, ["--uninstall"], { cwd: proyecto, entrada: "no\n" });
  assert.notEqual(cancelado.status, 0);
  assert.ok(fs.existsSync(proyecto), "cancelar no puede borrar el proyecto");
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);

  const fuera = correr(instalador, ["--uninstall"], { cwd: proyecto, entrada: "si\n" });
  assert.equal(fuera.status, 0, fuera.salida);
  assert.ok(!fs.existsSync(proyecto), "el proyecto debe desaparecer");

  const guardados = fs.readdirSync(raiz).filter((n) => n.startsWith("Shin-MD-datos-"));
  assert.equal(guardados.length, 1, "los datos deben quedar en una carpeta aparte");
  const copia = path.join(raiz, guardados[0]);
  assert.equal(hashDe(path.join(copia, ".env")), antes.env);
  assert.equal(hashDe(path.join(copia, "Sessions", "Owner", "auth.db")), antes.sesion);
  assert.equal(hashDe(path.join(copia, "data", "shin.db")), antes.base);
});

test("desinstalar con --purge borra todo de verdad", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  sembrarDatos(proyecto);

  // --yes no basta para borrar datos: hay que escribir la frase.
  const sinFrase = correr(instalador, ["--uninstall", "--purge", "--yes"], { cwd: proyecto, entrada: "no\n" });
  assert.notEqual(sinFrase.status, 0, "sin la frase no puede borrar los datos");
  assert.match(sinFrase.salida, /borrar todo/);
  assert.ok(fs.existsSync(proyecto), "y el proyecto sigue ahí");

  const r = correr(instalador, ["--uninstall", "--purge", "--yes"], { cwd: proyecto, entrada: "borrar todo\n" });

  assert.equal(r.status, 0, r.salida);
  assert.ok(!fs.existsSync(proyecto));
  assert.deepEqual(fs.readdirSync(raiz), [], "no debe quedar ninguna copia de los datos");
});

test("se niega a desinstalar una carpeta que no es Shin-MD", () => {
  const falsa = temporal("shin-otracosa");
  escribir(path.join(falsa, "package.json"), JSON.stringify({ name: "otro-proyecto", version: "1.0.0" }));
  escribir(path.join(falsa, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));

  const r = correr(path.join(falsa, "install.sh"), ["--uninstall", "--purge", "--yes"], { cwd: falsa });

  assert.notEqual(r.status, 0);
  // Se niega por dos motivos válidos: no sabe qué desinstalar, o sabe que
  // esa carpeta no es suya. Lo que importa es que no borre nada.
  assert.match(r.salida, /no parece una instalación|No sé sobre qué instalación actuar/);
  assert.ok(fs.existsSync(path.join(falsa, "package.json")), "no puede borrar proyectos ajenos");
});

test("un Ctrl+C no deja la instalación marcada como buena ni rota", async () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-interrumpida");
  const falso = temporal("shin-npmlento");
  escribir(path.join(falso, "npm"), [
    "#!/bin/sh",
    'case "$1" in -v|--version) echo 10.9.2; exit 0;; esac',
    "echo 'instalando despacio...'",
    "sleep 30",
    "exit 0",
    "",
  ].join("\n"), 0o755);

  dentroDeTmp(raiz);
  const hijo = spawn("bash", [INSTALADOR, "--yes"], {
    cwd: RAIZ,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, NO_COLOR: "1",
      SHIN_INSTALL_ROOT: raiz,
      SHIN_REPO_URL: origen,
      SHIN_NO_BORRAR: RAIZ,
      PATH: `${falso}:${BIN_NODE}:${process.env.PATH}`,
    },
  });
  let salida = "";
  hijo.stdout.on("data", (d) => { salida += d; });
  hijo.stderr.on("data", (d) => { salida += d; });
  const terminado = new Promise((ok) => hijo.on("close", (codigo) => ok(codigo)));

  await new Promise((ok) => setTimeout(ok, 1500));
  process.kill(-hijo.pid, "SIGINT"); // como el Ctrl+C de una terminal: a todo el grupo
  const codigo = await terminado;

  assert.notEqual(codigo, 0, "interrumpir no puede devolver éxito");
  assert.match(salida, /La instalación no terminó/);
  assert.ok(!fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")),
    "una instalación interrumpida no puede parecer completa");

  // Y se puede retomar: la siguiente pasada termina el trabajo.
  const retomada = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(retomada.status, 0, retomada.salida);
  assert.ok(fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
});

test("--verify sobre este repositorio real ve los 8 parches del conector", (t) => {
  const modulos = path.join(RAIZ, "node_modules");
  if (!fs.existsSync(path.join(modulos, "baileys"))) {
    return t.skip("sin node_modules en el repositorio: ejecuta npm install");
  }
  const raiz = temporal("shin-real");
  const destino = path.join(raiz, "Shin-MD");
  git(raiz, "clone", "--quiet", RAIZ, destino);
  fs.copyFileSync(INSTALADOR, path.join(destino, "install.sh"));
  // Se enlazan las dependencias ya instaladas del repositorio: así se
  // comprueba la verificación REAL contra el baileys parcheado de verdad,
  // sin repetir una instalación de varios minutos.
  fs.symlinkSync(modulos, path.join(destino, "node_modules"), "dir");

  const r = correr(path.join(destino, "install.sh"), ["--verify"], { cwd: destino });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /conector: los 8 parches aplicados/);
  assert.match(r.salida, /todo correcto/);
});

// ═══════════════════════════════════════════════════════════════════
//  Protección de rutas: lo que el instalador NO debe borrar nunca.
//  Estas pruebas existen por un incidente real: durante el desarrollo,
//  una ruta deducida mal + --purge --yes borró el repositorio de trabajo.
// ═══════════════════════════════════════════════════════════════════

/** Crea una carpeta que parece una instalación legítima (clon con .git). */
function instalacionFalsa(etiqueta = "shin-senuelo") {
  const dir = temporal(etiqueta);
  escribir(path.join(dir, "package.json"), JSON.stringify({ name: "shin-md", version: "1.0.0" }));
  escribir(path.join(dir, ".env"), "OWNER_NUMBER=1\n");
  git(dir, "init", "--quiet", "--initial-branch", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "instalación de mentira");
  return dir;
}

test("no borra una ruta protegida por SHIN_NO_BORRAR, aunque se lo pidan", () => {
  const protegida = instalacionFalsa("shin-protegida");

  // Se le pide desinstalar la ruta protegida con todo a favor: --dir, --purge,
  // --yes y la frase de confirmación.
  escribir(path.join(protegida, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));
  const intento = correr(path.join(protegida, "install.sh"), ["--dir", protegida, "--uninstall", "--purge", "--yes"], {
    cwd: protegida,
    entrada: "borrar todo\n",
    env: { SHIN_NO_BORRAR: protegida },
  });

  assert.notEqual(intento.status, 0, "no puede terminar en éxito");
  assert.match(intento.salida, /SHIN_NO_BORRAR|protegido/);
  assert.ok(fs.existsSync(path.join(protegida, ".env")), "los datos tienen que seguir ahí");
  assert.ok(fs.existsSync(path.join(protegida, "package.json")));
});

test("se niega a tocar la raíz, el home y las rutas del sistema", () => {
  const raiz = temporal("shin-rutas");
  escribir(path.join(raiz, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));

  for (const peligrosa of ["/", "/usr", "/etc", os.homedir(), "/bin"]) {
    const r = correr(path.join(raiz, "install.sh"), ["--dir", peligrosa, "--uninstall", "--purge", "--yes"], {
      cwd: raiz,
      entrada: "borrar todo\n",
    });
    assert.notEqual(r.status, 0, `no puede aceptar ${peligrosa}`);
    assert.ok(fs.existsSync(peligrosa), `${peligrosa} tiene que seguir existiendo`);
  }
});

test("no instala dentro de rutas del sistema", () => {
  const origen = crearOrigen();
  const r = correr(INSTALADOR, ["--dir", "/usr/local/shin-md", "--yes"], {
    raiz: temporal("shin-instsistema"),
    env: { SHIN_REPO_URL: origen },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.salida, /no puedo instalar/);
  assert.ok(!fs.existsSync("/usr/local/shin-md/src"), "no puede escribir fuera");
});

test("se niega a operar sobre un enlace simbólico", () => {
  const real = instalacionFalsa("shin-real");
  const raiz = temporal("shin-enlace");
  const enlace = path.join(raiz, "Shin-MD");
  fs.symlinkSync(real, enlace, "dir");
  escribir(path.join(real, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));

  const r = correr(path.join(real, "install.sh"), ["--dir", enlace, "--uninstall", "--yes"], {
    cwd: raiz,
    entrada: "si\n",
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /enlace simbólico/);
  assert.ok(fs.existsSync(path.join(real, ".env")), "el destino real sigue intacto");
});

test("no borra una carpeta llamada Shin-MD que no es un clon", () => {
  const raiz = temporal("shin-nocl");
  const falsa = path.join(raiz, "Shin-MD");
  escribir(path.join(falsa, "package.json"), JSON.stringify({ name: "shin-md", version: "1.0.0" }));
  escribir(path.join(falsa, "mis-fotos.txt"), "contenido del usuario\n");
  escribir(path.join(falsa, "install.sh"), fs.readFileSync(INSTALADOR, "utf8"));

  const r = correr(path.join(falsa, "install.sh"), ["--dir", falsa, "--uninstall", "--yes"], {
    cwd: falsa,
    entrada: "si\n",
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /no es un clon/);
  assert.ok(fs.existsSync(path.join(falsa, "mis-fotos.txt")));
});

test("con poco espacio en disco no empieza a instalar", () => {
  const origen = crearOrigen();
  const falso = temporal("shin-df");
  // df que dice que quedan 10 MB.
  escribir(path.join(falso, "df"), "#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted'\necho '/dev/root 1000000 999000 10240 99% /'\n", 0o755);

  const r = correr(INSTALADOR, ["--yes"], {
    raiz: temporal("shin-sindisco"),
    env: { SHIN_REPO_URL: origen, SHIN_ESPACIO_MIN_MB: "400", PATH: `${falso}:${BIN_NODE}:${process.env.PATH}` },
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /muy poco espacio/);
  assert.match(r.salida, /no empiezo una instalación que no cabe/);
});

test("sin permisos de escritura se detiene sin marcar nada", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-sinpermiso");
  fs.chmodSync(raiz, 0o500);
  try {
    const r = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
    assert.notEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
  } finally {
    fs.chmodSync(raiz, 0o755);
  }
});

test("una actualización interrumpida no pierde los datos", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);

  escribir(path.join(origen, "NOVEDADES.md"), "nueva\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "novedad");

  // npm que revienta justo en la actualización.
  const falso = temporal("shin-npmcaido");
  escribir(path.join(falso, "npm"),
    "#!/bin/sh\ncase \"$1\" in -v|--version) echo 10.9.2; exit 0;; *) exit 1;; esac\n", 0o755);

  const r = correr(instalador, ["--update"], {
    cwd: proyecto,
    env: { SHIN_REPO_URL: origen, PATH: `${falso}:${BIN_NODE}:${process.env.PATH}` },
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /vuelvo a la anterior|revertida/i);
  // El código vuelve atrás y los datos siguen byte a byte.
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")), antes.sesion);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), antes.base);
  assert.ok(!fs.existsSync(path.join(proyecto, "NOVEDADES.md")), "el código tiene que haber vuelto atrás");
});

test("si falla el postinstall durante la actualización, vuelve a la versión anterior", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);
  const commitPrevio = git(proyecto, "rev-parse", "HEAD").trim();

  escribir(path.join(origen, "NOVEDADES.md"), "rompe el conector\n");
  escribir(path.join(origen, "scripts", "preparar.cjs"),
    fs.readFileSync(path.join(origen, "scripts", "preparar.cjs"), "utf8") + "\nprocess.exit(1);\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "rompe todo");

  const r = correr(instalador, ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.equal(git(proyecto, "rev-parse", "HEAD").trim(), commitPrevio, "debe volver al commit anterior");
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")), antes.sesion);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), antes.base);
});

test("si no hay red, la actualización falla sin tocar nada", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);

  // Sin red de verdad: el remoto del proyecto apunta a la nada.
  git(proyecto, "remote", "set-url", "origin", "/tmp/no-existe-este-repo");
  const r = correr(instalador, ["--update"], { cwd: proyecto });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No se pudo consultar el repositorio/);
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "data", "shin.db")), antes.base);
});

test("respeta una base de datos fuera del proyecto (SHIN_DB_PATH)", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const externa = temporal("shin-dbexterna");
  const dbFuera = path.join(externa, "shin.db");
  // El bot lee SHIN_DB_PATH; el instalador no debe tocarla ni asumir que está en data/.
  fs.writeFileSync(dbFuera, "base externa\n");
  const antes = hashDe(dbFuera);

  const r = correr(instalador, ["--repair"], {
    cwd: proyecto,
    env: { SHIN_REPO_URL: origen, SHIN_DB_PATH: dbFuera },
  });

  assert.equal(r.status, 0, r.salida);
  assert.ok(fs.existsSync(dbFuera), "la base externa no se mueve");
  assert.equal(hashDe(dbFuera), antes, "y no se modifica");
});

test("instala una versión concreta por etiqueta", () => {
  const origen = crearOrigen();
  git(origen, "tag", "v9.9.9");
  const raiz = temporal("shin-tag");

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /descargado v9\.9\.9/);
  assert.match(fs.readFileSync(path.join(raiz, "Shin-MD", ".shin-install"), "utf8"), /version=9\.9\.9/);
});

test("una etiqueta que no existe falla con un mensaje que dice qué hacer", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-tagmalo");

  const r = correr(INSTALADOR, ["--version", "v0.0.0-inexistente", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No existe la versión/);
  assert.ok(!fs.existsSync(path.join(raiz, "Shin-MD", ".shin-install")));
});

test("SHA256SUMS publicado coincide con install.sh (no se desincroniza)", () => {
  const resumen = path.join(RAIZ, "SHA256SUMS");
  assert.ok(fs.existsSync(resumen), "falta SHA256SUMS: genéralo con `npm run firma`");

  const declarado = fs.readFileSync(resumen, "utf8").split("\n").find((l) => l.endsWith("  install.sh"));
  assert.ok(declarado, "SHA256SUMS no menciona install.sh");

  const real = crypto.createHash("sha256").update(fs.readFileSync(INSTALADOR)).digest("hex");
  assert.equal(declarado.split(/\s+/)[0], real,
    "install.sh cambió y SHA256SUMS no: ejecuta `npm run firma` antes de publicar");
});

test("el flujo de release verifica la huella antes de ejecutar", () => {
  const raiz = temporal("shin-release");
  const descarga = path.join(raiz, "install.sh");
  const sumas = path.join(raiz, "SHA256SUMS");
  fs.copyFileSync(INSTALADOR, descarga);
  fs.copyFileSync(path.join(RAIZ, "SHA256SUMS"), sumas);

  // 1. La huella coincide: `sha256sum -c` sale bien.
  const bueno = spawnSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: raiz, encoding: "utf8" });
  assert.equal(bueno.status, 0, bueno.stdout + bueno.stderr);
  assert.match(bueno.stdout, /install\.sh: OK/);

  // 2. Un byte distinto (un instalador manipulado) y la comprobación falla.
  fs.appendFileSync(descarga, "# línea añadida por un atacante\n");
  const malo = spawnSync("sha256sum", ["-c", "SHA256SUMS"], { cwd: raiz, encoding: "utf8" });
  assert.notEqual(malo.status, 0);
  assert.match(`${malo.stdout}${malo.stderr}`, /FAILED/);
});

test("la suite no altera el repositorio desde el que se ejecuta", () => {
  const ahora = firmaDelRepo();
  assert.deepEqual(ahora.entradas, REPO_AL_EMPEZAR.entradas,
    "apareció o desapareció algo en la raíz del repositorio durante las pruebas");
  assert.equal(ahora.pkg, REPO_AL_EMPEZAR.pkg, "el package.json cambió durante las pruebas");
  assert.equal(ahora.tests, REPO_AL_EMPEZAR.tests, "cambió el número de archivos de prueba");
});

// ═══════════════════════════════════════════════════════════════════
//  Revisión final: desinstalarse a sí mismo, etiquetas, enlaces en el
//  camino, paquetes reales de Termux y esquema de la base.
// ═══════════════════════════════════════════════════════════════════

test("puede desinstalarse a sí mismo desde su propia carpeta", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  const antes = sembrarDatos(proyecto);

  // El script se borra a mitad de ejecución: tiene que terminar bien igual.
  const r = correr(instalador, ["--uninstall"], { cwd: proyecto, entrada: "si\n" });

  assert.equal(r.status, 0, r.salida);
  assert.ok(!fs.existsSync(proyecto), "el proyecto desaparece");
  assert.match(r.salida, /Para volver/, "y llega al final, no muere al borrarse");

  const copia = fs.readdirSync(raiz).find((n) => n.startsWith("Shin-MD-datos-"));
  assert.ok(copia, "los datos se guardan");
  assert.equal(hashDe(path.join(raiz, copia, ".env")), antes.env);
  assert.equal(hashDe(path.join(raiz, copia, "Sessions", "Owner", "auth.db")), antes.sesion);
});

test("--purge desde su propia carpeta también termina sin dejar restos", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  sembrarDatos(proyecto);

  const r = correr(instalador, ["--uninstall", "--purge", "--yes"], { cwd: proyecto, entrada: "borrar todo\n" });

  assert.equal(r.status, 0, r.salida);
  assert.deepEqual(fs.readdirSync(raiz), []);
});

test("no borra un directorio padre que contiene al instalador", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-padre");
  const hijo = path.join(raiz, "Shin-MD");
  fs.mkdirSync(hijo, { recursive: true });
  // El padre también "parece" una instalación: package.json correcto y .git.
  fs.cpSync(path.join(origen, "package.json"), path.join(raiz, "package.json"));
  git(raiz, "init", "--quiet", "--initial-branch", "main");
  git(raiz, "add", "-A");
  git(raiz, "commit", "--quiet", "-m", "padre");
  const r = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(r.status, 0, r.salida);

  const intento = correr(path.join(hijo, "install.sh"), ["--dir", raiz, "--uninstall", "--purge", "--yes"], {
    cwd: hijo,
    entrada: "borrar todo\n",
  });

  assert.notEqual(intento.status, 0);
  assert.match(intento.salida, /contiene al propio instalador/);
  assert.ok(fs.existsSync(path.join(hijo, "package.json")), "el hijo sigue vivo");
  assert.ok(fs.existsSync(path.join(raiz, "package.json")), "y el padre también");
});

test("una instalación desde etiqueta no se suelta sola de la versión", () => {
  const origen = crearOrigen();
  git(origen, "tag", "-a", "v9.0.0", "-m", "vieja");
  escribir(path.join(origen, "NOVEDADES.md"), "posterior\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "posterior");

  const raiz = temporal("shin-etiqueta");
  const inst = correr(INSTALADOR, ["--version", "v9.0.0", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(inst.status, 0, inst.salida);
  const proyecto = path.join(raiz, "Shin-MD");
  assert.equal(git(proyecto, "rev-parse", "--abbrev-ref", "HEAD").trim(), "HEAD", "debe quedar desprendida");

  const r = correr(path.join(proyecto, "install.sh"), ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /fijada a la versión v9\.0\.0/);
  assert.match(r.salida, /--update --version/);
  assert.equal(git(proyecto, "describe", "--tags", "--exact-match").trim(), "v9.0.0", "no se movió");
});

test("--update --version cambia de una etiqueta a otra", () => {
  const origen = crearOrigen();
  git(origen, "tag", "-a", "v9.0.0", "-m", "vieja");
  escribir(path.join(origen, "NOVEDADES.md"), "nuevo\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "posterior");
  git(origen, "tag", "-a", "v9.1.0", "-m", "nueva");

  const raiz = temporal("shin-etiqueta2");
  correr(INSTALADOR, ["--version", "v9.0.0", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");

  const r = correr(path.join(proyecto, "install.sh"), ["--update", "--version", "v9.1.0"], {
    cwd: proyecto, env: { SHIN_REPO_URL: origen },
  });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /fijada en v9\.1\.0/);
  assert.equal(git(proyecto, "describe", "--tags", "--exact-match").trim(), "v9.1.0");
  assert.ok(fs.existsSync(path.join(proyecto, "NOVEDADES.md")), "trae lo de la versión nueva");
});

test("--update --version con una etiqueta inexistente no mueve nada", () => {
  const origen = crearOrigen();
  git(origen, "tag", "-a", "v9.0.0", "-m", "vieja");
  const raiz = temporal("shin-etiqueta3");
  correr(INSTALADOR, ["--version", "v9.0.0", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");

  const r = correr(path.join(proyecto, "install.sh"), ["--update", "--version", "v0.0.0"], {
    cwd: proyecto, env: { SHIN_REPO_URL: origen },
  });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No existe la versión v0\.0\.0/);
  assert.equal(git(proyecto, "describe", "--tags", "--exact-match").trim(), "v9.0.0");
});

test("--update --branch devuelve la instalación a la rama", () => {
  const origen = crearOrigen();
  git(origen, "tag", "-a", "v9.0.0", "-m", "vieja");
  const raiz = temporal("shin-etiqueta4");
  correr(INSTALADOR, ["--version", "v9.0.0", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");

  const r = correr(path.join(proyecto, "install.sh"), ["--update", "--branch", "main"], {
    cwd: proyecto, env: { SHIN_REPO_URL: origen },
  });

  assert.equal(r.status, 0, r.salida);
  assert.match(r.salida, /siguiendo la rama main/);
  assert.equal(git(proyecto, "rev-parse", "--abbrev-ref", "HEAD").trim(), "main");
});

test("rollback desde una instalación etiquetada vuelve a la etiqueta", () => {
  const origen = crearOrigen();
  git(origen, "tag", "-a", "v9.0.0", "-m", "buena");
  escribir(path.join(origen, "NOVEDADES.md"), "rompe\n");
  escribir(path.join(origen, "scripts", "preparar.cjs"),
    fs.readFileSync(path.join(origen, "scripts", "preparar.cjs"), "utf8") + "\nprocess.exit(1);\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "rompe todo");
  git(origen, "tag", "-a", "v9.1.0", "-m", "mala");

  const raiz = temporal("shin-etiqueta5");
  correr(INSTALADOR, ["--version", "v9.0.0", "--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");
  const antes = sembrarDatos(proyecto);

  const r = correr(path.join(proyecto, "install.sh"), ["--update", "--version", "v9.1.0"], {
    cwd: proyecto, env: { SHIN_REPO_URL: origen },
  });

  assert.notEqual(r.status, 0);
  assert.equal(git(proyecto, "describe", "--tags", "--exact-match").trim(), "v9.0.0", "vuelve a la buena");
  assert.equal(hashDe(path.join(proyecto, ".env")), antes.env);
  assert.equal(hashDe(path.join(proyecto, "Sessions", "Owner", "auth.db")), antes.sesion);
});

test("funciona con espacios en la ruta y con ruta relativa", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-con espacios");
  const inst = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  assert.equal(inst.status, 0, inst.salida);
  const proyecto = path.join(raiz, "Shin-MD");
  sembrarDatos(proyecto);

  const rel = correr("./Shin-MD/install.sh", ["--uninstall"], { cwd: raiz, entrada: "si\n" });

  assert.equal(rel.status, 0, rel.salida);
  assert.ok(!fs.existsSync(proyecto));
  assert.ok(fs.readdirSync(raiz).some((n) => n.includes("datos")), "los datos quedan al lado");
});

test("no borra a través de un enlace en medio del camino", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-enlacemedio");
  const real = path.join(raiz, "real");
  const enlace = path.join(raiz, "atajo");
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, enlace, "dir");

  const inst = correr(INSTALADOR, ["--yes"], { raiz: enlace, env: { SHIN_REPO_URL: origen } });
  assert.equal(inst.status, 0, inst.salida);
  const proyecto = path.join(real, "Shin-MD");

  const r = correr(path.join(proyecto, "install.sh"),
    ["--dir", path.join(enlace, "Shin-MD"), "--uninstall", "--yes"],
    { cwd: proyecto, entrada: "si\n" });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /el camino pasa por el enlace/);
  assert.ok(fs.existsSync(path.join(proyecto, "package.json")), "la instalación real sigue ahí");
});

test("en Termux instala termux-tools, no termux-api, y prueba python-yt-dlp", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-termux2");
  const falso = temporal("shin-prefix2");
  const registro = path.join(falso, "llamadas.log");
  // pkg: falla para yt-dlp (como en las ramas donde se llama python-yt-dlp).
  escribir(path.join(falso, "bin", "pkg"), `#!/bin/sh
echo "pkg $*" >> "${registro}"
case "$*" in
  *"install -y yt-dlp"*) exit 100 ;;
esac
exit 0
`, 0o755);
  escribir(path.join(falso, "bin", "termux-wake-lock"), "#!/bin/sh\nexit 0\n", 0o755);

  const r = correr(INSTALADOR, ["--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, TERMUX_VERSION: "0.118.3", PREFIX: falso },
  });

  assert.equal(r.status, 0, r.salida);
  const llamadas = fs.readFileSync(registro, "utf8");
  assert.match(llamadas, /pkg install -y python-yt-dlp/, "debe reintentar con python-yt-dlp");
  assert.doesNotMatch(llamadas, /pkg install -y termux-api/, "termux-api no da el wakelock");
});

test("avisa si al revertir la base quedó por delante del código", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  sembrarDatos(proyecto);

  // La base dice estar en el esquema 9; el código del proyecto conoce hasta 2.
  // (sembrarDatos deja un archivo cualquiera; aquí hace falta un SQLite real.)
  fs.rmSync(path.join(proyecto, "data", "shin.db"), { force: true });
  const crearDb = spawnSync(process.execPath, ["-e", `
    const { DatabaseSync } = require("node:sqlite");
    const d = new DatabaseSync(process.argv[1]);
    d.exec("CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at INTEGER)");
    d.exec("DELETE FROM migrations");
    d.prepare("INSERT INTO migrations VALUES (9, 'futuro', 0)").run();
    d.close();
  `, path.join(proyecto, "data", "shin.db")], { encoding: "utf8" });
  assert.equal(crearDb.status, 0, crearDb.stderr);

  escribir(path.join(origen, "NOVEDADES.md"), "rompe\n");
  escribir(path.join(origen, "scripts", "preparar.cjs"),
    fs.readFileSync(path.join(origen, "scripts", "preparar.cjs"), "utf8") + "\nprocess.exit(1);\n");
  git(origen, "add", "-A");
  git(origen, "commit", "--quiet", "-m", "rompe");

  const r = correr(instalador, ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /esquema v9 y el código al que volviste solo conoce v2/);
  assert.match(r.salida, /Copia de la base de ANTES de actualizar/);
});

test("la copia de la base es consistente aunque el bot esté escribiendo (WAL)", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  fs.mkdirSync(path.join(proyecto, "data"), { recursive: true });
  fs.rmSync(path.join(proyecto, "data", "shin.db"), { force: true });
  fs.rmSync(path.join(proyecto, "data", "shin.db.json"), { force: true });

  // Un "bot" que deja 2000 filas en el WAL sin checkpoint.
  const script = path.join(proyecto, "llena.mjs");
  fs.writeFileSync(script, `
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(${JSON.stringify(path.join(proyecto, "data", "shin.db"))});
db.exec("PRAGMA journal_mode=WAL");
db.exec("CREATE TABLE users(jid TEXT PRIMARY KEY)");
for (let i = 0; i < 2000; i++) db.prepare("INSERT OR IGNORE INTO users VALUES (?)").run("u" + i);
// se queda abierto: así el WAL no se consolida en el .db
setInterval(() => db.prepare("INSERT OR IGNORE INTO users VALUES (?)").run("t" + Date.now()), 200);
`);
  const bot = spawn(process.execPath, [script], { stdio: "ignore" });
  try {
    // Espera a que la base exista con sus filas.
    const limite = Date.now() + 15000;
    let listo = false;
    while (Date.now() < limite) {
      const r = spawnSync(process.execPath, ["-e", `
        const { DatabaseSync } = require("node:sqlite");
        const d = new DatabaseSync(${JSON.stringify(path.join(proyecto, "data", "shin.db"))}, { readOnly: true });
        process.stdout.write(String(d.prepare("SELECT COUNT(*) n FROM users").get().n));
        d.close();
      `], { encoding: "utf8" });
      if (Number(r.stdout) >= 2000) { listo = true; break; }
      spawnSync("sleep", ["0.2"]);
    }
    assert.ok(listo, "la base de prueba no llegó a llenarse");
    assert.ok(fs.existsSync(path.join(proyecto, "data", "shin.db-wal")), "debe haber -wal con datos");

    const r = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });
    assert.equal(r.status, 0, r.salida);
    // El mensaje cambió al quitar el respaldo silencioso: ahora el respaldo
    // se anuncia una vez, ya cerrado, y es la prueba de que existe.
    assert.match(r.salida, /datos respaldados en backups\/pre-reparacion-/);

    const respaldo = fs.readdirSync(path.join(proyecto, "backups")).find((n) => n.startsWith("pre-reparacion"));
    assert.ok(respaldo, "tiene que haber respaldo");

    const copia = spawnSync(process.execPath, ["-e", `
      const { DatabaseSync } = require("node:sqlite");
      const d = new DatabaseSync(process.argv[1], { readOnly: true });
      const n = d.prepare("SELECT COUNT(*) n FROM users").get().n;
      const i = d.prepare("PRAGMA integrity_check").get();
      d.close();
      process.stdout.write(JSON.stringify({ n, ok: Object.values(i)[0] }));
    `, path.join(proyecto, "backups", respaldo, "data", "shin.db")], { encoding: "utf8" });

    const { n, ok } = JSON.parse(copia.stdout);
    assert.equal(ok, "ok", "la copia tiene que pasar integrity_check");
    assert.ok(n >= 2000, `la copia perdió filas: ${n} de 2000 (¿se copió el .db sin el WAL?)`);
  } finally {
    bot.kill("SIGKILL");
    fs.rmSync(script, { force: true });
  }
});

test("las rutas alternativas al mismo destino no abren un agujero", () => {
  const origen = crearOrigen();

  // Variantes que apuntan a la MISMA instalación: deben funcionar.
  for (const forma of ["exacta", "barra-final", "barras-dobles"]) {
    const raiz = temporal(`shin-forma-${forma}`);
    const inst = correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
    assert.equal(inst.status, 0, inst.salida);
    const proyecto = path.join(raiz, "Shin-MD");
    sembrarDatos(proyecto);

    const rutas = {
      exacta: proyecto,
      "barra-final": `${proyecto}/`,
      "barras-dobles": `${raiz}//Shin-MD`,
    };
    const r = correr(path.join(proyecto, "install.sh"),
      ["--dir", rutas[forma], "--uninstall"], { cwd: proyecto, entrada: "si\n" });
    assert.equal(r.status, 0, `${forma}: ${r.salida}`);
    assert.ok(!fs.existsSync(proyecto), `${forma}: debía desinstalar`);
  }

  // Variantes que NO son la instalación: deben negarse.
  const raiz = temporal("shin-formas-malas");
  correr(INSTALADOR, ["--yes"], { raiz, env: { SHIN_REPO_URL: origen } });
  const proyecto = path.join(raiz, "Shin-MD");

  // Ojo: path.join normaliza "..", así que aquí se escriben a mano para que
  // lleguen al instalador tal cual.
  const malas = [
    `${raiz}/otra/../Shin-MD`, // .. por un directorio que no existe
    raiz,                       // el padre
    "/",                        // la raíz
    `${raiz}/..`,               // un nivel más arriba
  ];
  for (const ruta of malas) {
    const r = correr(path.join(proyecto, "install.sh"), ["--dir", ruta, "--uninstall", "--yes"], {
      cwd: proyecto, entrada: "si\nborrar todo\n",
    });
    assert.notEqual(r.status, 0, `debía negarse con ${ruta}`);
    assert.ok(fs.existsSync(path.join(proyecto, "package.json")), `borró con ${ruta}`);
  }
});

test("no se deja engañar por un cwd que pasó por un enlace", () => {
  const origen = crearOrigen();
  const raiz = temporal("shin-cwd");
  const real = path.join(raiz, "real");
  const atajo = path.join(raiz, "atajo");
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(real, atajo, "dir");

  const inst = correr(INSTALADOR, ["--yes"], { raiz: real, env: { SHIN_REPO_URL: origen } });
  assert.equal(inst.status, 0, inst.salida);
  const proyecto = path.join(real, "Shin-MD");

  // Se invoca desde el atajo, con ruta relativa: el shell resuelve a real/…,
  // y eso es la instalación de verdad, así que debe funcionar y terminar.
  const r = correr(path.join(atajo, "Shin-MD", "install.sh"), ["--uninstall"], {
    cwd: path.join(atajo, "Shin-MD"), entrada: "si\n",
  });

  assert.equal(r.status, 0, r.salida);
  assert.ok(!fs.existsSync(proyecto), "debe desinstalar la instalación real");
  assert.ok(fs.existsSync(atajo), "sin llevarse el enlace por delante");
});

test("si la copia de la base falla, --repair no sigue y no toca nada", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);

  // Una base de verdad y un archivo que, con nombre .db, no es una base:
  // VACUUM INTO no puede con él. Antes se copiaba tal cual y se seguía.
  baseSqlite(path.join(proyecto, "data", "shin.db"), 5);
  escribir(path.join(proyecto, "data", "rota.db"), "esto no es una base de datos");

  // Se ensucia node_modules para poder demostrar que NO se borra.
  escribir(path.join(proyecto, "node_modules", "marca-de-la-prueba"), "sigue aquí");
  const antes = fs.readFileSync(path.join(proyecto, "data", "rota.db"), "utf8");

  const r = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0, `debía pararse:\n${r.salida}`);
  assert.match(r.salida, /puedo respaldar tus datos/i);
  assert.match(r.salida, /rota\.db/, "tiene que decir qué archivo falló");
  assert.match(r.salida, /No he tocado nada/i, "y que no se tocó nada");

  // Nada de lo que había se movió: ni dependencias, ni datos, ni respaldos.
  assert.ok(fs.existsSync(path.join(proyecto, "node_modules", "marca-de-la-prueba")),
    "no puede borrar node_modules si el respaldo falló");
  assert.equal(fs.readFileSync(path.join(proyecto, "data", "rota.db"), "utf8"), antes);
  assert.ok(fs.existsSync(path.join(proyecto, "data", "shin.db")));
  const respaldos = fs.existsSync(path.join(proyecto, "backups"))
    ? fs.readdirSync(path.join(proyecto, "backups")) : [];
  assert.deepEqual(respaldos.filter((n) => !n.startsWith(".")), [],
    `no puede dejar un respaldo con nombre bueno a medias: ${respaldos.join(", ")}`);
});

test("si la copia de la base falla, --update no mueve el código", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);
  const commit = git(proyecto, "rev-parse", "HEAD").trim();

  baseSqlite(path.join(proyecto, "data", "shin.db"), 4);
  escribir(path.join(proyecto, "data", "rota.db"), "tampoco esto");

  // Hay una versión nueva disponible en el origen: si el respaldo fallara en
  // silencio, la actualización seguiría adelante y se vería en el commit.
  escribir(path.join(origen, "index.js"), "export const arrancado = true;\nexport const nuevo = 2;\n");
  git(origen, "add", "-A");
  git(origen, "commit", "-m", "nueva version");

  const r = correr(instalador, ["--update"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });

  assert.notEqual(r.status, 0, `debía pararse:\n${r.salida}`);
  assert.match(r.salida, /puedo respaldar tus datos/i);
  assert.equal(git(proyecto, "rev-parse", "HEAD").trim(), commit,
    "no puede haber cambiado de versión sin respaldo");
  assert.ok(fs.existsSync(path.join(proyecto, "data", "rota.db")), "no puede borrar el archivo que no pudo copiar");
});

test("un respaldo fallido no se lleva por delante los respaldos anteriores", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);

  // Un primer reparar sano deja un respaldo válido.
  baseSqlite(path.join(proyecto, "data", "shin.db"), 3);
  const bueno = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });
  assert.equal(bueno.status, 0, bueno.salida);

  const carpeta = path.join(proyecto, "backups");
  const validos = fs.readdirSync(carpeta).filter((n) => n.startsWith("pre-reparacion-"));
  assert.equal(validos.length, 1, "el primer respaldo debe existir");
  const firma = hashDe(path.join(carpeta, validos[0], "data", "shin.db"));

  // Ahora se rompe la base y se vuelve a intentar.
  escribir(path.join(proyecto, "data", "rota.db"), "no soy una base");
  const malo = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });
  assert.notEqual(malo.status, 0, "debía pararse");

  assert.deepEqual(fs.readdirSync(carpeta).filter((n) => n.startsWith("pre-reparacion-")), validos,
    "los respaldos válidos tienen que seguir ahí, ni uno más ni uno menos");
  assert.equal(hashDe(path.join(carpeta, validos[0], "data", "shin.db")), firma,
    "y su contenido no puede cambiar");
  assert.deepEqual(fs.readdirSync(carpeta).filter((n) => n.startsWith(".")), [],
    "tampoco puede quedar basura parcial");
});

test("desinstalar se lleva los datos pero nunca los respaldos", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);

  baseSqlite(path.join(proyecto, "data", "shin.db"), 3);
  const r = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });
  assert.equal(r.status, 0, r.salida);
  const respaldo = fs.readdirSync(path.join(proyecto, "backups"))
    .find((n) => n.startsWith("pre-reparacion-"));
  assert.ok(respaldo);
  const firma = hashDe(path.join(proyecto, "backups", respaldo, "data", "shin.db"));

  const fuera = correr(instalador, ["--uninstall"], { cwd: proyecto, entrada: "si\n" });
  assert.equal(fuera.status, 0, fuera.salida);
  assert.ok(!fs.existsSync(proyecto), "la instalación se va");

  // Los datos y los respaldos aterrizan en la carpeta de al lado.
  const guardado = fs.readdirSync(path.dirname(proyecto))
    .find((n) => n.startsWith("Shin-MD-datos-"));
  assert.ok(guardado, "tiene que quedar la carpeta de datos");
  const raiz = path.join(path.dirname(proyecto), guardado);
  assert.ok(fs.existsSync(path.join(raiz, "backups", respaldo, "data", "shin.db")),
    "el respaldo tiene que sobrevivir a la desinstalación");
  assert.equal(hashDe(path.join(raiz, "backups", respaldo, "data", "shin.db")), firma,
    "y llegar intacto");
});

test("un tramo de la ruta que se convierte en enlace durante el borrado se rechaza", () => {
  const origen = crearOrigen();
  const { raiz, proyecto, instalador } = instalacionLista(origen);
  sembrarDatos(proyecto);

  // El padre pasa a ser un enlace a una carpeta que NO es la instalación.
  // Si el borrado siguiera el enlace, se llevaría esa otra carpeta.
  // El señuelo se hace pasar por una instalación entera (con su .git y su
  // package.json). Así lo único que puede parar el borrado es la comprobación
  // del enlace, que es justo lo que se quiere probar.
  const enOtra = path.join(raiz, "otra-cosa");
  fs.cpSync(proyecto, enOtra, { recursive: true, dereference: true });
  escribir(path.join(enOtra, "importante.txt"), "no se puede borrar");

  // Se sustituye el padre real por un enlace justo antes de invocar.
  const padreReal = path.join(raiz, "Shin-MD");
  const copia = path.join(raiz, "Shin-MD-copia");
  fs.renameSync(padreReal, copia);
  fs.symlinkSync(enOtra, padreReal, "dir");

  const r = correr(path.join(copia, "install.sh"), ["--dir", padreReal, "--uninstall"],
    { cwd: copia, entrada: "si\n" });

  assert.notEqual(r.status, 0, `debía negarse:\n${r.salida}`);
  assert.match(r.salida, /enlace/i);
  assert.ok(fs.existsSync(path.join(enOtra, "importante.txt")),
    "la carpeta apuntada por el enlace no se puede tocar");
  assert.ok(fs.existsSync(copia), "ni la instalación de verdad");
});

// Esta prueba es distinta de las demás: no recorre el instalador entero, sino
// que coge las funciones de borrado del propio archivo y las ejecuta con un
// enlace que aparece JUSTO entre la comprobación y el borrado. Es la única
// forma de reproducir esa ventana sin depender de la suerte del calendario.
test("el re-chequeo antes de borrar ve un enlace que aparece a mitad del camino", () => {
  const fuente = fs.readFileSync(INSTALADOR, "utf8");
  const desde = fuente.indexOf("resolver_real() {");
  const hasta = fuente.indexOf("destino_instalable() {");
  assert.ok(desde > 0 && hasta > desde, "no encuentro las funciones de borrado en install.sh");
  // Se le cambia el nombre a resolver_real para poder envolverla.
  const trozo = fuente.slice(desde, hasta).replace("resolver_real() {", "resolver_original() {");

  const armar = () => {
    const dir = temporal("shin-carrera");
    const raiz = path.join(dir, "base");
    fs.mkdirSync(path.join(raiz, "padre", "hijo"), { recursive: true });
    escribir(path.join(raiz, "padre", "hijo", "de-la-instalacion.txt"), "esto sí se va");
    fs.mkdirSync(path.join(raiz, "victima", "hijo"), { recursive: true });
    escribir(path.join(raiz, "victima", "hijo", "importante.txt"), "esto NO se puede borrar");
    return { raiz, victima: path.join(raiz, "victima"), objetivo: path.join(raiz, "padre", "hijo") };
  };

  const correrFunciones = (cuando) => {
    const { raiz, victima, objetivo } = armar();
    const guion = `
      morir() { printf 'MORIR: %s\n' "$*" >&2; exit 9; }
      dato() { :; }
      bien() { :; }
      C_NEG=""; C_RESET=""; C_ROJO=""; C_GRIS=""
      ${trozo}
      ${cuando === "ninguno" ? `resolver_real() { resolver_original "$@"; }` : `
      resolver_real() {
        # El enlace se cuela en uno de los dos huecos posibles: antes de
        # resolver (la resolución lo seguiría) o después (el rm lo seguiría).
        ${cuando === "antes" ? `mv -- "${raiz}/padre" "${raiz}/padre-real"
        ln -s -- "${victima}" "${raiz}/padre"
        resolver_original "$@"` : `local r
        r="$(resolver_original "$@")"
        mv -- "${raiz}/padre" "${raiz}/padre-real"
        ln -s -- "${victima}" "${raiz}/padre"
        printf '%s\n' "$r"`}
      }`}
      borrar_arbol ${JSON.stringify(objetivo)} prueba
    `;
    const r = spawnSync("bash", ["-c", guion], { encoding: "utf8" });
    return {
      status: r.status,
      salida: `${r.stdout || ""}${r.stderr || ""}`,
      victimaintacta: fs.existsSync(path.join(victima, "hijo", "importante.txt")),
    };
  };

  // Sin carrera: borra lo que le piden y no toca la víctima.
  const normal = correrFunciones("ninguno");
  assert.equal(normal.status, 0, normal.salida);
  assert.ok(normal.victimaintacta);

  for (const cuando of ["antes", "despues"]) {
    const conCarrera = correrFunciones(cuando);
    assert.equal(conCarrera.status, 9,
      `enlace ${cuando} de resolver: debía negarse, no borrar:\n${conCarrera.salida}`);
    assert.match(conCarrera.salida, /enlace|enlaces|cambió/i);
    assert.ok(conCarrera.victimaintacta,
      `enlace ${cuando} de resolver: se borró la carpeta apuntada por el enlace`);
  }
});

test("--purge avisa de que también se lleva los respaldos", () => {
  const origen = crearOrigen();
  const { proyecto, instalador } = instalacionLista(origen);

  // Un respaldo válido, como en la prueba 51.
  baseSqlite(path.join(proyecto, "data", "shin.db"), 3);
  const r = correr(instalador, ["--repair"], { cwd: proyecto, env: { SHIN_REPO_URL: origen } });
  assert.equal(r.status, 0, r.salida);
  const respaldos = fs.readdirSync(path.join(proyecto, "backups"))
    .filter((n) => n.startsWith("pre-reparacion-"));
  assert.equal(respaldos.length, 1);

  // Se cancela la purga escribiendo otra cosa: además de no borrar nada,
  // el aviso ya tenía que haber nombrado los respaldos.
  const cancelado = correr(instalador, ["--uninstall", "--purge"],
    { cwd: proyecto, entrada: "si\nno borrar\n" });
  assert.notEqual(cancelado.status, 0, "cancelar debe terminar con error");
  assert.match(cancelado.salida, /Y tus 1 respaldo\(s\) de backups\//,
    "el aviso tiene que decir que se lleva los respaldos");
  assert.match(cancelado.salida, /con --uninstall se conservarían/,
    "y tiene que decir cuál es la alternativa");
  assert.ok(fs.existsSync(proyecto), "cancelar no borra nada");
  assert.ok(fs.existsSync(path.join(proyecto, "backups", respaldos[0])), "ni los respaldos");

  // Y si se confirma, se va todo: es lo que pidió quien escribe la frase.
  const hecho = correr(instalador, ["--uninstall", "--purge"],
    { cwd: proyecto, entrada: "si\nborrar todo\n" });
  assert.equal(hecho.status, 0, hecho.salida);
  assert.ok(!fs.existsSync(proyecto));
});

test("en Termux deja instalar en su home, que vive dentro de /data/data", () => {
  // Este caso se escapó: en Android todo está bajo /data/data, y el veto
  // genérico a esa ruta impedía instalar en la única carpeta posible.
  const fuente = fs.readFileSync(INSTALADOR, "utf8");
  const desde = fuente.indexOf("ruta_intocable() {");
  const hasta = fuente.indexOf("\ndestino_instalable() {");
  assert.ok(desde > 0 && hasta > desde, "no encuentro ruta_intocable en install.sh");
  const trozo = fuente.slice(desde, hasta);

  const evalRuta = (ruta, prefix) => {
    const guion = `
      morir() { exit 9; }
      dato() { :; }
      bien() { :; }
      C_NEG=""; C_RESET=""; C_ROJO=""; C_GRIS=""
      HOME=/data/data/com.termux/files/home
      export PREFIX=${JSON.stringify(prefix)}
      ${trozo}
      ruta_intocable ${JSON.stringify(ruta)}
    `;
    const r = spawnSync("bash", ["-c", guion], { encoding: "utf8" });
    return { bloquea: r.status === 0, motivo: (r.stdout || "").trim() };
  };

  const PREFIX = "/data/data/com.termux/files/usr";
  const home = "/data/data/com.termux/files/home";

  // Se permite la instalación dentro del home de Termux (y por debajo).
  for (const ruta of [`${home}/Shin-MD`, `${home}/proyectos/Shin-MD`]) {
    const r = evalRuta(ruta, PREFIX);
    assert.equal(r.bloquea, false, `debería permitir ${ruta} (${r.motivo})`);
  }

  // Se sigue bloqueando todo lo demás.
  const prohibidas = [
    home,                                   // el home en sí
    "/data/data/com.termux/files/usr",      // el prefijo
    "/data/data/com.termux",
    "/data/data/com.otra.app/files/home/Shin-MD", // otra app
    "/data/data",
    "/data",
  ];
  for (const ruta of prohibidas) {
    const r = evalRuta(ruta, PREFIX);
    assert.equal(r.bloquea, true, `no debería permitir ${ruta}`);
  }

  // Y sin PREFIX de Termux, /data/data sigue cerrado del todo.
  const fuera = evalRuta(`${home}/Shin-MD`, "/usr");
  assert.equal(fuera.bloquea, true, "en Linux normal /data/data no se toca");
});

test("una instalación a medias de otra versión se pone en la pedida, no se reutiliza", () => {
  // Caso real: alguien tenía un Shin-MD viejo (3.0.3) a medio instalar en
  // ~/Shin-MD. El instalador decía "continúo donde se quedó", seguía con el
  // código viejo y al final fallaba la comprobación de parches, sin decir por
  // qué. Ahora se cambia a la versión pedida antes de seguir.
  const origen = crearOrigen();

  // Dos versiones en el origen: v9.0.0 (vieja) y v9.9.9 (la que se pedirá).
  escribir(path.join(origen, "package.json"), JSON.stringify({
    name: "shin-md", version: "9.0.0", private: true, type: "module",
    scripts: { postinstall: "node scripts/preparar.cjs" },
  }, null, 2) + "\n");
  git(origen, "add", "-A");
  git(origen, "commit", "-q", "-m", "version vieja");
  git(origen, "tag", "v9.0.0");

  escribir(path.join(origen, "package.json"), JSON.stringify({
    name: "shin-md", version: "9.9.9", private: true, type: "module",
    scripts: { postinstall: "node scripts/preparar.cjs" },
  }, null, 2) + "\n");
  git(origen, "add", "-A");
  git(origen, "commit", "-q", "-m", "version nueva");
  git(origen, "tag", "v9.9.9");

  // Se simula la instalación a medias: clon de la versión VIEJA, sin la marca
  // de instalación completa.
  const raiz = temporal("shin-a-medias");
  const destino = path.join(raiz, "Shin-MD");
  const clon = spawnSync("git", ["clone", "--quiet", "--branch", "v9.0.0", origen, destino],
    { encoding: "utf8" });
  assert.equal(clon.status, 0, clon.stderr);
  assert.ok(!fs.existsSync(path.join(destino, ".shin-install")), "no debe estar marcada como completa");

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--yes"],
    { raiz, env: { SHIN_REPO_URL: origen } });

  assert.equal(r.status, 0, `debía instalar bien:\n${r.salida}`);
  assert.match(r.salida, /instalación incompleta encontrada/);
  assert.match(r.salida, /continuando en v9\.9\.9/);

  const pkg = JSON.parse(fs.readFileSync(path.join(destino, "package.json"), "utf8"));
  assert.equal(pkg.version, "9.9.9", "tiene que quedar en la versión pedida, no en la vieja");
});

test("una instalación a medias con cambios propios se aparta sin perderlos", () => {
  const origen = crearOrigen();
  git(origen, "tag", "v9.9.9");
  const raiz = temporal("shin-a-medias-sucio");
  const destino = path.join(raiz, "Shin-MD");
  spawnSync("git", ["clone", "--quiet", "--branch", "v9.9.9", origen, destino], { encoding: "utf8" });

  escribir(path.join(destino, "index.js"), "// lo que fuera que hizo el usuario\n");

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--yes"],
    { raiz, env: { SHIN_REPO_URL: origen } });

  // No se pisa: el archivo del usuario sigue intacto, pero en la carpeta
  // apartada. Antes esto abortaba y dejaba al usuario sin salida.
  assert.match(r.salida, /cambios propios/i, r.salida);
  assert.match(r.salida, /aparto la carpeta anterior/i);
  const apartada = fs.readdirSync(raiz).find((n) => n.startsWith("Shin-MD-viejo-"));
  assert.ok(apartada, "la carpeta con sus cambios tiene que quedar guardada");
  assert.equal(fs.readFileSync(path.join(raiz, apartada, "index.js"), "utf8"),
    "// lo que fuera que hizo el usuario\n", "no puede tocar el archivo del usuario");
});

test("una carpeta de otra historia se aparta entera y sus datos se recuperan", () => {
  // Caso real de Termux: el usuario tenía ~/Shin-MD de la 3.0.3, con una
  // historia que no comparte ni un commit con la actual (95 y 134 commits
  // distintos). El fetch contra el "origin" de esa carpeta fallaba y el
  // instalador no podía avanzar de ninguna forma.
  const origen = crearOrigen();
  git(origen, "tag", "v9.9.9");

  // La carpeta "vieja": otro repositorio, otra historia, con datos dentro.
  const raiz = temporal("shin-otra-historia");
  const destino = path.join(raiz, "Shin-MD");
  const antiguo = temporal("shin-repo-antiguo");
  escribir(path.join(antiguo, "package.json"), JSON.stringify({
    name: "shin-md", version: "3.0.3", private: true, type: "module",
  }, null, 2) + "\n");
  escribir(path.join(antiguo, "index.js"), "export const viejo = true;\n");
  git(antiguo, "init", "-q");
  git(antiguo, "add", "-A");
  git(antiguo, "commit", "-q", "-m", "version antigua");
  git(antiguo, "branch", "-M", "main");
  spawnSync("git", ["clone", "--quiet", antiguo, destino], { encoding: "utf8" });

  // Datos del usuario dentro de la carpeta vieja.
  escribir(path.join(destino, ".env"), "OWNER_NUMBER=5210000000000\nSECRETO=intacto\n");
  escribir(path.join(destino, "Sessions", "Owner", "auth.db"), "credenciales");
  baseSqlite(path.join(destino, "data", "shin.db"), 7);

  const r = correr(INSTALADOR, ["--version", "9.9.9", "--yes"],
    { raiz, env: { SHIN_REPO_URL: origen } });

  assert.equal(r.status, 0, `debía instalarlo:\n${r.salida}`);
  assert.match(r.salida, /otra versión del proyecto/);
  assert.match(r.salida, /aparto la carpeta anterior/i);

  // El código nuevo manda.
  const pkg = JSON.parse(fs.readFileSync(path.join(destino, "package.json"), "utf8"));
  assert.equal(pkg.version, "9.9.9");

  // Los datos del usuario volvieron.
  assert.equal(fs.readFileSync(path.join(destino, ".env"), "utf8"),
    "OWNER_NUMBER=5210000000000\nSECRETO=intacto\n");
  assert.equal(fs.readFileSync(path.join(destino, "Sessions", "Owner", "auth.db"), "utf8"), "credenciales");
  assert.ok(fs.existsSync(path.join(destino, "data", "shin.db")), "la base tiene que volver");

  // Y la carpeta vieja sigue existiendo, entera y con su código.
  const apartadas = fs.readdirSync(raiz).filter((n) => n.startsWith("Shin-MD-viejo-"));
  assert.equal(apartadas.length, 1, "tiene que quedar la instalación anterior apartada");
  const apartada = path.join(raiz, apartadas[0]);
  assert.ok(fs.existsSync(path.join(apartada, "index.js")), "sin borrar nada de la anterior");
  assert.equal(JSON.parse(fs.readFileSync(path.join(apartada, "package.json"), "utf8")).version, "3.0.3");
});

test("si el repositorio no responde, el error dice qué pasó de verdad", () => {
  const raiz = temporal("shin-sin-red");
  const destino = path.join(raiz, "Shin-MD");
  const antiguo = temporal("shin-repo-mudo");
  escribir(path.join(antiguo, "package.json"), '{"name":"shin-md","version":"1.0.0"}\n');
  git(antiguo, "init", "-q");
  git(antiguo, "add", "-A");
  git(antiguo, "commit", "-q", "-m", "x");
  spawnSync("git", ["clone", "--quiet", antiguo, destino], { encoding: "utf8" });

  const r = correr(INSTALADOR, ["--version", "9.9.9", "--yes"],
    { raiz, env: { SHIN_REPO_URL: path.join(raiz, "no-existe.git") } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /git dijo:/, "el mensaje tiene que traer lo que dijo git, no una suposición");
  assert.match(r.salida, /no-existe\.git|does not appear|not found|does not exist/i);
  assert.doesNotMatch(r.salida, /¿sin conexión\?/, "no se adivina la causa");
  // La carpeta vieja no se pierde: se aparta.
  const apartada = fs.readdirSync(raiz).find((n) => n.startsWith("Shin-MD-viejo-"));
  assert.ok(apartada, "la carpeta anterior tiene que seguir existiendo");
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, apartada, "package.json"), "utf8")).version, "1.0.0");
});

test("si git falla en silencio dentro de la carpeta vieja, se instala limpio igual", () => {
  // Caso real de Termux: dentro de ~/Shin-MD, "git fetch" terminaba con error
  // y sin imprimir NADA (probablemente el mata-procesos de Android por falta
  // de memoria). El instalador se quedaba atascado para siempre: no había
  // forma de avanzar. Ahora, si no se puede reutilizar, se aparta y se
  // descarga limpio, sin depender de que git funcione dentro de esa carpeta.
  const origen = crearOrigen();
  git(origen, "tag", "v9.9.9");

  const raiz = temporal("shin-git-mudo");
  const destino = path.join(raiz, "Shin-MD");
  const antiguo = temporal("shin-repo-mudo2");
  escribir(path.join(antiguo, "package.json"), '{"name":"shin-md","version":"3.0.3"}\n');
  escribir(path.join(antiguo, "index.js"), "export const viejo = true;\n");
  git(antiguo, "init", "-q");
  git(antiguo, "add", "-A");
  git(antiguo, "commit", "-q", "-m", "viejo");
  spawnSync("git", ["clone", "--quiet", antiguo, destino], { encoding: "utf8" });
  escribir(path.join(destino, ".env"), "SECRETO=intacto\n");
  baseSqlite(path.join(destino, "data", "shin.db"), 4);

  // Un git de mentira que falla sin decir nada SOLO dentro de esa carpeta:
  // imita lo que pasó en el móvil.
  const basura = temporal("shin-git-falso");
  const gitReal = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
  escribir(path.join(basura, "git"), `#!/bin/sh
for a in "$@"; do
  case "$a" in
    *"/Shin-MD"*) : ;;
  esac
done
case "$1" in
  -C)
    case "$2" in
      */Shin-MD) exit 128 ;;   # muere sin decir ni una palabra
    esac
    ;;
esac
exec ${gitReal} "$@"
`, 0o755);

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--yes"], {
    raiz,
    env: { SHIN_REPO_URL: origen, PATH: `${basura}:${process.env.PATH}` },
  });

  assert.equal(r.status, 0, `tenía que instalarlo igual:\n${r.salida}`);
  assert.match(r.salida, /git no pudo actualizarla \(código 128\)/);
  assert.match(r.salida, /git no dijo nada/);
  assert.match(r.salida, /aparto la carpeta anterior/);

  // El código es el nuevo y los datos volvieron.
  assert.equal(JSON.parse(fs.readFileSync(path.join(destino, "package.json"), "utf8")).version, "9.9.9");
  assert.equal(fs.readFileSync(path.join(destino, ".env"), "utf8"), "SECRETO=intacto\n");
  assert.ok(fs.existsSync(path.join(destino, "data", "shin.db")));
});

test("si la descarga limpia falla, no deja nada a medias en su sitio", () => {
  const raiz = temporal("shin-descarga-mala");
  const destino = path.join(raiz, "Shin-MD");
  const antiguo = temporal("shin-repo-previo");
  escribir(path.join(antiguo, "package.json"), '{"name":"shin-md","version":"3.0.3"}\n');
  git(antiguo, "init", "-q");
  git(antiguo, "add", "-A");
  git(antiguo, "commit", "-q", "-m", "x");
  spawnSync("git", ["clone", "--quiet", antiguo, destino], { encoding: "utf8" });

  const r = correr(INSTALADOR, ["--version", "v9.9.9", "--yes"],
    { raiz, env: { SHIN_REPO_URL: path.join(raiz, "no-existe.git") } });

  assert.notEqual(r.status, 0);
  assert.match(r.salida, /No existe la versión|No pude descargar/);
  assert.match(r.salida, /git dijo:/);

  // Ni carpeta parcial con restos, ni la instalación vieja tocada.
  const restos = fs.readdirSync(raiz).filter((n) => n.includes(".parcial-"));
  assert.deepEqual(restos, [], `no puede quedar basura: ${restos.join(", ")}`);
  const apartadas = fs.readdirSync(raiz).filter((n) => n.startsWith("Shin-MD-viejo-"));
  assert.equal(apartadas.length, 1, "la carpeta vieja se aparta, no se pierde");
  assert.ok(fs.existsSync(path.join(raiz, apartadas[0], "package.json")));
});
