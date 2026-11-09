#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  mapa.mjs — el plano del proyecto, sacado del propio proyecto.
//
//    npm run mapa            reescribe docs/MAPA.md
//    npm run mapa -- --seco  enseña qué cambiaría, sin escribir
//
//  POR QUÉ UN GENERADOR Y NO UN DOCUMENTO
//  Un mapa escrito a mano miente en cuanto se mueve un archivo, y un mapa
//  que miente es peor que no tenerlo: se consulta justo cuando ya no
//  sabes dónde está algo. Aquí los números (cuántos comandos, cuántas
//  pruebas, qué dependencias, qué scripts) se cuentan leyendo el
//  repositorio. Las descripciones sí son texto mantenido a mano, pero si
//  aparece una carpeta o una dependencia sin describir, `npm test` lo
//  avisa: el mapa no puede crecer en silencio.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DESTINO = path.join(RAIZ, "docs", "MAPA.md");

// ─────────────────────── qué es cada carpeta ───────────────────────
const CARPETAS = {
  src: "El código del bot, por capas. Debajo va el desglose de cada subcarpeta.",
  bin: "Temporales de herramientas externas (`yt-dlp` y compañía). Vacía en el repositorio.",
  boot: "El arranque: licencia, banner, vinculación y carga de servicios. Un solo archivo, en orden.",
  cmds: "Los comandos de WhatsApp, uno por archivo. Se cargan en caliente: aquí no hay `import` que los una.",
  "src/commands": "El motor de comandos: cargador, router, contexto de mensaje y permisos.",
  "src/core": "El conector: socket de WhatsApp, motor de estados, sesión y caché de metadatos.",
  "src/lib": "Utilidades sin estado: formato, JID, tiempo, APIs de respaldo, vinculación, idioma visual.",
  "src/network": "Cola de salida y salud de la red (reintentos, cortes, presión).",
  "src/services": "Servicios con estado: base de datos del bot, economía, descargas, registro, vigía, consola.",
  "src/storage": "Dónde se guarda todo: SQLite, migraciones, caché y memoria de identidades.",
  "src/web": "El panel HTTP local del bot.",
  scripts: "Herramientas de mantenimiento (arranque, publicación, pruebas, auditorías). No las usa el bot al correr.",
  tools: "Utilidades de desarrollo: generadores de imágenes, vistas previas, este mapa.",
  test: "Las pruebas. Una por tema; cada archivo corre solo.",
  docs: "Documentación para quien lee y para quien toca el código.",
  assets: "Imágenes y sonidos que el bot envía (menús, avatares, portadas).",
  data: "La base de datos del bot y su respaldo JSON. Se crea sola.",
  Sessions: "Las credenciales de WhatsApp. Nunca se comparte ni se sube.",
  logs: "El registro diario del bot.",
  media: "Temporales de descargas y conversiones. Se vacían solos.",
};

// ─────────────────────── para qué está cada dependencia ───────────────────────
const DEPENDENCIAS = {
  baileys: "El conector de WhatsApp Multi-Device (paquete parcheado, ver `postinstall`).",
  chalk: "Color en la terminal, con soporte de 256 colores y NO_COLOR.",
  dotenv: "Lee el `.env` al arrancar.",
  express: "El servidor del panel web local.",
  "moment-timezone": "Fechas y horas en la zona del dueño.",
  moment: "Lo que usa `moment-timezone` por debajo.",
  "readline-sync": "Preguntar el número de vinculación en la terminal.",
  axios: "Peticiones HTTP de los comandos.",
  "node-fetch": "Peticiones HTTP donde `axios` no encaja (streams, descargas).",
  cheerio: "Leer HTML de las webs que se scrapean.",
  "form-data": "Subir archivos en las APIs que lo piden.",
  "file-type": "Adivinar el tipo real de un archivo por su contenido.",
  "mime-types": "El tipo por la extensión, cuando no hay bytes que mirar.",
  "grapheme-splitter": "Contar caracteres como los cuenta una persona (emojis, acentos).",
  "human-readable": "Números grandes legibles (1.2 GB, 340 ms).",
  jimp: "Edición de imágenes en JavaScript puro (lo que `sharp` no puede en WASM).",
  sharp: "Redimensionar y convertir imágenes rápido.",
  "@img/sharp-wasm32": "El `sharp` de respaldo para Android/Termux, donde no hay binario nativo. No se importa: lo usa `sharp`.",
  "node-cache": "Caché en memoria con caducidad.",
  pino: "El registro interno del conector de WhatsApp.",
  "node-webpmux": "Escribir metadatos en stickers WebP animados.",
  "awesome-phonenumber": "Validar y formatear teléfonos en `.wastalk` (se carga solo cuando se usa).",
  "aptoide-scraper": "Buscar APKs en `.apk` (se carga solo cuando se usa).",
  qrcode: "Generar la imagen del QR dentro del chat (`.qrcode`), no en la consola.",
  "@distube/ytdl-core": "Descargar de YouTube cuando `yt-dlp` no está.",
  "syntax-error": "Señalar la línea exacta cuando un comando no compila.",
  ws: "WebSocket del panel web.",
  "ytdlp-turbo": "Atajo interno para descargar con `yt-dlp` cuando está instalado.",
};

const SCRIPTS = {
  start: "Arranca el bot con el panel de la consola. Pregunta el número si hace falta.",
  "start:code": "Igual, pidiendo el código de vinculación.",
  "start:keep": "Arranca sin panel (vigía), pensado para un servicio.",
  vigia: "El vigilante: levanta el bot y lo recoge si se cae.",
  panel: "El panel web solo, sin el bot.",
  "panel:vivir": "El panel web en primer plano, para verlo en el navegador mientras el bot corre.",
  test: "La suite completa, archivo por archivo.",
  "test:cobertura": "La suite con cobertura de líneas y ramas.",
  "test:pairing": "Prueba la vinculación contra WhatsApp de verdad (una vez, a mano).",
  lint: "ESLint. Un error para todo; los avisos de estilo se toleran.",
  "lint:fix": "ESLint arreglando lo que se puede arreglar solo.",
  format: "Prettier sobre todo el código.",
  "format:check": "Comprobar el formato sin escribir nada.",
  typecheck: "TypeScript leyendo el JS con los JSDoc (sin convertirlo).",
  "docs:web": "Regenera la página de comandos y los números de la documentación.",
  "docs:pastel": "Regenera las imágenes del README.",
  mapa: "Regenera este mapa.",
  postinstall: "Aplica los parches al conector de WhatsApp. Se ejecuta al instalar.",
  firma: "Reescribe SHA256SUMS y apunta el arranque a la versión nueva.",
  "firma:check": "Comprobar que las huellas cuadran con los archivos.",
  publicar: "Saca una versión entera: versión, firma, suite, documentación, etiqueta, push y release.",
  release: "Alias de `publicar`.",
};

// ─────────────────────── recuento real ───────────────────────

const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const existe = (p) => fs.existsSync(path.join(RAIZ, p));

/**
 * Archivos de una carpeta, contados de verdad.
 *
 * Cuenta todo, no solo código: en `assets/` lo que hay son imágenes y en
 * `data/` una base de datos, y decir «0 archivos» ahí sería mentir.
 * Se saltan las carpetas ocultas y `node_modules`.
 */
function contar(carpeta) {
  const base = path.join(RAIZ, carpeta);
  if (!fs.existsSync(base)) return 0;
  let n = 0;
  // `__pycache__` y compañía se crean solos al ejecutar las herramientas:
  // contarlos hacía que el mapa cambiara de número entre dos corridas (13 y
  // 11 archivos en `tools/` sin tocar nada) y que su propia prueba fallara.
  const RUIDO = new Set(["node_modules", "__pycache__", ".cache", "dist", "build", "coverage"]);
  const andar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || RUIDO.has(e.name)) continue;
      if (e.isDirectory()) andar(path.join(dir, e.name));
      else n += 1;
    }
  };
  andar(base);
  return n;
}

/** Carpetas de primer y segundo nivel que existen ahora mismo. */
function carpetasReales() {
  const lista = [];
  for (const e of fs.readdirSync(RAIZ, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
    lista.push(e.name);
  }
  for (const sub of ["src"]) {
    const base = path.join(RAIZ, sub);
    if (!fs.existsSync(base)) continue;
    for (const e of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) lista.push(`${sub}/${e.name}`);
    }
  }
  return lista;
}

const paquete = () => JSON.parse(leer("package.json"));

// ─────────────────────── el documento ───────────────────────

/**
 * El mapa, en Markdown. Función pura: no escribe nada.
 * @returns {string}
 */
export function generarMapa() {
  const pkg = paquete();
  const lineas = [];
  const push = (...t) => lineas.push(...t);

  const comandos = contar("cmds");
  const pruebas = fs.readdirSync(path.join(RAIZ, "test")).filter((f) => f.endsWith(".test.js")).length;
  const libs = contar("src/lib");
  const servicios = contar("src/services");
  const scripts = contar("scripts");

  push(
    `# Mapa de Shin-MD ${pkg.version}`,
    "",
    "> Generado con `npm run mapa`. No se edita a mano: los números y las listas",
    "> salen del repositorio, así que si algo se mueve, se vuelve a lanzar.",
    "",
    "## Cómo se arranca",
    "",
    "```",
    "curl … | sh          instalador: comprueba la huella, instala Node si hace falta,",
    "                     baja la versión fijada y deja todo listo",
    "      ↓",
    "npm start            scripts/consola.mjs: dibuja el panel y vigila al bot",
    "      ↓",
    "   ¿sesión?          Sessions/Owner/auth.db con credenciales registradas",
    "      ├─ sí ────────→ no pregunta nada",
    "      └─ no ────────→ pide el número (aquí, en la consola)",
    "                        ↓",
    "                    pasa el número al bot y lanza: node index.js --code <número>",
    "                        ↓",
    "                    WhatsApp devuelve un código de 8 caracteres",
    "                        ↓",
    "                    se teclea en el teléfono: Ajustes › Dispositivos vinculados",
    "```",
    "",
    "El QR no existe en este proyecto. En la pantalla de un móvil no cabe y,",
    "partido en trozos, no hay quien lo escanee. Si no hay terminal donde",
    "preguntar (un servicio, un contenedor), el bot **no arranca a ciegas**: se",
    "para y dice la orden exacta que hay que escribir.",
    "",
    "## Las carpetas",
    "",
    "| Carpeta | Archivos | Para qué |",
    "| --- | --- | --- |",
  );

  for (const carpeta of carpetasReales()) {
    const descripcion = CARPETAS[carpeta] || CARPETAS[carpeta.split("/")[0]] || "";
    push(`| \`${carpeta}/\` | ${contar(carpeta)} | ${descripcion || "_sin describir_"} |`);
  }

  push(
    "",
    "Las carpetas de datos (`data/`, `logs/`, `media/`, `Sessions/`, `bin/`) aparecen",
    "vacías en el repositorio a propósito: se llenan al correr y no se suben nunca.",
    "",
    `Son **${comandos} archivos de comando**, **${libs} utilidades** en \`src/lib\`, ` +
      `**${servicios} servicios** y **${pruebas} archivos de prueba**.`,
    "",
    "## El viaje de un mensaje",
    "",
    "```",
    "WhatsApp",
    "  → src/core/socket.js        messages.upsert: se guarda y se pasa al manejador",
    "  → src/serialize.js          se convierte en el contexto que ven los comandos",
    "  → src/commands/router.js    ¿prefijo? ¿permiso? ¿enfriamiento?",
    "  → src/commands/loader.js    el comando ya estaba cargado (importación dinámica)",
    "  → cmds/<categoría>/<x>.js   el comando responde",
    "  → src/network/queue.js      la respuesta sale con cola y reintentos",
    "```",
    "",
    "## Dónde vive cada cosa",
    "",
    "| Qué | Dónde | Se puede borrar |",
    "| --- | --- | --- |",
    "| Credenciales de WhatsApp | `Sessions/Owner/auth.db` | No: hay que volver a vincular |",
    "| Economía, XP, perfiles, avisos | `data/shin.db` (SQLite) | No: es la memoria del bot |",
    "| Respaldo legible de la base | `data/shin.db.json` | Sí, se regenera |",
    "| Registro del día | `logs/shin-AAAA-MM-DD.log` | Sí |",
    "| Temporales de descargas | `media/` | Sí, se limpian solos |",
    "| Configuración | `.env` (ver `.env.example`) | No: sin él vuelve a lo de fábrica |",
    "",
    "## Los comandos de `npm`",
    "",
    "| Orden | Qué hace |",
    "| --- | --- |",
  );
  for (const [nombre, descripcion] of Object.entries(pkg.scripts || {})) {
    push(`| \`npm run ${nombre}\` | ${SCRIPTS[nombre] || "_sin describir_"} |`);
  }

  push(
    "",
    "## Las dependencias, una por una",
    "",
    "| Paquete | Para qué |",
    "| --- | --- |",
  );
  for (const dep of Object.keys(pkg.dependencies || {}).sort()) {
    push(`| \`${dep}\` | ${DEPENDENCIAS[dep] || "_sin describir_"} |`);
  }

  push(
    "",
    "## Las pruebas, por área",
    "",
    "| Área | Archivos | Qué vigilan |",
    "| --- | --- | --- |",
    "| Arranque y vinculación | `arranque`, `vinculacion`, `entorno`, `pairing` | Que el bot no arranque sin número ni enseñe un QR |",
    "| Instalador y publicación | `instalador`, `publicar`, `versiones`, `licencia` | Que el comando de una línea funcione y la versión no se quede vieja |",
    "| Consola y diseño | `consola`, `consola-bot`, `aesthetic-ui`, `design-system` | Que las cajas cuadren y el texto se lea |",
    "| Núcleo del bot | `core`, `context`, `router`, `interactive`, `compat`, `cola-incierta` | Enrutado, permisos, contexto, cola de salida |",
    "| Datos y memoria | `sqlite-respaldo`, `economia`, `xp`, `lid`, `db-opcional`, `relevo` | Que nada se pierda al cerrar |",
    "| Comandos concretos | `apis`, `menucat-fax`, `owner-mx`, `play-fuentes`, `ttt`, `random`, `tiempo`, `ytdlp-cliente` | Que cada uno haga lo suyo |",
    "| Documentación y página | `docs-web`, `mapa`, `web`, `web-audit` | Que lo publicado no mienta |",
    "| Operación | `vigia`, `mantenimiento`, `warmup-quota`, `conector-parches`, `auditoria`, `sombras` | Que el bot aguante en un VPS |",
    "",
    "## Lo que se retiró y no vuelve",
    "",
    "| Qué | Por qué |",
    "| --- | --- |",
    "| El QR en la consola | En un móvil no cabe; partido no se puede escanear. La vinculación es por código |",
    "| `FASTSAVER_KEY` y `api.fastsaver.io` | La variable no la leía nadie y la API ya no respondía |",
    "| `global.APIs` sin configurar | Reventaba cuatro comandos con un `TypeError`; ahora se configura en el `.env` |",
    "| `github-readme-stats` | El servicio devolvía 503; las cifras se generan en casa |",
    "| `cfonts`, `qrcode-terminal` | Dependencias que nadie importaba (el banner es de una columna, el QR no existe) |",
    "",
    "## Por dónde empezar a leer",
    "",
    "1. `boot/index.js` — se lee de arriba abajo y es el orden real del arranque.",
    "2. `src/lib/vinculacion.js` — la decisión de a quién se vincula y quién pregunta.",
    "3. `src/core/socket.js` — el conector, los eventos y los reintentos.",
    "4. `src/commands/router.js` — qué pasa con cada mensaje.",
    "5. `cmds/main/ping.js` — el comando más corto: sirve de plantilla.",
    "",
    "Si vas a tocar algo, lee antes `docs/DESARROLLO.md`: las cinco reglas que",
    "este proyecto no se salta.",
    "",
  );
  return lineas.join("\n");
}

// ─────────────────────── CLI ───────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seco = process.argv.includes("--seco");
  const nuevo = generarMapa();
  const antes = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : "";
  if (nuevo === antes) {
    console.log("  · docs/MAPA.md ya está al día\n");
  } else {
    const lineas = nuevo.split("\n").length;
    if (!seco) {
      fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
      fs.writeFileSync(DESTINO, nuevo);
    }
    console.log(`  ${seco ? "·" : "✓"} docs/MAPA.md ${seco ? "cambiaría" : "regenerado"} · ${lineas} líneas\n`);
  }
}

export default generarMapa;
