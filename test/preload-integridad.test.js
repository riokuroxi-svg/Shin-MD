/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  preload-integridad.test.js — CAPA 4: comprobar ANTES de ejecutar
//
//  Esta es la prueba que de verdad importa, porque es la única que puede
//  demostrar lo que el sello viejo no podía:
//
//    el código sospechoso NO se ejecuta cuando el modo es estricto.
//
//  Se hace con un `entry.js` que, si llega a correr, deja un archivo. Si
//  el archivo no está, el preload cortó antes: la comprobación llegó
//  antes que el código, no después.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sellar } from "#lib/integridad";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRELOAD = path.join(RAIZ, "scripts", "preload-integridad.mjs");

/** Proyecto falso con su node_modules, su sello y un entry que deja marca. */
function proyecto({ sellado = true, conModulos = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-preload-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "bot-prueba", version: "1.0.0" })
  );
  fs.writeFileSync(
    path.join(dir, "package-lock.json"),
    JSON.stringify({ lockfileVersion: 3, packages: {} })
  );
  if (conModulos) {
    fs.mkdirSync(path.join(dir, "node_modules", "baileys", "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", "baileys", "lib", "socket.js"),
      "module.exports = 1;\n"
    );
  }
  fs.writeFileSync(
    path.join(dir, "entry.js"),
    `import fs from "node:fs";
     fs.writeFileSync(${JSON.stringify(path.join(dir, "arranco.txt"))}, "sí");
     console.log("el bot arrancó");`
  );
  if (sellado && conModulos) sellar({ raiz: dir });
  return dir;
}

const MARCA = (dir) => fs.existsSync(path.join(dir, "arranco.txt"));

function arrancar(dir, modo, extraEnv = {}) {
  return spawnSync(process.execPath, ["--import", pathToFileURL(PRELOAD).href, "entry.js"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, SHIN_INTEGRIDAD: modo, NO_COLOR: "1", ...extraEnv },
  });
}

test("estricto: con el árbol cambiado, el bot NO llega a ejecutarse", () => {
  const dir = proyecto();
  // Un archivo de más en la librería que ve los mensajes.
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");

  const r = arrancar(dir, "estricto");
  assert.notEqual(r.status, 0, "debía salir con error");
  assert.equal(MARCA(dir), false, "el entry no puede haberse ejecutado");
  assert.match(r.stdout + r.stderr, /no se arranca|CAMBIÓ/i);
});

test("estricto: con el sello al día, arranca normal", () => {
  const dir = proyecto();
  const r = arrancar(dir, "estricto");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(MARCA(dir), true);
  assert.match(r.stdout + r.stderr, /seguridad/i);
});

test("avisar: con el árbol cambiado avisa y arranca igual", () => {
  const dir = proyecto();
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");
  const r = arrancar(dir, "avisar");
  assert.equal(r.status, 0, "en modo avisar no puede impedir el arranque");
  assert.equal(MARCA(dir), true);
  assert.match(r.stdout + r.stderr, /CAMBIÓ/i);
});

test("estricto: sin sello tampoco arranca (falla cerrado)", () => {
  const dir = proyecto({ sellado: false });
  const r = arrancar(dir, "estricto");
  assert.notEqual(r.status, 0);
  assert.equal(MARCA(dir), false);
});

test("off: no comprueba nada y arranca", () => {
  const dir = proyecto();
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");
  const r = arrancar(dir, "off");
  assert.equal(r.status, 0);
  assert.equal(MARCA(dir), true);
  assert.doesNotMatch(r.stdout + r.stderr, /CAMBIÓ/);
});

test("fuera del bot (sin node_modules) el preload no estorba", () => {
  const dir = proyecto({ conModulos: false });
  const r = arrancar(dir, "estricto");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(MARCA(dir), true);
});

test("estricto: una señal de gravedad alta en las dependencias también frena", () => {
  const dir = proyecto();
  fs.mkdirSync(path.join(dir, "node_modules", "malo"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "node_modules", "malo", "package.json"),
    JSON.stringify({ name: "malo", version: "1.0.0" })
  );
  fs.writeFileSync(
    path.join(dir, "node_modules", "malo", "index.js"),
    `const s = require("fs").readFileSync("./Sessions/Owner/auth.creds", "utf8");
     eval(Buffer.from("ZG9jdW1lbnQ=", "base64").toString());`
  );
  // El archivo es nuevo ⇒ la capa 1 lo ve y la capa 3 lo analiza.
  const r = arrancar(dir, "estricto");
  assert.notEqual(r.status, 0, "una señal alta debe impedir el arranque en estricto");
  assert.equal(MARCA(dir), false);
  assert.match(r.stdout + r.stderr, /eval-ofuscado|sesion-whatsapp/);
});

test("el arranque deja constancia en logs/seguridad-*.jsonl", () => {
  const dir = proyecto();
  arrancar(dir, "avisar");
  const logs = path.join(dir, "logs");
  const archivos = fs
    .readdirSync(logs)
    .filter((f) => /^seguridad-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
  assert.ok(archivos.length >= 1, "no se escribió el registro de seguridad");
  const lineas = fs.readFileSync(path.join(logs, archivos[0]), "utf8").trim().split("\n");
  const evento = JSON.parse(lineas[lineas.length - 1]);
  assert.equal(evento.tipo, "arranque");
  assert.equal(evento.modo, "avisar");
  assert.ok(evento.capas.integridad, "el evento tiene que llevar las capas");
});

test("el supervisor arranca el bot CON el preload delante", () => {
  // Sin esto, el preload sería un archivo bonito que nadie llama: la
  // comprobación volvería a llegar tarde y en silencio, que era el fallo
  // original. Se monta un proyecto falso cuyo preload solo deja una marca,
  // y se comprueba que el vigía lo mete delante del entry.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-supervisor-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const pieza of ["vigia.mjs", "supervisor.mjs"]) {
    fs.copyFileSync(path.join(RAIZ, "scripts", pieza), path.join(dir, "scripts", pieza));
  }
  fs.writeFileSync(
    path.join(dir, "scripts", "preload-integridad.mjs"),
    `import fs from "node:fs";
     fs.writeFileSync(${JSON.stringify(path.join(dir, "paso-preload.txt"))}, "sí");`
  );
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `console.log("hijo vivo"); setInterval(() => {}, 1000);`
  );

  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "vigia.mjs")], {
    cwd: dir,
    encoding: "utf8",
    timeout: 4000,
    env: { ...process.env, SHIN_INTEGRIDAD: "avisar" },
  });
  const salida = `${r.stdout || ""}${r.stderr || ""}`;
  assert.match(salida, /vigía activo/, salida);
  assert.equal(
    fs.existsSync(path.join(dir, "paso-preload.txt")),
    true,
    "el supervisor no puso el preload delante del bot"
  );
});

test("el modo puesto en el .env se respeta (el preload corre antes que dotenv)", () => {
  // Sin esto, `SHIN_INTEGRIDAD=estricto` en el .env no valdría nada: este
  // archivo se ejecuta antes de que el bot lea sus variables, así que el
  // usuario creería tener el modo estricto y tendría el de avisar.
  const dir = proyecto();
  fs.writeFileSync(path.join(dir, ".env"), "# configuración\nSHIN_INTEGRIDAD=estricto\n");
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");

  const r = spawnSync(process.execPath, ["--import", pathToFileURL(PRELOAD).href, "entry.js"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, SHIN_INTEGRIDAD: undefined, NO_COLOR: "1" },
  });
  assert.notEqual(r.status, 0, "el .env decía estricto y arrancó igual");
  assert.equal(MARCA(dir), false);
});

test("el .env no puede aflojar un modo puesto por el entorno", () => {
  const dir = proyecto();
  fs.writeFileSync(path.join(dir, ".env"), "SHIN_INTEGRIDAD=avisar\n");
  fs.writeFileSync(path.join(dir, "node_modules", "baileys", "lib", "socket.js"), "payload\n");
  const r = arrancar(dir, "estricto");
  assert.notEqual(r.status, 0, "el entorno manda sobre el archivo");
  assert.equal(MARCA(dir), false);
});
