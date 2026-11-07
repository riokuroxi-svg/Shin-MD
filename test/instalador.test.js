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
function correr(script, args, { cwd, raiz, env = {}, entrada } = {}) {
  if (raiz) dentroDeTmp(raiz);
  if (cwd) dentroDeTmp(cwd);
  const entorno = {
    ...process.env,
    NO_COLOR: "1",
    PATH: `${BIN_NODE}:${process.env.PATH}`,
    // Cinturón y tirantes: ni el instalador ni una prueba pueden borrar el
    // repositorio desde el que se ejecuta esta suite.
    SHIN_NO_BORRAR: `${RAIZ}:${process.env.SHIN_NO_BORRAR || ""}`,
    // El entorno de pruebas es un tmpfs pequeño; el umbral real se prueba aparte.
    SHIN_ESPACIO_MIN_MB: "1",
    ...(raiz ? { SHIN_INSTALL_ROOT: raiz } : {}),
    ...env,
  };
  const r = spawnSync("bash", [script, ...args], {
    cwd: cwd || RAIZ,
    env: entorno,
    encoding: "utf8",
    input: entrada,
    timeout: 300_000,
  });
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

/** Datos de usuario: .env con un secreto, sesión y base de datos. */
function sembrarDatos(proyecto) {
  escribir(path.join(proyecto, ".env"), "OWNER_NUMBER=5210000000000\nSECRETO=no-se-toca\n");
  escribir(path.join(proyecto, "Sessions", "Owner", "auth.db"), "credenciales-de-verdad");
  escribir(path.join(proyecto, "data", "shin.db"), "filas-de-verdad");
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
