/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * auditar-db.mjs — Columnas que el código escribe y la tabla no tiene.
 *
 * El bot construye el SQL pegando el nombre de la columna:
 *
 *   'UPDATE g_users SET ' + field + ' = ? WHERE id = ?'
 *
 * Así que un nombre mal escrito no lo caza nadie hasta que explota en
 * marcha — y como los hooks se tragan sus errores, explota en SILENCIO
 * en cada mensaje. Justo lo que pasaba con `minxp` y `maxxp`.
 *
 *   node scripts/auditar-db.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";

const recoger = (dir, acc = []) => {
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) recoger(p, acc);
    else if (f.endsWith(".js")) acc.push(p);
  }
  return acc;
};

// ── Esquema declarado ──────────────────────────────────────────────
const dbSrc = readFileSync("src/services/ginko-db.js", "utf8");
const tablas = {};
for (const m of dbSrc.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([^"]+)\)"/g)) {
  tablas[m[1]] = m[2]
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0])
    .filter((c) => c && !/^(PRIMARY|FOREIGN|UNIQUE)$/i.test(c));
}
// las columnas añadidas después, con ALTER suelto
for (const m of dbSrc.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) {
  (tablas[m[1]] ||= []).push(m[2]);
}
// y las del bloque EXTRAS, que es una tabla de JS, no SQL a pelo
const bloque = dbSrc.match(/const EXTRAS = \{([\s\S]*?)\n {2}\};/);
if (bloque) {
  let tablaActual = null;
  for (const linea of bloque[1].split("\n")) {
    const cabecera = linea.match(/^\s*(g_\w+):/);
    if (cabecera) { tablaActual = cabecera[1]; continue; }
    for (const c of linea.matchAll(/\["(\w+)",/g)) (tablas[tablaActual] ||= []).push(c[1]);
  }
}

// ── Columnas que el código toca ────────────────────────────────────
const ESCRITURAS = [
  [/setUser\(\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_users"],
  [/setChatUser\(\s*[^,]+,\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_chat_users"],
  [/setChat\(\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_chats"],
  [/setSettings\(\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_settings"],
  [/setCreate\(\s*['"`]users['"`],\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_users"],
  [/setCreate\(\s*['"`]chats['"`],\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_chats"],
  [/setCreate\(\s*['"`]settings['"`],\s*[^,]+,\s*['"`](\w+)['"`]/g, "g_settings"],
];

const fallos = [];
const vistas = new Map();

for (const fichero of [...recoger("cmds"), ...recoger("src")]) {
  if (fichero.endsWith("ginko-db.js")) continue;
  const src = readFileSync(fichero, "utf8");
  for (const [re, tabla] of ESCRITURAS) {
    for (const m of src.matchAll(re)) {
      const col = m[1];
      const clave = `${tabla}.${col}`;
      vistas.set(clave, (vistas.get(clave) || 0) + 1);
      if (!tablas[tabla]?.includes(col)) {
        fallos.push({ fichero, tabla, col, linea: src.slice(0, m.index).split("\n").length });
      }
    }
  }
}

// ── Y lo que dice el SQLite de verdad ──────────────────────────────
//  Leer el fuente está bien, pero lo que manda es la base. Se abre una
//  temporal, se deja que migre y se le pregunta a PRAGMA.
let reales = null;
try {
  const { createDatabase } = await import("../src/storage/database.js");
  const tmp = `/tmp/audit-${Date.now()}.db`;
  createDatabase(tmp);
  await import("../src/services/ginko-db.js");
  const { DatabaseSync } = await import("../src/storage/sqlite-compat.js");
  const d = new DatabaseSync(tmp);
  reales = {};
  for (const t of Object.keys(tablas)) {
    try { reales[t] = d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name); } catch { reales[t] = []; }
  }
  d.close?.();
} catch (e) {
  console.log("(no se pudo abrir una base de prueba: " + (e?.message || e) + ")");
}
if (reales) {
  for (const [t, cols] of Object.entries(reales)) if (cols.length) tablas[t] = cols;
  console.log("Esquema leído del SQLite de verdad, no del fuente.");
}

console.log(`Tablas: ${Object.keys(tablas).length} · columnas declaradas: ${Object.values(tablas).flat().length}`);
console.log(`Columnas distintas que toca el código: ${vistas.size}`);

if (!fallos.length) {
  console.log("\n✓ Ninguna escritura apunta a una columna inexistente.");
} else {
  console.log(`\n✗ ${fallos.length} escrituras a columnas que NO existen:\n`);
  for (const f of fallos) console.log(`  ${f.tabla}.${f.col}  ←  ${f.fichero}:${f.linea}`);
  console.log("\nCada una de estas revienta en marcha, y dentro de un hook lo hace en silencio.");
}

process.exitCode = fallos.length ? 1 : 0;
