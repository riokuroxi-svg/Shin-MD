/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * auditar-comandos.mjs — Pasa por los 217 comandos y busca lo que
 * revienta en marcha pero no se ve al leer el código.
 *
 * Lo que mira:
 *   1. que el fichero cargue (import roto, sintaxis, dependencia que falta)
 *   2. que exporte lo que el cargador espera (nombre y run/handler)
 *   3. nombres y alias repetidos (el segundo nunca se ejecuta)
 *   4. mensajes en inglés
 *   5. texto dibujado dentro de un SVG sin respaldo legible
 *      (sin fuentes en el sistema, la tarjeta sale en blanco)
 *   6. promesas sin await en los envíos
 *
 *   node scripts/auditar-comandos.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const recoger = (dir, acc = []) => {
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) recoger(p, acc);
    else if (f.endsWith(".js")) acc.push(p);
  }
  return acc;
};

// Estos dos no son comandos y no deben salir en el informe:
//   events.js         — engancha bienvenidas y despedidas
//   gachareserved.js  — tarea de fondo que limpia las tiradas
const NO_SON_COMANDOS = new Set(["cmds/events.js", "cmds/gachareserved.js"]);

const ficheros = recoger("cmds").filter((f) => !NO_SON_COMANDOS.has(f));
const problemas = [];
const nombres = new Map();
let cargados = 0;

const INGLES = [
  "An unexpected error occurred",
  "Please try again",
  "contact support",
  "Something went wrong",
  "Invalid input",
  "not found.",
];

for (const f of ficheros) {
  const src = readFileSync(f, "utf8");
  const apunta = (tipo, detalle) => problemas.push({ f, tipo, detalle });

  // 1 · ¿carga?
  let mod = null;
  try {
    mod = await import(pathToFileURL(process.cwd() + "/" + f).href);
    cargados++;
  } catch (e) {
    apunta("no carga", e?.message?.split("\n")[0] || String(e));
    continue;
  }

  const d = mod.default;
  const esHook = !d && (mod.before || mod.after);
  if (!d && !esHook) { apunta("sin export default", "el cargador no lo verá"); continue; }
  if (esHook) continue;

  // 2 · ¿tiene lo que el cargador necesita?
  const claves = [].concat(d.command || d.name || []);
  if (!claves.length) apunta("sin nombre", "ni command ni name");
  if (typeof d.run !== "function" && typeof d.handler !== "function") {
    apunta("sin run/handler", "no se puede ejecutar");
  }

  // 3 · ¿nombre o alias pisado por otro?
  for (const c of [...claves, ...(d.aliases || [])]) {
    const clave = String(c).toLowerCase();
    if (nombres.has(clave)) apunta("nombre repetido", `"${clave}" ya lo usa ${nombres.get(clave)}`);
    else nombres.set(clave, f);
  }

  // 4 · inglés
  for (const frase of INGLES) {
    if (src.includes(frase)) { apunta("mensaje en inglés", frase); break; }
  }

  // 5 · texto dentro de un SVG sin respaldo
  //     sharp escribe con las fuentes del sistema; si no las hay, la
  //     imagen sale sin una sola letra (le pasó a .trivia)
  if (/<text[\s>]/.test(src) && /sharp\(/.test(src)) {
    const cuerpoTexto = /body:/.test(src) || /caption:/.test(src) || /fallbackText/.test(src);
    if (!cuerpoTexto) apunta("SVG sin respaldo", "si el teléfono no tiene fuentes, sale en blanco");
  }

  // 6 · envíos sin await (se pierden si el proceso sigue)
  for (const m of src.matchAll(/^[^\n/]*[^a-z.]((?:sock|conn)\.sendMessage|msg\.reply)\(/gm)) {
    const linea = src.slice(0, m.index).split("\n").length;
    const trozo = src.split("\n")[linea - 1] || "";
    if (!/await|return|=>|\.then|\.catch|=/.test(trozo)) {
      apunta("envío sin await", `línea ${linea}`);
      break;
    }
  }
}

console.log(`Comandos revisados: ${ficheros.length} · cargan: ${cargados}`);
console.log(`Nombres y alias únicos: ${nombres.size}`);

if (!problemas.length) {
  console.log("\n✓ Sin problemas.");
} else {
  const porTipo = {};
  for (const p of problemas) (porTipo[p.tipo] ||= []).push(p);
  console.log(`\n${problemas.length} problemas en ${new Set(problemas.map((p) => p.f)).size} ficheros:\n`);
  for (const [tipo, lista] of Object.entries(porTipo)) {
    console.log(`── ${tipo} (${lista.length})`);
    for (const p of lista.slice(0, 12)) console.log(`   ${p.f}  ·  ${p.detalle}`);
    if (lista.length > 12) console.log(`   … y ${lista.length - 12} más`);
  }
}
