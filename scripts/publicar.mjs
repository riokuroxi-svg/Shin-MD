#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  publicar.mjs — una orden para sacar una versión.
//
//    npm run publicar                 sube el parche (3.7.0 → 3.7.1)
//    npm run publicar -- 3.7.2        esa versión, tal cual
//    npm run publicar -- minor        sube el menor (3.7.0 → 3.8.0)
//    npm run publicar -- 3.8.0 --seco enseñar el plan, sin tocar nada
//
//  POR QUÉ EXISTE
//  Publicar a mano son seis órdenes y cinco formas de equivocarse:
//  olvidar `npm run firma` (la huella deja de cuadrar), olvidar subir la
//  etiqueta (el comando de una línea da 404), o crear la release antes
//  de que la etiqueta exista. Aquí va todo en el único orden que
//  funciona, y si un paso falla no se sigue: o sale entera, o no sale.
//
//  LO QUE HACE, EN ORDEN
//    1. Sube la versión en package.json (y en docs/assets/datos.json).
//    2. Propaga esa versión a los comandos de instalación de la
//       documentación y regenera el mapa.
//    3. `firma`: reescribe SHA256SUMS y pone la etiqueta nueva en shin.sh.
//       Va después del paso 2 porque el cuadre también toca shin.sh.
//    4. Pasa la suite completa. Si algo falla, se para aquí y no se
//       ha subido nada.
//    5. Regenera la página de comandos y las imágenes del README con los
//       números reales de esa corrida, y hace un último `firma --check`
//       por si algo tocó el instalador después de firmarlo.
//    6. commit + etiqueta anotada + push de la rama y de la etiqueta.
//    7. La release con install.sh, shin.sh y SHA256SUMS: con `gh` si está,
//       y si no con la API y un `GH_TOKEN` del entorno. Así la orden única
//       funciona también en una máquina donde nadie instaló `gh`.
//    8. Imprime el comando de instalación ya apuntando a la versión nueva.
//
//  OPCIONES
//    --seco            enseñar el plan sin ejecutar nada
//    --rapido          no pasar la suite (solo se salta en pruebas)
//    --borrador        crear la release como borrador
//    --sin-release     solo commit + etiqueta + push (sin GitHub Release)
//    --sin-gh          crear la release por la API aunque `gh` esté instalado
//                      (útil si `gh` está pero sin sesión; también SHIN_SIN_GH=1)
//    --rama RAMA       rama a publicar (por defecto main)
//    --mensaje TEXTO   mensaje del commit (por defecto, el de siempre)
//    --si / --yes      sin preguntas (para CI)
// ═══════════════════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { sincronizarVersiones } from "./versiones.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const PAQUETE = path.join(RAIZ, "package.json");
const DATOS = path.join(RAIZ, "docs", "assets", "datos.json");
const RESUMEN_SUITE = path.join(RAIZ, "test", "resumen-suite.json");
const BLOQUEO = path.join(RAIZ, "package-lock.json");
const README = path.join(RAIZ, "README.md");
const ACTIVOS = ["install.sh", "shin.sh", "SHA256SUMS"];

// ─────────────────────────── consola ───────────────────────────
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (codigo, texto) => (tty ? `\u001b[${codigo}m${texto}\u001b[0m` : texto);
const paso = (t) => console.log(`\n${c("1;38;5;205", "▸")} ${c("1", t)}`);
const bien = (t) => console.log(`  ${c("38;5;114", "✓")} ${t}`);
const dato = (t) => console.log(`  ${c("38;5;245", "·")} ${t}`);
const aviso = (t) => console.error(`  ${c("38;5;221", "!")} ${t}`);
const morir = (t) => {
  console.error(`\n  ${c("38;5;203", "✗")} ${t}\n`);
  process.exit(1);
};

function ejecutar(orden, args, { permitirFallo = false, capturar = false } = {}) {
  const r = spawnSync(orden, args, {
    cwd: RAIZ,
    encoding: "utf8",
    stdio: capturar ? "pipe" : "inherit",
    shell: false,
  });
  if (r.error && r.error.code === "ENOENT") return { falta: true, codigo: 127, salida: "" };
  const salida = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (!permitirFallo && r.status !== 0) {
    morir(`falló \`${orden} ${args.join(" ")}\`${salida ? `:\n\n${salida}` : ""}`);
  }
  return { codigo: r.status, salida, stdout: (r.stdout || "").trim() };
}

const hay = (orden) =>
  !ejecutar("sh", ["-c", `command -v ${orden}`], { capturar: true, permitirFallo: true }).codigo;
const salida = (orden, args) => ejecutar(orden, args, { capturar: true }).stdout;

// ─────────────────────────── argumentos ───────────────────────────
const opciones = {
  seco: false,
  rapido: false,
  borrador: false,
  sinRelease: false,
  sinGh: false,
  rama: "main",
  mensaje: "",
  si: false,
  version: "",
};

const crudos = process.argv.slice(2);
for (let i = 0; i < crudos.length; i += 1) {
  const a = crudos[i];
  switch (a) {
    case "--seco":
    case "--dry-run":
      opciones.seco = true;
      break;
    case "--rapido":
      opciones.rapido = true;
      break;
    case "--borrador":
    case "--draft":
      opciones.borrador = true;
      break;
    case "--sin-release":
      opciones.sinRelease = true;
      break;
    case "--sin-gh":
      opciones.sinGh = true;
      break;
    case "--si":
    case "--yes":
    case "-y":
      opciones.si = true;
      break;
    case "--rama":
      opciones.rama = crudos[++i];
      if (!opciones.rama) morir("--rama necesita un nombre");
      break;
    case "--mensaje":
    case "-m":
      opciones.mensaje = crudos[++i];
      if (!opciones.mensaje) morir("--mensaje necesita un texto");
      break;
    case "-h":
    case "--help":
    case "--ayuda":
      console.log(`
  npm run publicar                  sube el parche (3.7.0 → 3.7.1)
  npm run publicar -- 3.7.2         esa versión
  npm run publicar -- minor|major   sube menor o mayor
  npm run publicar -- --seco        enseñar el plan, sin tocar nada

  --rapido      no pasar la suite     --borrador   release como borrador
  --sin-release solo commit/tag/push  --rama       rama a publicar (main)
  --mensaje     mensaje del commit    --si         sin preguntas
  --ayuda       esta ayuda
`);
      process.exit(0);
      break;
    default:
      if (a.startsWith("-")) morir(`opción desconocida: ${a}`);
      if (opciones.version) morir(`sobra un argumento: ${a}`);
      opciones.version = a;
  }
}

// ─────────────────────────── versiones ───────────────────────────
const leerJson = (ruta) => JSON.parse(fs.readFileSync(ruta, "utf8"));
const guardarJson = (ruta, datos) =>
  fs.writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);

function calcularVersion(actual, pedido) {
  if (!pedido) {
    const [mayor, menor, parche] = actual.split(".").map(Number);
    return `${mayor}.${menor}.${parche + 1}`;
  }
  const limpio = pedido.replace(/^v/, "");
  if (/^\d+\.\d+\.\d+$/.test(limpio)) return limpio;
  const [mayor, menor, parche] = actual.split(".").map(Number);
  switch (limpio) {
    case "major":
      return `${mayor + 1}.0.0`;
    case "minor":
      return `${mayor}.${menor + 1}.0`;
    case "patch":
      return `${mayor}.${menor}.${parche + 1}`;
    default:
      morir(`no entiendo la versión "${pedido}": usa 3.7.1, major, minor o patch`);
  }
  return actual;
}

const actual = leerJson(PAQUETE).version;
const destino = calcularVersion(actual, opciones.version);
const etiqueta = `v${destino}`;

// ─────────────────────────── comprobaciones previas ───────────────────────────
paso("Comprobando que se puede publicar");

if (!fs.existsSync(path.join(RAIZ, ".git"))) morir("esto no es un repositorio git");

const ramaActual = salida("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (ramaActual !== opciones.rama) {
  morir(`estás en "${ramaActual}" y se publica desde "${opciones.rama}".
  Cámbiate con: git checkout ${opciones.rama}`);
}
if (!salida("git", ["remote"]).split("\n").includes("origin")) {
  morir("no hay remoto `origin`; sin él no hay dónde publicar");
}
// La identidad de git no viene puesta en un runner de CI, en un contenedor ni
// en una máquina recién instalada. Sin esto, `git commit` muere con
// «empty ident name», que no dice nada a quien lo lee y aparece justo al
// final, después de haber pasado la suite entera.
// `permitirFallo`: cuando la clave no existe, `git config` sale con 1 y no
// imprime nada. Eso no es un error que deba cortar aquí: es justo lo que se
// está mirando.
const leerConfig = (clave) =>
  ejecutar("git", ["config", clave], { capturar: true, permitirFallo: true }).stdout;
const nombreGit = leerConfig("user.name") || process.env.GIT_AUTHOR_NAME || "";
const correoGit = leerConfig("user.email") || process.env.GIT_AUTHOR_EMAIL || "";
if (!nombreGit || !correoGit) {
  morir(`git no sabe quién eres, así que no puede firmar el commit de la release.
  Se arregla una vez:
    git config --global user.name "Tu Nombre"
    git config --global user.email "tu@correo"
  (o exporta GIT_AUTHOR_NAME y GIT_AUTHOR_EMAIL para esta terminal sola)`);
}

const etiquetas = salida("git", ["tag", "--list", etiqueta]);
if (etiquetas === etiqueta) {
  morir(`la etiqueta ${etiqueta} ya existe.
  Si quieres volver a publicarla: git tag -d ${etiqueta} && git push origin :${etiqueta}
  Si quieres la siguiente: npm run publicar`);
}

// Sin `gh` no hay release, pero el código y la etiqueta sí se pueden subir.
// Se mira aquí para poder anunciarlo en el plan, pero no se ejecuta nada de
// `gh` hasta después del modo seco: `--seco` no llama a nada.
// `--sin-gh` (o SHIN_SIN_GH=1) fuerza el camino de la API aunque `gh` esté
// instalado. Sirve cuando `gh` está pero sin sesión, y es lo que usan las
// pruebas para simular una máquina sin `gh` sin pelearse con el PATH —que
// fue el error anterior: en los runners de GitHub, `gh` y `git` viven en la
// misma carpeta, así que quitar esa carpeta dejaba al script sin `git`.
const hayGh = !opciones.sinGh && !process.env.SHIN_SIN_GH && hay("gh");
// Sin `gh` hay otra puerta: la API de GitHub con un token del entorno. El
// token se lee de `GH_TOKEN` o `GITHUB_TOKEN` y nunca se escribe en ningún
// archivo ni se imprime.
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const hayApi = Boolean(TOKEN);
if (!hayGh && !hayApi && !opciones.sinRelease) {
  aviso("no encuentro `gh` ni un `GH_TOKEN`: se subirá el código y la etiqueta, sin GitHub Release.");
  aviso("para tener el comando de una línea: instala https://cli.github.com o exporta GH_TOKEN.");
}

const cambios = salida("git", ["status", "--porcelain"]);
dato(`versión ${actual} → ${c("1", destino)}`);
dato(`rama ${opciones.rama} · ${cambios ? "hay cambios sin commitear (entrarán)" : "árbol limpio"}`);

const plan = [
  `subir la versión a ${destino} (package.json, package-lock.json, datos.json)`,
  "firma: SHA256SUMS nuevo y shin.sh apuntando a la etiqueta nueva",
  "regenerar docs/web y las imágenes del README",
  opciones.rapido ? "saltar la suite (--rapido)" : "pasar la suite completa",
  `git commit + git tag ${etiqueta} + push de ${opciones.rama} y de la etiqueta`,
  opciones.sinRelease || (!hayGh && !hayApi)
    ? "sin GitHub Release"
    : hayGh
      ? `gh release create ${etiqueta} ${ACTIVOS.join(" ")}${opciones.borrador ? " --draft" : ""} --generate-notes`
      : `release ${etiqueta} por la API (GH_TOKEN) con ${ACTIVOS.join(", ")}`,
];

if (opciones.seco) {
  console.log("");
  for (const linea of plan) dato(linea);
  console.log(`\n  ${c("38;5;245", "modo seco: no se ha tocado nada.")}\n`);
  process.exit(0);
}

// El repositorio público se resuelve a la primera que haga falta, no antes:
// resolverlo puede preguntarle a `gh`, y ni `--seco` ni una suite en rojo
// deben llegar a llamar a GitHub.
let repoResuelto = "";
const repo = () => (repoResuelto ||= repoPublico());

if (!opciones.si && process.stdin.isTTY) {
  process.stdout.write(`\n  ¿Publicar ${c("1", destino)}? [S/n] `);
  const respuesta = leerTeclado().trim().toLowerCase();
  if (!["", "s", "si", "sí", "y", "yes"].includes(respuesta)) morir("cancelado; no se tocó nada.");
}

// Se lee del descriptor 0 y no con un hijo: un `head` lanzado desde aquí no
// hereda la terminal y devolvería fin de archivo, cancelando siempre.
function leerTeclado() {
  const bufer = Buffer.alloc(256);
  try {
    const leidos = fs.readSync(0, bufer, 0, bufer.length, null);
    return bufer.subarray(0, leidos).toString("utf8");
  } catch {
    return "";
  }
}

// ─────────────────────────── 1. versión ───────────────────────────
paso(`Versión ${destino}`);
const pkg = leerJson(PAQUETE);
pkg.version = destino;
guardarJson(PAQUETE, pkg);
if (fs.existsSync(DATOS)) {
  const datos = leerJson(DATOS);
  datos.version = destino;
  guardarJson(DATOS, datos);
}
// El `package-lock.json` se queda con la versión vieja si no se toca, y
// entonces `npm ci` avisa de que no cuadra con `package.json`. Se escriben
// las dos copias que guarda (la de arriba y la del paquete raíz).
if (fs.existsSync(BLOQUEO)) {
  const cerrojo = leerJson(BLOQUEO);
  cerrojo.version = destino;
  if (cerrojo.packages && cerrojo.packages[""]) cerrojo.packages[""].version = destino;
  guardarJson(BLOQUEO, cerrojo);
}
bien("package.json, package-lock.json y docs/assets/datos.json al día");

// ─────────────────────── 2. versión en todo lo que se publica ───────────────────────
// El ORDEN de este paso no es gusto: la versión se propaga primero y se firma
// al final, y el mapa se genera aquí porque solo depende de `package.json`.
//
// Va antes de la suite a propósito: `test/versiones.test.js` falla si algún
// documento manda a instalar la versión anterior, y `test/mapa.test.js` falla
// si el mapa no coincide con el repositorio. Con el orden inverso, la primera
// publicación de una versión nueva nunca podría pasar sus propias pruebas.
//
// Lo que costó aprender: cuando la firma iba ANTES de esto, el cuadre de
// versiones reescribía la cabecera de `shin.sh` después de haberlo firmado y
// la huella de `SHA256SUMS` quedaba vieja. La suite lo cazó (tres archivos en
// rojo) y no se publicó nada, que es exactamente lo que tenía que pasar.
paso("Cuadrando la versión en la documentación");
const versionados = sincronizarVersiones({ raiz: RAIZ });
if (!versionados.length) dato(`todo apuntaba ya a ${etiqueta}`);
for (const v of versionados) dato(`${v.ruta} → ${v.despues}`);
bien(`comandos de instalación de la documentación en ${etiqueta}`);

const MAPA = path.join(AQUI, "..", "tools", "mapa.mjs");
if (fs.existsSync(MAPA)) {
  ejecutar(process.execPath, [MAPA], { permitirFallo: true });
}

// ─────────────────────────── 3. huella ───────────────────────────
// Después de tocar `shin.sh`: la firma tiene que cubrir el archivo tal y como
// se publica, no una versión previa.
paso("Firmando el instalador");
ejecutar(process.execPath, [path.join(AQUI, "firma-instalador.mjs")]);
ejecutar(process.execPath, [path.join(AQUI, "firma-instalador.mjs"), "--check"]);
bien(`SHA256SUMS y shin.sh apuntan a ${etiqueta}`);

// ─────────────────────────── 4. pruebas ───────────────────────────
// La suite va ANTES de la documentación: deja el resumen real (cuántas
// pruebas pasan) que la página y el README anuncian. Al revés, los números
// publicados serían los de la corrida anterior.
if (!opciones.rapido) {
  paso("Pasando la suite");
  ejecutar(process.execPath, [path.join(AQUI, "run-tests.mjs")]);
  const resumen = leerJson(RESUMEN_SUITE);
  bien(`${resumen.pasan}/${resumen.total} pruebas`);
  if (resumen.fallos) morir("la suite no está limpia: no se publica nada");
} else {
  aviso("suite saltada (--rapido): solo para pruebas, no para una release de verdad");
}

// ─────────────────────────── 5. documentación ───────────────────────────
paso("Actualizando la documentación");
const WEB = path.join(AQUI, "actualizar-web.mjs");
if (fs.existsSync(WEB)) ejecutar(process.execPath, [WEB], { permitirFallo: true });
const PASTEL = path.join(RAIZ, "tools", "build_pastel.py");
if (fs.existsSync(PASTEL) && hay("python3")) {
  ejecutar("python3", [PASTEL], { permitirFallo: true });
}
const PERFIL = path.join(RAIZ, "tools", "build_perfil.py");
if (fs.existsSync(PERFIL) && hay("python3")) {
  ejecutar("python3", [PERFIL], { permitirFallo: true });
}
sincronizarNumerosReadme();
bien("página de comandos, imágenes y números de pruebas al día");

// Último control antes de firmar en git: si algún paso de arriba tocó el
// instalador (o su SHA256SUMS) después de la firma, aquí se para. Es la
// comprobación que faltaba el día en que la huella se publicó vieja.
ejecutar(process.execPath, [path.join(AQUI, "firma-instalador.mjs"), "--check"]);
bien("la huella sigue cuadrando con los archivos que se van a publicar");

function sincronizarNumerosReadme() {
  if (!fs.existsSync(README) || !fs.existsSync(RESUMEN_SUITE)) return;
  let resumen;
  try {
    resumen = leerJson(RESUMEN_SUITE);
  } catch {
    return;
  }
  const pasan = resumen.pasan;
  const total = resumen.total;
  if (!pasan || !total) return;
  const texto = fs.readFileSync(README, "utf8");
  // Tres formas en que el README dice el número: la insignia (299%2F299),
  // el texto del alt (299/299 pruebas) y el comentario de `npm test`.
  const nuevo = texto
    .replace(/\b\d+%2F\d+(?=%20)/g, `${pasan}%2F${total}`)
    .replace(/\b\d+\/\d+ pruebas\b/g, `${pasan}/${total} pruebas`)
    .replace(/(# las )\d+( pruebas)/g, `$1${total}$2`);
  if (nuevo !== texto) fs.writeFileSync(README, nuevo);
}

// La sesión de `gh` se comprueba aquí: después de que la suite haya pasado
// (no se llama a la red por nada) y antes del push (si no hay sesión, mejor
// saberlo antes de haber subido la etiqueta).
if (hayGh && !opciones.sinRelease) {
  const sesion = ejecutar("gh", ["auth", "status"], { capturar: true, permitirFallo: true });
  if (sesion.codigo !== 0) {
    morir(`\`gh\` no tiene sesión iniciada:
${sesion.salida}
  Inicia sesión con: gh auth login`);
  }
}

// ─────────────────────────── 5. commit y etiqueta ───────────────────────────
paso("Subiendo el código");
const mensaje =
  opciones.mensaje ||
  `chore(release): ${etiqueta}\n\nInstalador firmado, arranque en un comando y documentación al día.`;
ejecutar("git", ["add", "-A"]);
const hayAlgo = salida("git", ["status", "--porcelain"]);
if (hayAlgo) {
  ejecutar("git", ["commit", "-m", mensaje]);
  bien(`commit ${salida("git", ["rev-parse", "--short", "HEAD"])}`);
} else {
  dato("no había cambios que commitear");
}
ejecutar("git", ["tag", "-a", etiqueta, "-m", `Shin-MD ${destino}`]);
bien(`etiqueta ${etiqueta} creada`);
ejecutar("git", ["push", "origin", opciones.rama]);
// La etiqueta aparte y no con --follow-tags: así se sabe exactamente qué se
// subió y, si el push falla a medias, el mensaje siguiente lo dice.
ejecutar("git", ["push", "origin", etiqueta]);
bien(`rama ${opciones.rama} y etiqueta ${etiqueta} en el remoto`);

// ─────────────────────────── 6. GitHub Release ───────────────────────────
// Sin `gh` pero con token: la API hace lo mismo que haría `gh`, y con las
// mismas notas (GitHub las genera a partir de los commits y del tag).
async function releasePorApi() {
  const base = "https://api.github.com";
  const cabeceras = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const pedir = async (url, init = {}) => {
    const r = await fetch(url, { ...init, headers: { ...cabeceras, ...(init.headers || {}) } });
    if (!r.ok) {
      const texto = await r.text();
      morir(`GitHub respondió ${r.status} en ${url}:\n${texto.slice(0, 600)}\n` +
        (r.status === 401 ? "  El token no vale o ha caducado: exporta uno nuevo en GH_TOKEN." :
         r.status === 403 ? "  Al token le falta permiso de `repo` (o `contents: write`)." :
         r.status === 422 ? "  Puede que la release ya exista para esta etiqueta." : ""));
    }
    return r.json();
  };
  const release = await pedir(`${base}/repos/${repo()}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: etiqueta,
      name: `Shin-MD ${destino}`,
      generate_release_notes: true,
      draft: Boolean(opciones.borrador),
      prerelease: false,
    }),
  });
  dato(`release creada: ${release.html_url}`);
  for (const activo of ACTIVOS) {
    const tipo = activo.endsWith(".sh") ? "text/x-shellscript" : "text/plain";
    const subida = await pedir(`${release.upload_url.split("{")[0]}?name=${activo}`, {
      method: "POST",
      headers: { "Content-Type": tipo },
      body: fs.readFileSync(path.join(RAIZ, activo)),
    });
    dato(`${activo} · ${subida.size} bytes · ${subida.state}`);
  }
  bien(`release ${etiqueta} publicada con ${ACTIVOS.join(", ")}`);
  return release.html_url;
}

let urlRelease = "";
if (!opciones.sinRelease) {
  if (hayGh) {
    paso("Publicando la release");
    const args = ["release", "create", etiqueta, ...ACTIVOS,
      "--title", `Shin-MD ${destino}`,
      "--generate-notes",
      "--verify-tag"];
    if (opciones.borrador) args.push("--draft");
    ejecutar("gh", args);
    bien(`release ${etiqueta} publicada con ${ACTIVOS.join(", ")}`);
  } else if (hayApi) {
    paso("Publicando la release (API, sin `gh`)");
    urlRelease = await releasePorApi();
  }
}

// ─────────────────────────── 7. resumen ───────────────────────────
paso("Hecho");
// De dónde saldrá el comando de instalación. `origin` es lo normal, pero en
// una copia con remoto local (o en un fork con otro nombre) eso no sirve:
// se cae a `gh`, y luego al `repository` del package.json.
function repoPublico() {
  // Se lee la configuración tal cual, no `git remote get-url`: ese comando
  // devuelve la URL ya reescrita por las reglas `url.<base>.insteadOf`, y
  // entonces un espejo local se confundiría con el repositorio de verdad.
  const url = salida("git", ["config", "--get", "remote.origin.url"]);
  const limpio = url
    .replace(/^git@github\.com:/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(limpio)) return limpio;
  // `gh` solo se consulta si de verdad se va a publicar una release: con
  // --sin-release no hay motivo para llamar a GitHub.
  if (hayGh && !opciones.sinRelease) {
    const visto = ejecutar("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      capturar: true,
      permitirFallo: true,
    });
    if (visto.codigo === 0 && /^[\w.-]+\/[\w.-]+$/.test(visto.stdout)) return visto.stdout;
  }
  const declarado = leerJson(PAQUETE).repository;
  const texto = typeof declarado === "string" ? declarado : declarado && declarado.url;
  if (texto) {
    const otro = texto
      .replace(/^git\+https:\/\/github\.com\//, "")
      .replace(/^git@github\.com:/, "")
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
    if (/^[\w.-]+\/[\w.-]+$/.test(otro)) return otro;
  }
  return "<usuario>/<repo>";
}
console.log(`
  ${c("1", `Shin-MD ${destino}`)} publicado.

  Instalar (una línea):
    curl -fsSL https://raw.githubusercontent.com/${repo()}/${etiqueta}/shin.sh | sh

  ${urlRelease ? `Release:\n    ${urlRelease}` : `Comprobar lo que se subió:\n    gh release view ${etiqueta}`}
`);
