/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  actualizar-web.mjs — regenera docs/web/index.html
//
//  La página de presentación (docs/web/index.html) no lleva la lista de
//  comandos escrita a mano: se saca del propio bot con loadCommands() y se
//  incrusta en docs/web/plantilla.html. Así nunca queda desactualizada.
//
//  Uso:  npm run docs:web       (o: node scripts/actualizar-web.mjs)
// ═══════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommands } from "#commands";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
const PLANTILLA = path.join(RAIZ, "docs", "web", "plantilla.html");
const DESTINO = path.join(RAIZ, "docs", "web", "index.html");
const MARCADOR = "__DATOS__";
const RESUMEN = path.join(RAIZ, "test", "resumen-suite.json");
const PAQUETE = path.join(RAIZ, "package.json");

/**
 * Números que la página anuncia, tomados de la realidad del repositorio:
 * pruebas y archivos de la última corrida de la suite, versión mínima de
 * Node del package.json y total de comandos. Nada escrito a mano.
 */
function numerosReales(totalComandos) {
  let pruebas = 0;
  let total = 0;
  let archivos = 0;
  try {
    const r = JSON.parse(fs.readFileSync(RESUMEN, "utf8"));
    pruebas = Number(r.pasan) || 0;
    total = Number(r.total) || 0;
    archivos = Number(r.archivos) || 0;
  } catch {
    console.warn(
      "⚠  No hay test/resumen-suite.json: corre `npm test` para tener los números reales."
    );
  }
  if (!pruebas) {
    // Sin resumen, se cuentan los archivos para no dejar huecos en la página.
    archivos =
      archivos ||
      fs.readdirSync(path.join(RAIZ, "test")).filter((f) => f.endsWith(".test.js")).length;
  }
  const pkg = JSON.parse(fs.readFileSync(PAQUETE, "utf8"));
  const node = (pkg.engines?.node || "22").replace(/[^0-9.]/g, "").replace(/\.0$/, "");
  return {
    __PRUEBAS__: String(pruebas || "—"),
    __PRUEBAS_TOTAL__: String(total || pruebas || "—"),
    __ARCHIVOS__: String(archivos || "—"),
    __COMANDOS__: String(totalComandos),
    __NODE__: node,
  };
}

/** Deja solo lo que la página usa, en el mismo orden en que lo espera. */
function resumir(cmd) {
  return {
    n: cmd.name,
    a: (cmd.aliases || []).slice(0, 6),
    d: (cmd.description || "").trim(),
    cat: cmd.category || "utils",
  };
}

async function principal() {
  if (!fs.existsSync(PLANTILLA)) {
    console.error("✖ Falta docs/web/plantilla.html");
    process.exit(1);
  }

  const comandos = await loadCommands();
  const vistos = new Set();
  const catalogo = [];

  for (const cmd of comandos.values()) {
    // El Map trae una entrada por alias: el archivo los identifica.
    if (!cmd || vistos.has(cmd.file)) continue;
    vistos.add(cmd.file);
    catalogo.push(resumir(cmd));
  }

  catalogo.sort((a, b) => a.cat.localeCompare(b.cat) || a.n.localeCompare(b.n));

  const plantilla = fs.readFileSync(PLANTILLA, "utf8");
  if (!plantilla.includes(MARCADOR)) {
    console.error('✖ La plantilla perdió el marcador "' + MARCADOR + '"');
    process.exit(1);
  }

  // Los marcadores de números se sustituyen por la realidad del repo.
  let html = plantilla.replace(MARCADOR, JSON.stringify(catalogo));
  const numeros = numerosReales(catalogo.length);
  for (const [clave, valor] of Object.entries(numeros)) {
    html = html.split(clave).join(valor);
  }
  const sobrantes = html.match(/__[A-Z]+__/g);
  if (sobrantes) {
    console.error("✖ Quedaron marcadores sin rellenar: " + [...new Set(sobrantes)].join(", "));
    process.exit(1);
  }

  fs.writeFileSync(DESTINO, html);
  const kb = (fs.statSync(DESTINO).size / 1024).toFixed(1);
  console.log(
    "✓ docs/web/index.html regenerado · " +
      catalogo.length +
      " comandos · " +
      numeros.__PRUEBAS__ +
      " pruebas · " +
      kb +
      " KB"
  );
}

principal().catch((err) => {
  console.error("✖ No se pudo regenerar la página:", err.message || err);
  process.exit(1);
});
