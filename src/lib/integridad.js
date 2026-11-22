/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  integridad.js — CAPA 1: ¿cambió algo que yo no cambié?
//
//  Qué es y qué NO es (esto va primero, porque es donde se mentía):
//
//    · Esto es un DETECTOR DE INTEGRIDAD. Compara el árbol de
//      dependencias con una foto anterior y dice qué se movió.
//    · Esto NO es un antivirus. No sabe si un archivo es malicioso:
//      solo sabe si es distinto. El análisis de contenido vive en
//      `analisis-dependencias.js` (CAPA 3) y la prevención en el
//      preload que corre ANTES de importar nada (CAPA 4).
//
//  Lo que cambió respecto a la versión anterior, que era el problema:
//
//    1. Antes se eximían `baileys/lib` y `baileys/esm` ENTEROS. Es
//       justo la librería que ve los mensajes y las credenciales: el
//       blindaje no miraba donde importa. Ahora no se exime nada; el
//       sello se toma DESPUÉS de aplicar los parches del conector, así
//       que los parches quedan dentro de la foto y un cambio posterior
//       se ve.
//    2. Antes solo se miraban `.js/.cjs/.mjs/.json/.node` y se
//       saltaban las carpetas llamadas `test`, `docs`… Un payload en
//       `x/test/y.txt` pasaba limpio. Ahora se hashea TODO archivo, sin
//       lista de extensiones y sin carpetas ignoradas.
//    3. Antes el sello vivía DENTRO de `node_modules`: `npm ci` lo
//       borraba y el bot decía "sin sello" como si nada. Ahora vive en
//       `data/` (fuera del árbol que vigila) y su ausencia se distingue
//       de su ilegibilidad.
//    4. Antes un sello ausente o ilegible se aceptaba con un aviso
//       suave. Ahora `sello-invalido` (firma que no cuadra) es un
//       estado propio y en modo estricto impide arrancar: falla
//       cerrado, no abierto.
//    5. Antes cualquiera podía re-sellar y el cambio quedaba perdonado.
//       Ahora el sello va firmado con HMAC-SHA256 y una clave que no
//       está en `node_modules` (ni en el repo).
//    6. Antes la comprobación corría DESPUÉS de los `import` estáticos,
//       o sea después de que una dependencia comprometida ya se hubiera
//       ejecutado. Ahora la lanza `scripts/preload-integridad.mjs` con
//       `--import`, antes de que se resuelva el primer import.
//
//  Límite honesto, que no se esconde: quien pueda escribir archivos y
//  LEER la clave (un paquete que corre como tu usuario) puede re-sellar
//  igual. Esto no es una firma criptográfica de autor; lo que sí
//  consigue es que re-sellar deje de ser silencioso: hay comando
//  explícito, sello nuevo y registro en `logs/seguridad-*.jsonl`.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MARCA = "shin-md-integridad-v2";
/** El sello vive FUERA de node_modules: si viviera dentro, `npm ci` se lo lleva. */
export const RUTA_SELLO = path.join("data", ".shin-integridad.json");
/** Clave HMAC. Ni en node_modules ni en el repo: `data/` va en .gitignore. */
export const RUTA_CLAVE = path.join("data", ".shin-clave");

/** Lo único que se salta: la caché efímera que npm/tooling reescribe sola. */
const IGNORAR_DIRS = new Set([".cache"]);
const NOMBRE_SELLO = path.basename(RUTA_SELLO);
const NOMBRE_CLAVE = path.basename(RUTA_CLAVE);

// ─────────────────────────── utilidades ───────────────────────────

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** JSON con las claves ordenadas: misma huella ⇒ misma cadena ⇒ misma firma. */
function jsonCanonico(valor) {
  if (Array.isArray(valor)) return "[" + valor.map(jsonCanonico).join(",") + "]";
  if (valor && typeof valor === "object") {
    return (
      "{" +
      Object.keys(valor)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + jsonCanonico(valor[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(valor ?? null);
}

/**
 * Clave HMAC del sello.
 *
 * Orden: `SHIN_INTEGRIDAD_CLAVE` (para contenedores donde `data/` es
 * efímero) y, si no, `data/.shin-clave` (0600, se crea al sellar).
 *
 * @param {string} raiz
 * @param {{crear?:boolean}} [opciones]
 * @returns {string|null} clave en hex, o null si no hay y no se pidió crear
 */
export function claveDe(raiz = process.cwd(), { crear = false } = {}) {
  const delEntorno = process.env.SHIN_INTEGRIDAD_CLAVE;
  if (delEntorno && delEntorno.length > 0) return sha256(delEntorno);

  const archivo = path.join(raiz, RUTA_CLAVE);
  try {
    const leida = fs.readFileSync(archivo, "utf8").trim();
    if (leida.length >= 32) return leida;
  } catch {
    /* no existe todavía */
  }
  if (!crear) return null;

  const nueva = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, nueva + "\n", { mode: 0o600 });
  return nueva;
}

function firmar(cuerpo, clave) {
  return crypto.createHmac("sha256", clave).update(jsonCanonico(cuerpo)).digest("hex");
}

// ─────────────────────────── huella ───────────────────────────

/**
 * Recorre el árbol y devuelve {archivos: Map<ruta,sha256>, enlaces: Map<ruta,destino>}.
 * Sin filtro de extensiones y sin carpetas perdonadas.
 *
 * @param {string} raiz
 * @returns {{archivos: Map<string,string>, enlaces: Map<string,string>, bytes:number}}
 */
export function huellaArbol(raiz = "node_modules") {
  const archivos = new Map();
  const enlaces = new Map();
  let bytes = 0;
  if (!fs.existsSync(raiz)) return { archivos, enlaces, bytes };

  const visitar = (dir) => {
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // carpeta que desapareció a mitad del recorrido: se ignora
    }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      const rel = path.relative(raiz, full).split(path.sep).join("/");

      // Un enlace se registra por su destino: si lo re-apuntan, se nota.
      if (e.isSymbolicLink()) {
        try {
          enlaces.set(rel, fs.readlinkSync(full));
        } catch {
          enlaces.set(rel, "?");
        }
        continue;
      }
      if (e.isDirectory()) {
        if (IGNORAR_DIRS.has(e.name)) continue;
        visitar(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name === NOMBRE_SELLO || e.name === NOMBRE_CLAVE) continue;
      try {
        const buf = fs.readFileSync(full);
        bytes += buf.length;
        archivos.set(rel, sha256(buf));
      } catch {
        /* archivo que desapareció a mitad: se ignora */
      }
    }
  };

  visitar(raiz);
  return { archivos, enlaces, bytes };
}

function hashDe(archivo) {
  try {
    return sha256(fs.readFileSync(archivo));
  } catch {
    return null;
  }
}

/**
 * Huella completa: árbol + los archivos que definen QUÉ se instala.
 * @param {string} raiz
 */
export function huellaCompleta(raiz = process.cwd()) {
  const { archivos, enlaces } = huellaArbol(path.join(raiz, "node_modules"));
  return {
    marca: MARCA,
    selloEn: new Date().toISOString(),
    node: process.versions.node,
    paquetes: archivos.size,
    packageJson: hashDe(path.join(raiz, "package.json")),
    packageLock: hashDe(path.join(raiz, "package-lock.json")),
    archivos: Object.fromEntries(archivos),
    enlaces: Object.fromEntries(enlaces),
  };
}

// ─────────────────────────── sello ───────────────────────────

/**
 * Sella el árbol actual y lo firma. Operación explícita de una persona:
 * por eso vive detrás de `node index.js --sellar` y no se llama sola.
 *
 * @param {{raiz?:string, archivo?:string, clave?:string}} [opciones]
 */
export function sellar({
  raiz = process.cwd(),
  archivo = path.join(raiz, RUTA_SELLO),
  clave,
} = {}) {
  const llave = clave || claveDe(raiz, { crear: true });
  const huella = huellaCompleta(raiz);
  const cuerpo = { ...huella, firmaAlgoritmo: "hmac-sha256" };
  const firmada = { ...cuerpo, firma: llave ? firmar(huella, llave) : null };

  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(firmada, null, 0) + "\n", { mode: 0o600 });
  return { ...huella, firmado: Boolean(llave) };
}

/**
 * Compara el árbol con el sello guardado.
 *
 * Estados posibles, cada uno con su gravedad:
 *   · `sin-sello`      — no hay foto. Nadie vigila (aviso).
 *   · `sello-invalido` — la firma no cuadra o el archivo está roto: alguien
 *                        tocó el sello. Es el estado GRAVE.
 *   · `cambio`         — el árbol no coincide con la foto.
 *   · `igual`          — todo cuadra.
 *
 * @param {{raiz?:string, archivo?:string, clave?:string|null}} [opciones]
 */
export function compararConSello({
  raiz = process.cwd(),
  archivo = path.join(raiz, RUTA_SELLO),
  clave,
} = {}) {
  const vacio = { nuevos: [], faltan: [], cambiados: [], cabeceras: [], enlaces: [] };

  if (!fs.existsSync(archivo)) {
    return { estado: "sin-sello", ...vacio, firmaOk: null, firmaEnSello: false };
  }

  let sello;
  try {
    sello = JSON.parse(fs.readFileSync(archivo, "utf8"));
  } catch (e) {
    return {
      estado: "sello-invalido",
      ...vacio,
      cabeceras: ["el sello no se puede leer: " + e.message],
      firmaOk: false,
      firmaEnSello: true,
    };
  }
  if (sello.marca !== MARCA) {
    return {
      estado: "sello-invalido",
      ...vacio,
      cabeceras: [
        "sello de otra versión (" + (sello.marca || "sin marca") + "): hay que volver a sellar",
      ],
      firmaOk: false,
      firmaEnSello: Boolean(sello.firma),
    };
  }

  // Firma: si el sello trae firma, tiene que cuadrar. Si no la trae, se
  // trata como inválido cuando hay clave, porque un sello sin firma es
  // exactamente lo que dejaría alguien que lo reescribió a mano.
  const llave = clave === undefined ? claveDe(raiz, { crear: false }) : clave;
  let firmaOk = null;
  if (sello.firma) {
    firmaOk = Boolean(llave) && firmar(huellaSin(sello), llave) === sello.firma;
    if (!firmaOk) {
      return {
        estado: "sello-invalido",
        ...vacio,
        cabeceras: [
          llave
            ? "la firma del sello no cuadra: alguien lo reescribió"
            : "el sello está firmado y no hay clave para comprobarlo (¿SHIN_INTEGRIDAD_CLAVE?)",
        ],
        firmaOk: false,
        firmaEnSello: true,
      };
    }
  } else if (llave) {
    return {
      estado: "sello-invalido",
      ...vacio,
      cabeceras: ["el sello no está firmado aunque hay clave: reescríbelo con --sellar"],
      firmaOk: false,
      firmaEnSello: false,
    };
  }

  const actual = huellaArbol(path.join(raiz, "node_modules"));
  const antes = sello.archivos || {};
  const enlacesAntes = sello.enlaces || {};
  const nuevos = [];
  const faltan = [];
  const cambiados = [];
  const cabeceras = [];
  const enlaces = [];

  for (const [rel, h] of actual.archivos) {
    if (!(rel in antes)) nuevos.push(rel);
    else if (antes[rel] !== h) cambiados.push(rel);
  }
  for (const rel of Object.keys(antes)) if (!actual.archivos.has(rel)) faltan.push(rel);
  for (const [rel, destino] of actual.enlaces) {
    if (!(rel in enlacesAntes)) enlaces.push("nuevo enlace: " + rel + " → " + destino);
    else if (enlacesAntes[rel] !== destino)
      enlaces.push("enlace re-apuntado: " + rel + " → " + destino);
  }
  for (const rel of Object.keys(enlacesAntes)) {
    if (!actual.enlaces.has(rel)) enlaces.push("enlace desaparecido: " + rel);
  }

  for (const [nombre, claveSello] of [
    ["package.json", "packageJson"],
    ["package-lock.json", "packageLock"],
  ]) {
    const h = hashDe(path.join(raiz, nombre));
    if (sello[claveSello] && h !== sello[claveSello])
      cabeceras.push(nombre + " cambió desde el sello");
  }

  const hayCambio =
    nuevos.length || faltan.length || cambiados.length || cabeceras.length || enlaces.length;
  return {
    estado: hayCambio ? "cambio" : "igual",
    nuevos,
    faltan,
    cambiados,
    cabeceras,
    enlaces,
    firmaOk: sello.firma ? true : null,
    firmaEnSello: Boolean(sello.firma),
    selloEn: sello.selloEn,
    paquetes: sello.paquetes,
  };
}

/** El cuerpo firmable: todo menos los campos que describen la firma. */
function huellaSin(huella) {
  const cuerpo = { ...huella };
  delete cuerpo.firma;
  delete cuerpo.firmaAlgoritmo;
  return cuerpo;
}

// ───────────────────── texto para la consola ─────────────────────

/**
 * Revisa y devuelve el veredicto en texto, más el detalle para /health.
 * No imprime: quien llama decide dónde va (preload, panel, web).
 *
 * @param {{raiz?:string, modo?:string, maximo?:number}} [opciones]
 */
export function revisarAlArrancar({
  raiz = process.cwd(),
  modo = process.env.SHIN_INTEGRIDAD || "avisar",
  maximo = 12,
} = {}) {
  const estricto = modo === "estricto" || modo === "strict";
  const r = compararConSello({ raiz });
  const lineas = [];
  const añadir = (t) => lineas.push(t);

  if (r.estado === "sin-sello") {
    añadir("sin sello de integridad: el árbol de dependencias no está fotografiado.");
    añadir("actívalo una vez, después de instalar y revisar:  node index.js --sellar");
    return {
      ok: !estricto,
      estado: r.estado,
      mensaje: lineas.join("\n"),
      detalle: r,
      aviso: "sin-sello",
    };
  }

  if (r.estado === "sello-invalido") {
    añadir("EL SELLO NO ES VÁLIDO: " + (r.cabeceras[0] || "ilegible"));
    añadir("Esto ocurre cuando alguien reescribe el sello en vez de dejar constancia del cambio.");
    añadir(
      "Si de verdad fuiste tú:  node index.js --sellar   ·   si no:  npm ci  y revisa el árbol."
    );
    return {
      ok: !estricto,
      estado: r.estado,
      mensaje: lineas.join("\n"),
      detalle: r,
      aviso: "alto",
    };
  }

  if (r.estado === "igual") {
    añadir(
      "integridad: " + r.paquetes + " archivos coinciden con el sello (" + (r.selloEn || "?") + ")."
    );
    return { ok: true, estado: r.estado, mensaje: lineas.join("\n"), detalle: r, aviso: null };
  }

  const total = r.nuevos.length + r.cambiados.length + r.faltan.length + r.enlaces.length;
  añadir("el árbol de dependencias CAMBIÓ desde el sello (" + total + " archivos).");
  for (const f of r.cambiados.slice(0, maximo)) añadir("  · modificado: " + f);
  for (const f of r.nuevos.slice(0, maximo)) añadir("  · nuevo:      " + f);
  for (const f of r.faltan.slice(0, maximo)) añadir("  · desapareció: " + f);
  for (const f of r.enlaces.slice(0, maximo)) añadir("  · " + f);
  for (const c of r.cabeceras) añadir("  · " + c);
  const mostrados = Math.min(total, maximo * 3 + r.cabeceras.length);
  if (total > mostrados) añadir("  … y " + (total - mostrados) + " más");

  // El aviso que de verdad importa: dónde estaba el cambio.
  const sensible = [...r.cambiados, ...r.nuevos].filter((f) =>
    /^(baileys|protobufjs|axios|ws|node-fetch|sharp|pino)\//.test(f)
  );
  if (sensible.length) {
    añadir("");
    añadir("  " + sensible.length + " de esos cambios están en librerías que ven tus mensajes,");
    añadir(
      "  tus credenciales o la red (baileys, protobufjs, axios, ws, node-fetch, sharp, pino)."
    );
    añadir("  Ese es el patrón de una dependencia comprometida. Si no fuiste tú:");
    añadir("    npm ci   →   node index.js --sellar");
  }
  añadir("");
  añadir("  Si el cambio fue tuyo y ya lo miraste:  node index.js --sellar");

  return {
    ok: !estricto,
    estado: r.estado,
    mensaje: lineas.join("\n"),
    detalle: r,
    aviso: sensible.length ? "alto" : "medio",
  };
}

export default {
  MARCA,
  RUTA_SELLO,
  RUTA_CLAVE,
  huellaArbol,
  huellaCompleta,
  compararConSello,
  sellar,
  revisarAlArrancar,
  claveDe,
};
