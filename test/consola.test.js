/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// La consola se prueba en dos frentes:
//   · la composición de la pantalla, que es una función pura;
//   · el arranque de verdad, con una terminal de verdad (pty) y sin ella.
// Lo segundo es lo que demuestra que en un VPS no se cuelga dibujando.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const CONSOLA = path.join(RAIZ, "scripts", "consola.mjs");

const sinColor = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");
const visible = (s) => [...sinColor(s)].length;

const SALUD = { groups: 12, uptimeSec: 8123, queue: 3, risk: { score: 23 }, memoryMB: 151 };
const EQUIPO = {
  disco: { libre: 19.9 * 1073741824, pct: 19 },
  bateria: { pct: 39, temp: 34.3, estado: "Discharging" },
  memoria: { usadoMB: 2206, totalMB: 3810 },
};

const { componerPantalla, limpiarSalida, ajustar, recortar } = await import(CONSOLA);

test("la caja del panel mide lo mismo en todas sus líneas, a cualquier ancho", () => {
  for (const ancho of [40, 46, 64, 80, 100]) {
    const { lineas } = componerPantalla({
      estado: "activo",
      reinicios: 1,
      pid: 4242,
      salud: SALUD,
      equipo: EQUIPO,
      url: "http://127.0.0.1:3000",
      version: "3.3.1",
      registro: ["una línea de registro", "otra línea"],
      ancho,
      alto: 20,
    });
    const deCaja = lineas.filter((l) => /^[│╭╰]/.test(sinColor(l)));
    assert.ok(deCaja.length >= 4, `ancho ${ancho}: faltan líneas de caja`);
    const anchos = new Set(deCaja.map((l) => visible(l)));
    assert.equal(anchos.size, 1, `ancho ${ancho} descuadrado: ${[...anchos].join(", ")}`);
    assert.equal([...anchos][0], ancho, `ancho ${ancho}: la caja no ocupa el ancho`);
  }
});

test("el panel nunca se pasa del ancho de la pantalla", () => {
  const { lineas } = componerPantalla({
    estado: "activo",
    salud: SALUD,
    equipo: EQUIPO,
    url: "http://192.168.20.137:3000",
    version: "3.3.1",
    registro: ["x".repeat(300)],
    ancho: 42,
    alto: 18,
  });
  for (const l of lineas) {
    assert.ok(visible(l) <= 42, `línea de ${visible(l)} en pantalla de 42: ${sinColor(l)}`);
  }
});

test("cada estado dice lo suyo: reiniciando, espera un momento", () => {
  const texto = (estado) =>
    componerPantalla({ estado, reinicios: 2, pid: 4242, salud: null, url: "", ancho: 64, alto: 12 })
      .lineas.map(sinColor)
      .join("\n");

  assert.match(texto("activo"), /ACTIVO/);
  assert.match(texto("reiniciando"), /REINICIANDO/);
  assert.match(texto("reiniciando"), /espera un momento/);
  assert.match(texto("esperando"), /SE CAYÓ/);
  assert.match(texto("rendido"), /RENDIDO/);
  assert.match(texto("rendido"), /5 caídas/);
  // Mientras se reinicia no se enseñan los datos del proceso que ya no existe.
  assert.doesNotMatch(texto("reiniciando"), /grupos/);
});

test("la dirección del panel web siempre está a la vista", () => {
  const { lineas } = componerPantalla({
    estado: "activo",
    url: "http://127.0.0.1:3000",
    ancho: 72,
    alto: 14,
  });
  assert.match(lineas.map(sinColor).join("\n"), /web http:\/\/127\.0\.0\.1:3000/);
});

test("lo que el bot escupe no puede desarmar el dibujo", () => {
  // Borrar pantalla, mover el cursor, cambiar el título: todo fuera.
  const sucio = "\x1b[2J\x1b[H\x1b[10;5H\x1b]0;título\x07hola\x1b[?25l mundo\r";
  const limpio = limpiarSalida(sucio);
  assert.equal(limpio, "hola mundo");
  assert.doesNotMatch(limpio, /\x1b/);

  // …pero el color se queda, que para eso está.
  assert.equal(limpiarSalida("\x1b[31mrojo\x1b[0m"), "\x1b[31mrojo\x1b[0m");
});

test("partir una línea no rompe los colores", () => {
  const trozos = ajustar(`\x1b[32m${"a".repeat(30)}\x1b[0m`, 10);
  assert.ok(trozos.length >= 3);
  for (const t of trozos) {
    assert.ok(visible(t) <= 10, `trozo de ${visible(t)}: ${JSON.stringify(t)}`);
    // Cada trozo cierra su color; si no, la terminal se queda coloreada.
    assert.ok(t.endsWith("\x1b[0m"), "el trozo no cierra el color");
  }
  const corto = recortar(`\x1b[36mabcdefghij\x1b[0m`, 4);
  assert.equal(visible(corto), 4);
});

/** Monta un proyecto falso con el bot de mentira y la consola de verdad. */
function proyecto() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-consola-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const pieza of ["consola.mjs", "supervisor.mjs", "datos-equipo.mjs"]) {
    fs.copyFileSync(path.join(RAIZ, "scripts", pieza), path.join(dir, "scripts", pieza));
  }
  // La consola ya no es autosuficiente, y hace bien: lee los argumentos y
  // decide la vinculación con los mismos módulos que el bot. Se copian tal
  // cual, y `node_modules` se enlaza en vez de copiarse (chalk tarda).
  for (const [carpeta, pieza] of [
    ["lib", "cli-args.js"],
    ["lib", "vinculacion.js"],
    ["services", "consola.js"],
  ]) {
    fs.mkdirSync(path.join(dir, "src", carpeta), { recursive: true });
    fs.copyFileSync(path.join(RAIZ, "src", carpeta, pieza), path.join(dir, "src", carpeta, pieza));
  }
  fs.symlinkSync(path.join(RAIZ, "node_modules"), path.join(dir, "node_modules"), "dir");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ version: "9.9.9", type: "module" }));
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `console.log("BOT ARRANCADO " + process.pid);
     const ya = process.env.YA_REINICIO === "1";
     if (!ya) setTimeout(() => process.send && process.send("restart"), 900);
     setInterval(() => {}, 1000);
    `,
  );
  return dir;
}

test("sin terminal (VPS, journalctl) no dibuja nada raro y sigue vigilando", async () => {
  const dir = proyecto();
  const hijo = spawn(process.execPath, [path.join(dir, "scripts", "consola.mjs")], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
    // Con número: esta prueba es del panel. Que sin número el bot NO
    // arranque se comprueba en vinculacion.test.js.
    env: { ...process.env, YA_REINICIO: "1", PAIRING_NUMBER: "5215512345678" },
  });
  let salida = "";
  hijo.stdout.on("data", (d) => (salida += d));
  hijo.stderr.on("data", (d) => (salida += d));

  await new Promise((r) => setTimeout(r, 2500));
  hijo.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));

  // Nada de códigos de pantalla: eso solo se manda a una terminal de verdad.
  assert.doesNotMatch(salida, /\x1b\[\?1049/, "no debe entrar al búfer alternativo sin terminal");
  assert.doesNotMatch(salida, /\x1b\[\?25/, "no debe esconder el cursor sin terminal");
  assert.match(salida, /sin terminal/);
  assert.match(salida, /panel web: http/);
  assert.match(salida, /BOT ARRANCADO \d+/, "el bot tiene que arrancar y contarlo");
});

test("con terminal de verdad: panel fijo, registro debajo y sale limpio", (t) => {
  const tieneScript = spawnSync("sh", ["-c", "command -v script"], { encoding: "utf8" });
  if (tieneScript.status !== 0) return t.skip("hace falta `script` para una pty");

  const dir = proyecto();
  const r = spawnSync(
    "script",
    // `timeout -s TERM` cierra la consola como lo haría un Ctrl+C, para
    // poder comprobar que deja la terminal como la encontró.
    ["-qec", "stty rows 20 cols 60; timeout -s TERM 5 env YA_REINICIO=1 PAIRING_NUMBER=5215512345678 node scripts/consola.mjs", "/dev/null"],
    { cwd: dir, encoding: "utf8", timeout: 20000 },
  );
  const salida = `${r.stdout || ""}${r.stderr || ""}`;

  assert.match(salida, /\x1b\[\?1049h/, "tiene que usar el búfer alternativo");
  assert.match(salida, /\x1b\[\?25l/, "tiene que esconder el cursor");
  // El panel se dibuja varias veces: es lo que lo mantiene clavado arriba.
  const marcos = salida.split("\x1b[?2026h").length - 1;
  assert.ok(marcos >= 2, `solo ${marcos} repintados`);
  // Y al salir devuelve la terminal como estaba.
  assert.match(salida, /\x1b\[\?25h/, "tiene que devolver el cursor");
  assert.match(salida, /\x1b\[\?1049l/, "tiene que salir del búfer alternativo");

  // El contenido del panel, ya sin colores.
  const ultimo = salida.split("\x1b[?2026h").pop();
  const limpio = sinColor(ultimo).replace(/\r/g, "");
  assert.match(limpio, /SHIN-MD 9\.9\.9/);
  assert.match(limpio, /web http/);
});

test("el dibujo que no cabe se avisa en vez de romper el panel", () => {
  // Ya no hay QR (la vinculación es por código), pero el bot puede imprimir
  // arte ancho: en 60 columnas no entra y partido no se entiende.
  const arte = "█ ▄▄▄▄▄ █▄█▄ ▀█▄▀▄▄█▀▀█▀██▀██ █▄█ ▄██▀▀█    █ ▄▀▄▀▀▄  █▄█ ▄█▀▄▀▀▄";
  const { lineas } = componerPantalla({
    estado: "activo",
    registro: ["antes del dibujo", arte, arte, "después del dibujo"],
    ancho: 60,
    alto: 12,
  });
  const texto = lineas.map(sinColor).join("\n");

  assert.match(texto, /no cabe en el panel/, "tiene que avisar");
  assert.match(texto, /vigia/, "y decir dónde verlo entero");
  assert.equal(texto.split("no cabe en el panel").length - 1, 1, "el aviso se da una vez, no por línea");
  // Ni un trozo del dibujo a medias.
  assert.doesNotMatch(texto, /▄▄▄▄▄ █▄█▄/, "no debe quedar el dibujo partido");
  assert.match(texto, /antes del dibujo/);
  assert.match(texto, /después del dibujo/);
});
