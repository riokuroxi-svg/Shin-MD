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

  const r = correr(instalador, ["--uninstall", "--purge", "--yes"], { cwd: proyecto });

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
