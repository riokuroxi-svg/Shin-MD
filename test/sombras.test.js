/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  sombras.test.js — Ninguna variable se llama igual que algo importado.
//
//  `const botJid = botJid(sock)` parece inocente, pero la variable nueva
//  tapa a la función importada y JavaScript lanza "Cannot access 'botJid'
//  before initialization". Así estuvo roto el AFK (afktime) sin que nada
//  avisara: el error salía en cada mensaje y el hook no hacía nada.
//  Este barrido lo caza en todo el código antes de que llegue al bot.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function archivosJs(dir) {
  const salida = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivosJs(ruta));
    else if (/\.(m?js|cjs)$/.test(e.name)) salida.push(ruta);
  }
  return salida;
}

/** Nombres que un archivo importa (por defecto y con llaves, con "as"). */
function nombresImportados(codigo) {
  const nombres = new Set();
  const re = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*["'][^"']+["']/g;
  let m;
  while ((m = re.exec(codigo)) !== null) {
    if (m[1]) nombres.add(m[1]);
    if (m[2]) {
      for (const parte of m[2].split(",")) {
        const limpio = parte.trim();
        if (limpio) nombres.add(limpio.split(/\s+as\s+/).pop().trim());
      }
    }
  }
  return nombres;
}

test("ninguna variable tapa a una función o valor importado", () => {
  const problemas = [];
  for (const carpeta of ["cmds", "src", "boot"]) {
    for (const archivo of archivosJs(path.join(RAIZ, carpeta))) {
      const codigo = fs.readFileSync(archivo, "utf8");
      for (const nombre of nombresImportados(codigo)) {
        const re = new RegExp(`\\b(?:const|let|var)\\s+${nombre.replace(/\$/g, "\\$")}\\s*=`, "g");
        let m;
        while ((m = re.exec(codigo)) !== null) {
          const linea = codigo.slice(0, m.index).split("\n").length;
          problemas.push(`${path.relative(RAIZ, archivo)}:${linea} → ${nombre}`);
        }
      }
    }
  }
  assert.deepEqual(problemas, [], "variables con el nombre de algo importado:\n" + problemas.join("\n"));
});
