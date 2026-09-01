// ═══════════════════════════════════════════════════════════════════
//  CRITICAL PATH TEST — Simula el arranque del bot
//  Detecta errores de importación, dependencias faltantes,
//  y problemas de configuración.
// ═══════════════════════════════════════════════════════════════════

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

console.log('\n═══════════════════════════════════════');
console.log('  SHIN-MD — CRITICAL PATH SIMULATION');
console.log('═══════════════════════════════════════\n');

// ── 1. VERIFICAR ESTRUCTURA DE DIRECTORIOS ──────────────────
console.log('📁 1. ESTRUCTURA DE DIRECTORIOS');

const requiredDirs = ['src', 'src/core', 'src/lib', 'src/system', 'cmds', 'assets'];
for (const dir of requiredDirs) {
  test(`Directorio ${dir} existe`, () => {
    assert(fs.existsSync(path.join(root, dir)), `${dir} no encontrado`);
  });
}

// ── 2. VERIFICAR ARCHIVOS CRÍTICOS ──────────────────────────
console.log('\n📄 2. ARCHIVOS CRÍTICOS');

const criticalFiles = [
  'index.js', 'server.js', 'settings.js', 'package.json',
  'src/main.js', 'src/core/connection.js', 'src/serialize.js',
  'src/lib/logger.js', 'src/lib/rate-limiter.js', 'src/lib/errors.js',
  'src/lib/sqliteAuth.js', 'src/system/database.js', 'src/system/cmdsLoader.js',
  'src/events.js',
];

for (const file of criticalFiles) {
  test(`Archivo ${file} existe`, () => {
    assert(fs.existsSync(path.join(root, file)), `${file} no encontrado`);
  });
}

// ── 3. VERIFICAR PACKAGE.JSON ───────────────────────────────
console.log('\n📦 3. PACKAGE.JSON');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package.json tiene "type": "module"', () => {
  assert(pkg.type === 'module', 'No es ESM');
});

test('package.json tiene main: index.js', () => {
  assert(pkg.main === 'index.js', 'main no apunta a index.js');
});

test('package.json tiene imports definidos', () => {
  assert(pkg.imports && Object.keys(pkg.imports).length > 0, 'Sin import maps');
});

// ── 4. VERIFICAR IMPORT MAPS CROSS-REFERENCE ────────────────
console.log('\n🔗 4. IMPORT MAPS VS USO EN CÓDIGO');

const importMaps = pkg.imports || {};
const importsUsed = {};

// Scrape all # imports from source files
function scrapeImports(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      scrapeImports(full);
    } else if (entry.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      const matches = content.matchAll(/from\s+['"](#[^'"]+)['"]/g);
      for (const m of matches) {
        importsUsed[m[1]] = (importsUsed[m[1]] || 0) + 1;
      }
    }
  }
}
scrapeImports(root);

// Check #db specifically
if (importsUsed['#db']) {
  test('⚠️  #db se usa en el código', () => {});
  
  const hasMapping = Object.keys(importMaps).some(k => {
    if (k === '#db') return true;
    if (k.endsWith('*') && '#db'.startsWith(k.slice(0, -1))) return true;
    return false;
  });
  
  test('#db tiene mapping en package.json', () => {
    assert(hasMapping, '#db NO está definido en import maps de package.json');
  });
} else {
  test('✅ #db no se usa en el código', () => {});
}

// Check all other imports
for (const [alias, count] of Object.entries(importsUsed)) {
  const hasMapping = Object.keys(importMaps).some(k => {
    if (k === alias) return true;
    if (k.endsWith('*') && alias.startsWith(k.slice(0, -1))) return true;
    return false;
  });
  
  test(`Import "${alias}" (usado ${count} vez/veces) tiene mapping`, () => {
    assert(hasMapping, `${alias} no tiene mapping en package.json`);
  });
}

// ── 5. VERIFICAR FUNCIONES EXPORTADAS POR database.js ───────
console.log('\n🗄️  5. DATABASE.JS — FUNCIONES EXPORTADAS');

const dbContent = fs.readFileSync(path.join(root, 'src/system/database.js'), 'utf8');
const dbExports = [...dbContent.matchAll(/\bexport\s+(async\s+)?function\s+(\w+)/g)].map(m => m[2]);

const requiredDBFunctions = ['initDB', 'getUser', 'setUser', 'getChat', 'setChat', 'getChatUser', 'setChatUser', 'getSettings', 'setSettings'];
for (const fn of requiredDBFunctions) {
  test(`database.js exporta ${fn}`, () => {
    assert(dbExports.includes(fn), `${fn} no exportado`);
  });
}

// ── 6. VERIFICAR QUE serialize.js USA db CORRECTAMENTE ──────
console.log('\n📨 6. SERIALIZE.JS — DEPENDENCIA DE DB');

const serContent = fs.readFileSync(path.join(root, 'src/serialize.js'), 'utf8');

test('serialize.js importa db desde import map correcto', () => {
  // It should import from '#db' or '#system/database'
  const hasCorrectImport = serContent.includes("from '#db'") || 
                           serContent.includes("from '#system/database'") ||
                           serContent.includes("from './system/database'");
  assert(hasCorrectImport, 'db importado desde ruta incorrecta');
});

// Check which db functions are used in serialize.js
const dbFunctionsInSer = [...serContent.matchAll(/\bdb\.(\w+)\s*\(/g)].map(m => m[1]);
console.log(`  db functions used: ${[...new Set(dbFunctionsInSer)].join(', ') || 'none'}`);

// ── 7. SIMULAR CARGA DE ARCHIVOS ───────────────────────────
console.log('\n🔄 7. SINTAXIS DE TODOS LOS ARCHIVOS JS');

const { spawnSync } = await import('child_process');

const allJSFiles = [];
function collectJS(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      collectJS(full);
    } else if (entry.name.endsWith('.js')) {
      allJSFiles.push(full);
    }
  }
}
collectJS(root);

for (const file of allJSFiles) {
  const rel = path.relative(root, file);
  const result = spawnSync('node', ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status === 0) {
    passed++;
  } else {
    console.log(`  ❌ ${rel}: ERROR DE SINTAXIS`);
    console.log(`     ${result.stderr.split('\n')[0]}`);
    failed++;
  }
}

// ── REPORTE FINAL ───────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(`  RESULTADOS: ${passed} pasaron, ${failed} fallaron`);
console.log('═══════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);