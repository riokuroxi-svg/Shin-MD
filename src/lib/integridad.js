/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  integridad.js — cerradura de cadena de suministro
//
//  El problema real: el bot confía en su propio node_modules. Si una
//  dependencia (o el postinstall de turno) cambia un archivo, nadie se
//  entera: el árbol se ve sano y el bot arranca igual. Esto pone una
//  huella conocida y la compara en cada arranque.
//
//  Cómo se usa:
//    node index.js --sellar          <- sella el árbol actual (una vez,
//                                        después de instalar y verificar)
//    node index.js                   <- arranca y COMPARA (solo avisa)
//    SHIN_INTEGRIDAD=estricto        <- si algo cambió, no arranca
//
//  Qué se mide: sha256 de cada archivo .js/.cjs/.mjs/.json/.node de
//  node_modules (sin contar los que el propio bot parchea a propósito:
//  ver EXENTOS), más el sha256 de package.json y package-lock.json.
//
//  Qué NO es: no es una firma. Un atacante con permiso de escritura
//  puede re-sellar. Sirve para lo que de verdad pasa: te enteras de un
//  cambio que no hiciste tú (npm install ajeno, postinstall, gusano de
//  dependencias, edición manual). Es detección, no criptografía fuerte.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MARCA = "shin-md-integridad-v1";
const ARCHIVO = "node_modules/.shin-integridad.json";
// El propio sello vive dentro de node_modules: excluirlo o se delata a sí mismo.
const EXTENSIONES = new Set([".js", ".cjs", ".mjs", ".json", ".node"]);
const NOMBRE_SELLO = ".shin-integridad.json";
// Lo que el bot MODIFICA a propósito (patch-baileys.cjs). Sellarlo aquí
// daría un falso positivo en cada `npm install`.
const EXENTOS = [/^baileys\/(lib|esm)\//];
const IGNORAR_DIRS = new Set([".cache", ".bin", "test", "tests", "__tests__", "docs"]);

/**
 * Recorre node_modules y devuelve un mapa ruta-relativa → sha256.
 * @param {string} raiz
 * @returns {Map<string,string>}
 */
export function huellaArbol(raiz = "node_modules") {
  const out = new Map();
  if (!fs.existsSync(raiz)) return out;

  const visitar = (dir) => {
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORAR_DIRS.has(e.name)) continue;
        visitar(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (!EXTENSIONES.has(path.extname(e.name).toLowerCase())) continue;
      const rel = path.relative(raiz, full).split(path.sep).join("/");
      if (rel === NOMBRE_SELLO) continue;
      if (EXENTOS.some((re) => re.test(rel))) continue;
      try {
        const h = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
        out.set(rel, h);
      } catch { /* archivo que desapareció a mitad: se ignora */ }
    }
  };
  visitar(raiz);
  return out;
}

/** sha256 de un archivo suelto, o null si no existe. */
function hashDe(archivo) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(archivo)).digest("hex"); }
  catch { return null; }
}

/** Huella completa: árbol + los dos archivos de dependencias. */
export function huellaCompleta(raiz = process.cwd()) {
  const arbol = huellaArbol(path.join(raiz, "node_modules"));
  return {
    marca: MARCA,
    selloEn: new Date().toISOString(),
    node: process.versions.node,
    paquetes: arbol.size,
    packageJson: hashDe(path.join(raiz, "package.json")),
    packageLock: hashDe(path.join(raiz, "package-lock.json")),
    archivos: Object.fromEntries(arbol),
  };
}

/**
 * Compara la huella guardada con el árbol actual.
 * @returns {{estado:"sin-sello"|"igual"|"cambio", nuevos:string[], faltan:string[],
 *            cambiados:string[], cabeceras:string[], selloEn?:string}}
 */
export function compararConSello({ raiz = process.cwd(), archivo = path.join(raiz, ARCHIVO) } = {}) {
  if (!fs.existsSync(archivo)) {
    return { estado: "sin-sello", nuevos: [], faltan: [], cambiados: [], cabeceras: [] };
  }
  let sello;
  try { sello = JSON.parse(fs.readFileSync(archivo, "utf8")); }
  catch (e) { return { estado: "sin-sello", nuevos: [], faltan: [], cambiados: [], cabeceras: ["sello ilegible: " + e.message] }; }
  if (sello.marca !== MARCA) {
    return { estado: "sin-sello", nuevos: [], faltan: [], cambiados: [], cabeceras: ["sello de otra versión"] };
  }

  const actual = huellaArbol(path.join(raiz, "node_modules"));
  const antes = sello.archivos || {};
  const nuevos = [];
  const faltan = [];
  const cambiados = [];
  const cabeceras = [];

  for (const [rel, h] of actual) {
    if (!(rel in antes)) nuevos.push(rel);
    else if (antes[rel] !== h) cambiados.push(rel);
  }
  for (const rel of Object.keys(antes)) if (!actual.has(rel)) faltan.push(rel);

  // Los archivos que definen QUÉ se instala también cuentan.
  for (const [nombre, clave] of [["package.json", "packageJson"], ["package-lock.json", "packageLock"]]) {
    const h = hashDe(path.join(raiz, nombre));
    if (sello[clave] && h !== sello[clave]) cabeceras.push(nombre + " cambió desde el sello");
  }

  const estado = nuevos.length || faltan.length || cambiados.length || cabeceras.length ? "cambio" : "igual";
  return { estado, nuevos, faltan, cambiados, cabeceras, selloEn: sello.selloEn, paquetes: sello.paquetes };
}

/** Sella el árbol actual. Devuelve la huella escrita. */
export function sellar({ raiz = process.cwd(), archivo = path.join(raiz, ARCHIVO) } = {}) {
  const h = huellaCompleta(raiz);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(h, null, 1) + "\n", { mode: 0o600 });
  return h;
}

/**
 * Comprueba, en texto listo para la consola, y decide si hay que detener
 * el arranque. En modo `estricto` un cambio aborta; en el resto, avisa.
 * @returns {{ok:boolean, estado:string, mensaje:string, detalle:object}}
 */
export function revisarAlArrancar({ raiz = process.cwd(), modo = process.env.SHIN_INTEGRIDAD || "avisar" } = {}) {
  const r = compararConSello({ raiz });
  const lineas = [];

  if (r.estado === "sin-sello") {
    lineas.push("sin sello de integridad: nadie vigila el árbol de dependencias.");
    lineas.push("hazlo una vez (después de instalar y verificar):  node index.js --sellar");
    return { ok: true, estado: r.estado, mensaje: lineas.join("\n"), detalle: r };
  }

  if (r.estado === "igual") {
    return { ok: true, estado: r.estado, mensaje: "integridad: " + r.paquetes + " archivos coinciden con el sello (" + (r.selloEn || "?") + ").", detalle: r };
  }

  const total = r.nuevos.length + r.cambiados.length + r.faltan.length;
  lineas.push("¡el árbol de dependencias CAMBIÓ desde el sello! (" + total + " archivos)");
  for (const f of r.cambiados.slice(0, 8)) lineas.push("  · modificado: " + f);
  for (const f of r.nuevos.slice(0, 8)) lineas.push("  · nuevo:      " + f);
  for (const f of r.faltan.slice(0, 8)) lineas.push("  · desapareció: " + f);
  for (const c of r.cabeceras) lineas.push("  · " + c);
  if (total > 24) lineas.push("  … y " + (total - 24) + " más");

  // Lo más importante: qué se puede hacer con un cambio así.
  const critico = [...r.cambiados, ...r.nuevos].some((f) => /^baileys\/|protobufjs|axios|^ws\/|node-fetch|^sharp\//.test(f));
  if (critico) {
    lineas.push("");
    lineas.push("  Un cambio en baileys/protobufjs/axios/ws/node-fetch/sharp es el patrón de una");
    lineas.push("  dependencia comprometida: esas librerías ven los mensajes y las credenciales.");
    lineas.push("  Si no fuiste tú:  npm ci  →  node index.js --sellar");
  }
  lineas.push("");
  lineas.push("  Si el cambio fue tuyo y ya lo revisaste:  node index.js --sellar");

  const ok = modo !== "estricto";
  return { ok, estado: r.estado, mensaje: lineas.join("\n"), detalle: r };
}

export default { huellaArbol, huellaCompleta, compararConSello, sellar, revisarAlArrancar };
