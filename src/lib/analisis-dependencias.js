/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  analisis-dependencias.js — CAPAS 2 y 3 del blindaje
//
//    CAPA 2 · ANOMALÍAS de la cadena de suministro: lo que no debería
//             estar ahí (un paquete instalado que no está en el lock,
//             una versión que no es la declarada, un `resolved` que no
//             apunta al registro oficial, una dependencia que no tiene
//             `integrity`, un script de instalación donde no toca).
//
//    CAPA 3 · ANÁLISIS del contenido: patrones que en un paquete de
//             terceros no significan nada bueno. No es un antivirus con
//             firmas de virus: es un buscador de señales concretas, y
//             cada señal dice qué archivo, qué regla y qué se vio.
//
//  La diferencia con la capa 1 es honesta y hay que decirla: la capa 1
//  dice "esto cambió"; esta dice "esto se parece a un robo de
//  credenciales". Ninguna de las dos prueba intención: dan evidencia.
//
//  Todo es síncrono y sin dependencias externas a propósito: corre en el
//  preload, antes de que exista `sharp`, `axios` o `baileys`.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

/** De dónde se acepta que venga un paquete. */
export const REGISTROS_PERMITIDOS = new Set(["registry.npmjs.org"]);

/**
 * Paquetes a los que se les perdona tener script de instalación.
 * No es una lista de confianza: es una lista de excepciones que hay que
 * poder explicar. Si aparece una nueva, el aviso lo dice con nombre.
 */
export const SCRIPTS_PERMITIDOS = new Map([
  ["baileys", "el postinstall del proyecto le aplica sus parches (scripts/patch-baileys.cjs)"],
  ["@whiskeysockets/baileys", "idem"],
  ["sharp", "compila/descarga el binario de libvips"],
  ["@img/sharp-wasm32", "binario de respaldo para Android/Termux"],
  ["esbuild", "descarga su binario de plataforma"],
  ["protobufjs", "su postinstall genera el paquete mínimo"],
]);

/**
 * Reglas que, en ciertos paquetes, no significan nada: `baileys` ES la
 * implementación de WhatsApp, así que leer claves de sesión y pre-keys es
 * literalmente su trabajo. Sin esta lista, la regla más útil (`sesion-whatsapp`)
 * saltaría siempre en el paquete más legítimo del árbol, y un aviso que sale
 * siempre es un aviso que nadie lee.
 */
export const EXENTOS_POR_PAQUETE = {
  "sesion-whatsapp": [
    /^node_modules\/(?:@whiskeysockets\/)?baileys\//,
    /^node_modules\/libsignal\//,
    /^node_modules\/audio-decode\//,
  ],
};

/** Extensiones de texto que se inspeccionan (el binario no se lee). */
const TEXTO = new Set([".js", ".cjs", ".mjs", ".ts", ".json", ".sh", ".bash", ".py", ".command"]);
const MAX_BYTES = 1024 * 1024; // 1 MB por archivo: más que eso no es un paquete normal
const MAX_ARCHIVOS_POR_DEFECTO = 9000;
const MAX_HALLAZGOS = 200;

/**
 * Las reglas. Cada una: qué busca y por qué eso es una señal.
 * `gravedad`: alta (señal fuerte de robo/ejecución), media (merece un
 * vistazo), baja (contexto).
 */
export const REGLAS = [
  {
    id: "eval-ofuscado",
    gravedad: "alta",
    descripcion: "eval/Function sobre base64: código que se esconde de quien lo lee",
    prueba: (t) =>
      /(?:eval|new\s+Function)\s*\(/.test(t) &&
      /(?:Buffer\.from|atob)\s*\([^)]{0,300}?['"]base64['"]/i.test(t),
  },
  {
    id: "exfiltracion",
    gravedad: "alta",
    descripcion: "habla con un servicio de recogida de datos (webhook, paste, túnel)",
    prueba: (t) =>
      /(discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|pastebin\.com\/raw|webhook\.site|transfer\.sh|[a-z0-9-]+\.ngrok(?:-free)?\.(?:io|app)|interact\.sh|oast\.(?:fun|me|pro|site|online)|burpcollaborator)/i.test(
        t
      ),
  },
  {
    id: "shell-y-red",
    gravedad: "alta",
    descripcion: "lanza un proceso y descarga algo: el patrón clásico de un instalador troyanizado",
    prueba: (t) =>
      /child_process|execSync|spawnSync/.test(t) &&
      /(?:curl|wget)\s+(-{1,2}[\w-]+\s+)*https?:\/\//i.test(t),
  },
  {
    id: "entorno-exfiltrado",
    gravedad: "alta",
    descripcion: "manda las variables de entorno fuera (ahí van tus claves y tokens)",
    prueba: (t) =>
      /(?:JSON\.stringify\s*\(\s*process\.env|Object\.entries\s*\(\s*process\.env)/.test(t) &&
      /(?:fetch|axios|https?\.request|XMLHttpRequest|net\.connect)/.test(t),
  },
  {
    id: "sesion-whatsapp",
    gravedad: "alta",
    descripcion: "un paquete de terceros busca la sesión de WhatsApp del bot",
    prueba: (t) =>
      /(?:Sessions\/|auth\.creds|creds\.json|app-state-sync-key|pre-key-\d+\.json)/.test(t) &&
      /(?:readFile|readdir|createReadStream|require\(['"]fs|from\s+['"]fs)/.test(t),
  },
  {
    id: "minero",
    gravedad: "alta",
    descripcion: "referencias a minado de criptomonedas",
    prueba: (t) => /(stratum\+tcp|xmrig|randomx|moneroocean)/i.test(t),
  },
  {
    id: "ofuscacion-hex",
    gravedad: "media",
    descripcion: "cientos de escapes \\xNN: texto legible convertido en ruido",
    prueba: (t) => (t.match(/\\x[0-9a-fA-F]{2}/g) || []).length >= 150,
  },
  {
    id: "blob-base64",
    gravedad: "media",
    descripcion: "un bloque base64 de más de 800 caracteres incrustado en el código",
    prueba: (t) => /["'`][A-Za-z0-9+/]{800,}={0,2}["'`]/.test(t),
  },
  {
    id: "anti-depuracion",
    gravedad: "media",
    descripcion: "intenta detectar si lo están depurando (DEBUG, inspect, DevTools)",
    prueba: (t) =>
      /process\.execArgv[^\n]{0,80}inspect|inspector\.open|--inspect/.test(t) &&
      /process\.exit|kill\(/.test(t),
  },
];

/** Evidencia corta: qué se vio, sin volcar medio archivo en el log. */
function evidencia(texto, indice, ancho = 110) {
  const desde = Math.max(0, indice - 30);
  return texto
    .slice(desde, desde + ancho)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Analiza un texto y devuelve los hallazgos.
 * @param {string} texto
 * @param {{archivo?:string}} [opciones]
 * @returns {Array<{regla:string, gravedad:string, archivo:string, evidencia:string, descripcion:string}>}
 */
export function analizarTexto(texto, { archivo = "?" } = {}) {
  const hallazgos = [];
  if (!texto || texto.length === 0) return hallazgos;
  for (const regla of REGLAS) {
    let toca = false;
    try {
      toca = regla.prueba(texto);
    } catch {
      toca = false;
    }
    if (!toca) continue;
    // Para la evidencia se busca algo concreto, no el archivo entero.
    let idx = -1;
    for (const fragmento of ["eval", "http", "process.env", "child_process", "Sessions", "\\x"]) {
      const p = texto.toLowerCase().indexOf(fragmento.toLowerCase());
      if (p >= 0) {
        idx = idx < 0 || p < idx ? p : idx;
      }
    }
    hallazgos.push({
      regla: regla.id,
      gravedad: regla.gravedad,
      descripcion: regla.descripcion,
      archivo,
      evidencia: idx >= 0 ? evidencia(texto, idx) : "",
    });
  }
  return hallazgos;
}

/** Analiza un archivo suelto del árbol. */
export function analizarArchivo(absoluto, { raiz = process.cwd() } = {}) {
  let st;
  try {
    st = fs.statSync(absoluto);
  } catch {
    return [];
  }
  if (!st.isFile() || st.size > MAX_BYTES) return [];
  if (!TEXTO.has(path.extname(absoluto).toLowerCase())) return [];
  let texto;
  try {
    texto = fs.readFileSync(absoluto, "utf8");
  } catch {
    return [];
  }
  const rel = path.relative(raiz, absoluto).split(path.sep).join("/");
  return analizarTexto(texto, { archivo: rel }).filter((h) => {
    const exentos = EXENTOS_POR_PAQUETE[h.regla];
    return !exentos || !exentos.some((re) => re.test(rel));
  });
}

/** Lista los archivos del árbol que se pueden analizar. */
function archivosAnalizables(raiz) {
  const salida = [];
  const base = path.join(raiz, "node_modules");
  const visitar = (dir) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".cache" || e.name === ".bin") continue;
        visitar(full);
      } else if (e.isFile() && TEXTO.has(path.extname(e.name).toLowerCase())) {
        salida.push(full);
      }
    }
  };
  visitar(base);
  return salida;
}

/**
 * CAPA 3 sobre el árbol instalado.
 *
 * Si se le pasa `solo` (los archivos que cambiaron según la capa 1), revisa
 * únicamente esos: es lo que hace que la comprobación de arranque sea barata
 * en el caso normal. Sin `solo`, revisa todo (primera vez, o sin sello).
 *
 * @param {{raiz?:string, solo?:string[]|null, limite?:number}} [opciones]
 */
export function analizarContenido({
  raiz = process.cwd(),
  solo = null,
  limite = MAX_ARCHIVOS_POR_DEFECTO,
} = {}) {
  const candidatos = solo
    ? solo
        .map((rel) => path.join(raiz, "node_modules", rel))
        .filter((p) => {
          try {
            return fs.statSync(p).isFile();
          } catch {
            return false;
          }
        })
    : archivosAnalizables(raiz);

  const hallazgos = [];
  let analizados = 0;
  for (const abs of candidatos) {
    if (analizados >= limite || hallazgos.length >= MAX_HALLAZGOS) break;
    if (!TEXTO.has(path.extname(abs).toLowerCase())) continue;
    analizados++;
    hallazgos.push(...analizarArchivo(abs, { raiz }));
  }
  return {
    analizados,
    recortado: candidatos.length > limite,
    hallazgos: hallazgos.slice(0, MAX_HALLAZGOS),
  };
}

/**
 * Nombre de la carpeta de un paquete a partir de su ruta en node_modules.
 * Un paquete con ámbito ocupa dos tramos (`@borewit/text-codec`), y quedarse
 * con el último convertía a TODOS los @scope en "identidad cambiada".
 */
export function carpetaDe(ruta) {
  const marca = "node_modules/";
  const i = ruta.lastIndexOf(marca);
  const tramo = i >= 0 ? ruta.slice(i + marca.length) : ruta;
  if (tramo.startsWith("@")) return tramo.split("/").slice(0, 2).join("/");
  return tramo.split("/")[0];
}

/**
 * Nombre real de un paquete a partir de su ruta en el lock.
 * Ojo: `node_modules/a/node_modules/b` es `b`, y `node_modules/@scope/x` es
 * `@scope/x`. Partir por el primer `/node_modules/` dejaba el nombre con el
 * prefijo puesto y hacía creer que TODOS los paquetes eran intrusos.
 */
function nombreDeRuta(rel) {
  const marca = "node_modules/";
  const i = rel.lastIndexOf(marca);
  return i >= 0 ? rel.slice(i + marca.length) : rel;
}

function leerJSON(absoluto) {
  try {
    return JSON.parse(fs.readFileSync(absoluto, "utf8"));
  } catch {
    return null;
  }
}

/**
 * CAPA 2: la cadena de suministro declarada contra la instalada.
 * @param {{raiz?:string}} [opciones]
 */
export function analizarCadena({ raiz = process.cwd() } = {}) {
  const hallazgos = [];
  const push = (gravedad, regla, descripcion, archivo = "package-lock.json", extra = {}) =>
    hallazgos.push({ gravedad, regla, descripcion, archivo, evidencia: "", ...extra });

  const lock = leerJSON(path.join(raiz, "package-lock.json"));
  if (!lock || !lock.packages) {
    push(
      "media",
      "sin-lockfile",
      "no hay package-lock.json legible: sin él no se puede comprobar qué versión debería estar instalada",
      "package-lock.json"
    );
    return { hallazgos, paquetesDeclarados: 0 };
  }

  const declarados = lock.packages;
  let paquetesDeclarados = 0;

  for (const [rel, info] of Object.entries(declarados)) {
    if (!rel.startsWith("node_modules/")) continue;
    paquetesDeclarados++;
    const nombre = nombreDeRuta(rel);

    if (info.resolved) {
      let host = "";
      try {
        host = new URL(info.resolved).hostname;
      } catch {
        host = "";
      }
      const esGit = /^(git\+|git:|github:|gitlab:|bitbucket:)/.test(info.resolved);
      const httpPlano = info.resolved.startsWith("http://");
      if (httpPlano) {
        push(
          "alta",
          "registro-inseguro",
          `${nombre}: se descarga por HTTP sin cifrar (${info.resolved.slice(0, 80)})`,
          "package-lock.json"
        );
      } else if (esGit) {
        push(
          "media",
          "dependencia-git",
          `${nombre}: viene de git, no del registro oficial (no hay integrity que comprobar)`
        );
      } else if (host && !REGISTROS_PERMITIDOS.has(host)) {
        push(
          "alta",
          "registro-ajeno",
          `${nombre}: se descarga de "${host}", que no es el registro oficial de npm`
        );
      }
    }

    if (info.hasInstallScript && !SCRIPTS_PERMITIDOS.has(nombre)) {
      push(
        "media",
        "script-de-instalacion",
        `${nombre}: se ejecuta solo al instalar y no está en la lista de excepciones explicadas`
      );
    }

    if (info.resolved && !info.integrity && !info.link) {
      push(
        "media",
        "sin-integrity",
        `${nombre}: la entrada del lock no trae hash (integrity) que verificar`
      );
    }
  }

  // Instalado que nadie declaró, y declarado que no está.
  //
  // Las claves se comparan por RUTA, no por nombre a secas: `baileys` y
  // `baileys/node_modules/pino` son dos paquetes distintos, y compararlos
  // solo por su último tramo convertía cada dependencia anidada en un
  // falso positivo. Un detector que grita 20 veces por un árbol sano se
  // ignora, y entonces da igual que sea capaz de ver algo de verdad.
  const nm = path.join(raiz, "node_modules");
  /** ruta dentro de node_modules → nombre de la carpeta (último tramo). */
  const instalados = new Map();
  const listar = (dir, prefijo) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.name.startsWith("@")) {
        listar(path.join(dir, e.name), prefijo + e.name + "/");
        continue;
      }
      instalados.set(prefijo + e.name, e.name);
      // Dependencias anidadas: también cuentan, con su ruta completa.
      const anidado = path.join(dir, e.name, "node_modules");
      if (fs.existsSync(anidado)) listar(anidado, prefijo + e.name + "/node_modules/");
    }
  };
  listar(nm, "");

  const declaradosSet = new Set();
  for (const rel of Object.keys(declarados)) {
    if (rel.startsWith("node_modules/")) declaradosSet.add(rel.slice("node_modules/".length));
  }

  const intrusos = [...instalados.keys()].filter((ruta) => !declaradosSet.has(ruta));
  for (const ruta of intrusos.slice(0, 20)) {
    push(
      "media",
      "paquete-no-declarado",
      `${ruta}: está instalado en node_modules y no aparece en package-lock.json`
    );
  }
  if (intrusos.length > 20) {
    push(
      "media",
      "paquete-no-declarado",
      `…y ${intrusos.length - 20} paquetes instalados más que no están declarados`
    );
  }

  // Un paquete opcional o atado a otro sistema operativo NO tiene por qué
  // estar instalado: los binarios de sharp para darwin/freebsd/arm existen
  // en el lock y nunca se descargan en un Linux x64. Contarlos como
  // "falta un npm install" era ruido, no hallazgo.
  const ausentes = [...declaradosSet].filter((ruta) => {
    if (instalados.has(ruta)) return false;
    const info = declarados["node_modules/" + ruta] || {};
    if (info.optional || info.os || info.cpu || info.link) return false;
    return true;
  });
  for (const ruta of ausentes.slice(0, 10)) {
    push(
      "baja",
      "paquete-no-instalado",
      `${ruta}: declarado en el lock y ausente de node_modules (falta un npm install)`
    );
  }

  // Identidad: lo que dice el paquete de sí mismo contra lo que instaló npm.
  // Hay dos motivos legítimos para que no coincida con el nombre de la
  // carpeta, y los dos valen: un alias del package.json (`"baileys":
  // "npm:@whiskeysockets/baileys@…"`, que es justo el caso de este bot) y
  // el nombre que el lock apunta para esa ruta.
  for (const ruta of [...instalados.keys()].slice(0, 2000)) {
    const carpeta = carpetaDe(ruta);
    const pj = leerJSON(path.join(nm, ruta, "package.json"));
    if (!pj) continue;
    const delLock = declarados["node_modules/" + ruta]?.name;
    if (pj.name && pj.name !== carpeta && pj.name !== delLock) {
      push(
        "alta",
        "identidad-cambiada",
        `${ruta}: la carpeta dice ser "${pj.name}" por dentro — un paquete suplantando a otro`,
        `node_modules/${ruta}/package.json`
      );
    }
    if (pj.scripts) {
      const peligrosos = ["preinstall", "install", "postinstall"].filter((k) => pj.scripts[k]);
      if (
        peligrosos.length &&
        !SCRIPTS_PERMITIDOS.has(carpeta) &&
        !SCRIPTS_PERMITIDOS.has(pj.name)
      ) {
        push(
          "media",
          "script-de-instalacion",
          `${ruta}: declara ${peligrosos.join(", ")} en su package.json`,
          `node_modules/${ruta}/package.json`
        );
      }
    }
  }

  return { hallazgos, paquetesDeclarados };
}

/**
 * Las dos capas juntas, con resumen por gravedad.
 * @param {{raiz?:string, solo?:string[]|null, limite?:number, contenido?:boolean}} [opciones]
 */
export function analizarInstalacion({
  raiz = process.cwd(),
  solo = null,
  limite = MAX_ARCHIVOS_POR_DEFECTO,
  contenido = true,
} = {}) {
  const cadena = analizarCadena({ raiz });
  const texto = contenido
    ? analizarContenido({ raiz, solo, limite })
    : { analizados: 0, hallazgos: [], recortado: false };
  const hallazgos = [...texto.hallazgos, ...cadena.hallazgos];

  const resumen = { alta: 0, media: 0, baja: 0 };
  for (const h of hallazgos) resumen[h.gravedad] = (resumen[h.gravedad] || 0) + 1;

  return {
    hallazgos,
    resumen,
    analizados: texto.analizados,
    recortado: texto.recortado,
    paquetesDeclarados: cadena.paquetesDeclarados,
    limpio: hallazgos.length === 0,
  };
}

export default {
  REGLAS,
  REGISTROS_PERMITIDOS,
  SCRIPTS_PERMITIDOS,
  analizarTexto,
  analizarArchivo,
  analizarContenido,
  analizarCadena,
  analizarInstalacion,
};
