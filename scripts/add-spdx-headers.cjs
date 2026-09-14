#!/usr/bin/env node
// add-spdx-headers.cjs — Pone el header legal (AGPL + copyright) en todos
// los .js del proyecto. IDEMPOTENTE: si el archivo ya tiene un
// SPDX-License-Identifier, se salta. Úsalo después de agregar archivos.
//
//   node scripts/add-spdx-headers.cjs          (todo el repo)
//   node scripts/add-spdx-headers.cjs --check  (solo verifica; exit 1 si falta)

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'Sessions', 'tmp', 'cache', 'dist', 'out']);
const HEADER =
  '/**\n' +
  ' * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD\n' +
  ' * Copyright (C) 2026 riokuroxi-svg\n' +
  ' * SPDX-License-Identifier: AGPL-3.0-only\n' +
  ' * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.\n' +
  ' */\n';

const checkOnly = process.argv.includes('--check');
let added = 0, skipped = 0, missing = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      handleFile(full);
    }
  }
}

function handleFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('SPDX-License-Identifier')) { skipped++; return; }
  if (checkOnly) {
    missing++;
    console.log('  FALTA header: ' + path.relative(ROOT, file));
    return;
  }
  // Shebang: el header va después de la primera línea #!
  let prefix = '', rest = content;
  if (rest.startsWith('#!')) {
    const nl = rest.indexOf('\n');
    if (nl !== -1) { prefix = rest.slice(0, nl + 1); rest = rest.slice(nl + 1); }
  }
  fs.writeFileSync(file, prefix + HEADER + rest, 'utf8');
  added++;
  console.log('  + ' + path.relative(ROOT, file));
}

console.log((checkOnly ? 'Verificando' : 'Añadiendo') + ' headers SPDX…');
walk(ROOT);
if (checkOnly) {
  console.log(missing === 0
    ? 'OK: todos los .js tienen SPDX-License-Identifier'
    : 'FALTAN ' + missing + ' headers. Ejecuta: node scripts/add-spdx-headers.cjs');
  process.exit(missing === 0 ? 0 : 1);
}
console.log('Listo: ' + added + ' actualizados, ' + skipped + ' ya tenían header.');
