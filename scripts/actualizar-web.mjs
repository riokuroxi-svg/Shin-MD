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
import { collectCategories } from "../src/lib/menu-shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
const PLANTILLA = path.join(RAIZ, "docs", "web", "plantilla.html");
const DESTINO = path.join(RAIZ, "docs", "web", "index.html");
const MARCADOR = "__DATOS__";
const RESUMEN = path.join(RAIZ, "test", "resumen-suite.json");
const PAQUETE = path.join(RAIZ, "package.json");

/**
 * Cuenta el catálogo tal como lo ve el bot: comandos distintos, nombres con
 * alias, categorías y carpetas de `cmds/`. Es la única fuente de estas cifras:
 * la página, el README y `docs/assets/datos.json` se escriben con lo que salga
 * de aquí.
 *
 * Las categorías se cuentan con `collectCategories()`, que es la misma función
 * que usan `.menu` y `.menucat`: así el número que anuncia la página es el que
 * imprime el bot, no una cuenta paralela.
 */
function contarCatalogo(comandos, catalogo) {
  const dirCmds = path.join(RAIZ, "cmds");
  return {
    unicos: catalogo.length,
    nombres: comandos.size,
    alias: comandos.size - catalogo.length,
    categorias: collectCategories(comandos).cats.size,
    carpetas: fs.readdirSync(dirCmds, { withFileTypes: true }).filter((d) => d.isDirectory())
      .length,
  };
}

/**
 * Números que la página anuncia, tomados de la realidad del repositorio:
 * pruebas y archivos de la última corrida de la suite, versión mínima de
 * Node del package.json y el catálogo contado por `contarCatalogo()`.
 * Nada escrito a mano.
 *
 * @param {{unicos:number, nombres:number, alias:number, categorias:number, carpetas:number}} catalogo
 */
function numerosReales(catalogo) {
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
  // El número de archivos de prueba se cuenta en el disco, no se copia del
  // resumen: al añadir una prueba nueva y no volver a pasar la suite entera, el
  // resumen se queda con el número viejo y la página anunciaba 49 archivos
  // cuando ya había 51. Los que existen son un hecho comprobable; las pruebas
  // que pasan, solo lo sabe la última corrida.
  const enDisco = fs
    .readdirSync(path.join(RAIZ, "test"))
    .filter((f) => f.endsWith(".test.js")).length;
  if (!archivos || enDisco !== archivos) archivos = enDisco;
  const pkg = JSON.parse(fs.readFileSync(PAQUETE, "utf8"));
  const node = (pkg.engines?.node || "22").replace(/[^0-9.]/g, "").replace(/\.0$/, "");
  // `docs/assets/datos.json` alimenta los gráficos del README y lo comprueba
  // `test/docs-web.test.js`. Nada lo actualizaba: había que acordarse a mano,
  // y cuando se olvidaba la página decía 397 y el README 378. Se escribe aquí
  // porque este es el único sitio que ya sabe los números de la última corrida
  // y el catálogo que acaba de cargar.
  {
    const rutaDatos = path.join(RAIZ, "docs", "assets", "datos.json");
    try {
      const datos = JSON.parse(fs.readFileSync(rutaDatos, "utf8"));
      const claves = [
        "pruebas",
        "pruebasTotal",
        "archivos",
        "comandos",
        "nombres",
        "alias",
        "categorias",
      ];
      const antes = JSON.stringify(claves.map((k) => datos[k]));
      if (pruebas) {
        datos.pruebas = pruebas;
        datos.pruebasTotal = total || pruebas;
      }
      datos.archivos = archivos;
      datos.comandos = catalogo.unicos;
      datos.nombres = catalogo.nombres;
      datos.alias = catalogo.alias;
      datos.categorias = catalogo.categorias;
      if (JSON.stringify(claves.map((k) => datos[k])) !== antes) {
        fs.writeFileSync(rutaDatos, `${JSON.stringify(datos, null, 2)}\n`);
        console.log(
          `  ✓ docs/assets/datos.json al día · ${datos.pruebas}/${datos.pruebasTotal} · ${archivos} archivos · ${catalogo.unicos} comandos`
        );
      }
    } catch (err) {
      console.warn(`  ⚠  no pude actualizar docs/assets/datos.json: ${err.message}`);
    }
  }
  return {
    __PRUEBAS__: String(pruebas || "—"),
    __PRUEBAS_TOTAL__: String(total || pruebas || "—"),
    __ARCHIVOS__: String(archivos || "—"),
    __COMANDOS__: String(catalogo.unicos),
    __NOMBRES__: String(catalogo.nombres),
    __ALIAS__: String(catalogo.alias),
    __CATEGORIAS__: String(catalogo.categorias),
    __CARPETAS__: String(catalogo.carpetas),
    __NODE__: node,
  };
}

/**
 * Las cifras de comandos que la documentación escribe en prosa se reescriben
 * con el catálogo recién contado.
 *
 * Por qué: cada sitio llevaba su propia cuenta y ninguna coincidía con el
 * cargador — el README decía 213, la cabecera de `scripts/auditar-comandos.mjs`
 * 217 y la plantilla de la página 211 comandos «en 18 carpetas». Con esto,
 * `npm run docs:web` deja las tres con el mismo número y ninguna se escribe a
 * mano.
 *
 * `docs/PROCEDENCIA.md` no entra aquí a propósito: es un acta fechada
 * (2026-09-29) con su propio desglose por linaje, y reescribirle el total sin
 * rehacer el desglose la dejaría contradiciéndose.
 */
const CIFRAS_EN_PROSA = [
  [
    "README.md",
    [
      [/\bLos \d+ comandos\b/g, (n) => `Los ${n.unicos} comandos`],
      [
        /\b\d+ comandos y \d+ pruebas\b/g,
        (n, numeros) => `${n.unicos} comandos y ${numeros.__PRUEBAS__} pruebas`,
      ],
      [/alt="\d+ comandos"/g, (n) => `alt="${n.unicos} comandos"`],
      [
        /\b\d+ comandos en \d+ categorías, \d+ nombres con \d+ alias\b/g,
        (n) =>
          `${n.unicos} comandos en ${n.categorias} categorías, ${n.nombres} nombres con ${n.alias} alias`,
      ],
      [
        /\b\d+ comandos únicos · \d+ nombres en total \(\d+ alias\) · \d+ categorías\b/g,
        (n) =>
          `${n.unicos} comandos únicos · ${n.nombres} nombres en total (${n.alias} alias) · ${n.categorias} categorías`,
      ],
      [
        /\bLas \d+ categorías con sus comandos\b/g,
        (n) => `Las ${n.categorias} categorías con sus comandos`,
      ],
      [/\b\d+ categorías\b/g, (n) => `${n.categorias} categorías`],
      [
        /\b\d+\/\d+ pruebas\b/g,
        (n, numeros) => `${numeros.__PRUEBAS__}/${numeros.__PRUEBAS_TOTAL__} pruebas`,
      ],
      [
        /\bpruebas en \d+ archivos\b/g,
        (n, numeros) => `pruebas en ${numeros.__ARCHIVOS__} archivos`,
      ],
      [/\blas \d+ pruebas\b/g, (n, numeros) => `las ${numeros.__PRUEBAS__} pruebas`],
    ],
  ],
  [
    "scripts/auditar-comandos.mjs",
    [[/\bPasa por los \d+ comandos\b/g, (n) => `Pasa por los ${n.unicos} comandos`]],
  ],
];

function sincronizarCifras(catalogo, numeros) {
  for (const [rel, reglas] of CIFRAS_EN_PROSA) {
    const ruta = path.join(RAIZ, rel);
    if (!fs.existsSync(ruta)) continue;
    const antes = fs.readFileSync(ruta, "utf8");
    let despues = antes;
    for (const [re, reemplazo] of reglas) {
      despues = despues.replace(re, (...args) => reemplazo(catalogo, numeros, ...args));
    }
    if (despues !== antes) {
      fs.writeFileSync(ruta, despues);
      console.log(`  ✓ ${rel} al día · ${catalogo.unicos} comandos`);
    }
  }
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
  const contado = contarCatalogo(comandos, catalogo);
  const numeros = numerosReales(contado);
  sincronizarCifras(contado, numeros);
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
