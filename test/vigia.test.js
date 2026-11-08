/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// La vigilancia se prueba de verdad: se levanta el script y se mira que el
// hijo vuelva a nacer. No se simula la lógica, se ejecuta el proceso.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const VIGIA = path.join(RAIZ, "scripts", "vigia.mjs");

/** Monta un proyecto falso con su index.js y el vigía de verdad. */
function proyecto(modo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-vigia-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  for (const pieza of ["vigia.mjs", "supervisor.mjs"]) {
    fs.copyFileSync(path.join(RAIZ, "scripts", pieza), path.join(dir, "scripts", pieza));
  }
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `console.log("hijo vivo " + process.pid);
     const modo = ${JSON.stringify(modo)};
     if (modo === "reinicio") {
       setTimeout(() => process.send("restart"), 200);
     } else if (modo === "cae") {
       setTimeout(() => process.exit(3), 200);
     } else if (modo === "falla-al-arrancar") {
       process.exit(9);
     } else {
       setInterval(() => {}, 1000);
     }
    `,
  );
  return dir;
}

/** Lanza el vigía y devuelve la salida cuando termina el tiempo. */
function observar(dir, segundos) {
  const r = spawnSync("node", [path.join(dir, "scripts", "vigia.mjs")], {
    cwd: dir,
    timeout: segundos * 1000,
    encoding: "utf8",
  });
  return `${r.stdout || ""}${r.stderr || ""}`;
}

test("el vigía levanta otra vez al bot cuando pide reiniciar", () => {
  const dir = proyecto("reinicio");
  const salida = observar(dir, 4);
  assert.match(salida, /vigía activo/);
  assert.match(salida, /el bot pidió reiniciar/);
  assert.match(salida, /levantando otra vez/);
  // Al menos dos hijos distintos: el reinicio ocurrió de verdad.
  const pids = [...salida.matchAll(/hijo vivo (\d+)/g)].map((m) => m[1]);
  assert.ok(pids.length >= 2, `debería haber arrancado dos veces:\n${salida}`);
  assert.notEqual(pids[0], pids[1], "tiene que ser un proceso nuevo, no el mismo");
});

test("el vigía levanta al bot cuando se cae sin pedirlo", () => {
  const dir = proyecto("cae");
  const salida = observar(dir, 5);
  assert.match(salida, /se cayó con código 3/);
  assert.match(salida, /vuelvo a levantarlo en/);
  const pids = [...salida.matchAll(/hijo vivo (\d+)/g)].map((m) => m[1]);
  assert.ok(pids.length >= 2, `debería haberlo levantado:\n${salida}`);
});

test("el vigía se rinde si el bot no arranca ni una vez", () => {
  const dir = proyecto("falla-al-arrancar");
  const salida = observar(dir, 20);
  assert.match(salida, /se cayó 5 veces en 120s/);
  assert.match(salida, /Eso no se arregla reiniciando/);
  assert.match(salida, /Dejo de intentarlo/);
});

test("el vigía no deja procesos huérfanos al pararlo", async () => {
  const dir = proyecto("aguanta");
  const vigia = spawn("node", [path.join(dir, "scripts", "vigia.mjs")], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let salida = "";
  vigia.stdout.on("data", (d) => (salida += d));
  vigia.stderr.on("data", (d) => (salida += d));

  await new Promise((r) => setTimeout(r, 700));
  const pidHijo = Number((salida.match(/hijo vivo (\d+)/) || [])[1]);
  assert.ok(pidHijo, `no arrancó el hijo:\n${salida}`);

  vigia.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1200));

  // El hijo tiene que haberse ido con el padre.
  let sigueVivo = true;
  try {
    process.kill(pidHijo, 0);
  } catch {
    sigueVivo = false;
  }
  assert.equal(sigueVivo, false, `el hijo ${pidHijo} quedó huérfano`);
  assert.match(salida, /parando/);
});

test("npm run vigia existe y apunta al script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.equal(pkg.scripts.vigia, "node scripts/vigia.mjs");
});

test("el panel dibuja cajas alineadas con los datos del bot", async () => {
  const http = await import("node:http");
  const servidor = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify({
        ok: true, state: "RUNNING", uptimeSec: 3725,
        risk: { score: 23 }, queue: 4, groups: 11, memoryMB: 148,
      }));
    } else {
      res.end(JSON.stringify({
        ok: true, shin_version: "9.9.9",
        process: { pid: 4242, node: "v22.14.0", platform: "android" },
        memory: { rssMB: 148.3, heapUsedMB: 61.2, heapTotalMB: 90 },
        engine: { state: "RUNNING" },
      }));
    }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = servidor.address().port;

  // Asíncrono a propósito: spawnSync congelaría el bucle de eventos y el
  // servidor de mentira nunca llegaría a contestar.
  const salida = await new Promise((listo) => {
    const hijo = spawn(process.execPath, [path.join(RAIZ, "scripts", "panel.mjs")], {
      env: { ...process.env, SHIN_PANEL_URL: `http://127.0.0.1:${puerto}` },
    });
    let texto = "";
    hijo.stdout.on("data", (d) => (texto += d));
    hijo.stderr.on("data", (d) => (texto += d));
    hijo.on("close", (code) => listo({ status: code, texto }));
  });
  servidor.close();

  assert.equal(salida.status, 0, salida.texto);
  const limpio = salida.texto.replace(/\x1b\[[0-9;]*m/g, "");
  assert.match(limpio, /SHIN-MD/);
  assert.match(limpio, /ACTIVO/);
  assert.match(limpio, /RUNNING/);
  assert.match(limpio, /1h 2m/, "la duración se lee en horas y minutos");
  assert.match(limpio, /11/, "los grupos salen del /health");
  assert.match(limpio, /9\.9\.9/, "la versión sale del /metrics");

  // Todas las líneas de caja miden lo mismo: si no, se ve escalonado.
  const cajas = limpio.split("\n").filter((l) => /^[│╭╰]/.test(l));
  const anchos = new Set(cajas.map((l) => [...l].length));
  assert.equal(anchos.size, 1, `las cajas no están alineadas: ${[...anchos].join(", ")}`);
});

test("el panel, si el bot no responde, lo dice y no revienta", () => {
  const r = spawnSync(process.execPath, [path.join(RAIZ, "scripts", "panel.mjs")], {
    encoding: "utf8",
    env: { ...process.env, SHIN_PANEL_URL: "http://127.0.0.1:1" },
  });
  assert.equal(r.status, 0, "sale limpio, no con error");
  const limpio = r.stdout.replace(/\x1b\[[0-9;]*m/g, "");
  assert.match(limpio, /SIN SEÑAL/);
  assert.match(limpio, /no responde/);
  assert.match(limpio, /npm run vigia/, "y sugiere cómo arrancarlo");
});

/** Ejecuta el panel y devuelve la salida sin colores. */
function panel(env) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, "scripts", "panel.mjs")], {
    encoding: "utf8",
    env: { ...process.env, SHIN_PANEL_URL: "http://127.0.0.1:1", ...env },
  });
  return { status: r.status, texto: (r.stdout || "").replace(/\x1b\[[0-9;]*m/g, "") };
}

test("el panel enseña el teléfono aunque el bot esté parado", () => {
  // Si el bot no contesta, la caja del teléfono sigue siendo útil.
  const r = panel({ SHIN_PANEL_RAIZ: path.join(os.tmpdir(), "no-existe-" + Date.now()) });
  assert.equal(r.status, 0);
  assert.match(r.texto, /SIN SEÑAL/);
  assert.match(r.texto, /TU TELÉFONO/);
  assert.match(r.texto, /equipo/);
  // El disco no depende de la raíz: se lee del sistema de archivos real.
  assert.match(r.texto, /disco/);
});

test("el panel lee modelo, Android y batería como lo haría en Termux", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "shin-android-"));
  fs.mkdirSync(path.join(raiz, "system"), { recursive: true });
  fs.mkdirSync(path.join(raiz, "proc"), { recursive: true });
  const bat = path.join(raiz, "sys", "class", "power_supply", "battery");
  fs.mkdirSync(bat, { recursive: true });

  fs.writeFileSync(
    path.join(raiz, "system", "build.prop"),
    "ro.product.brand=TECNO\nro.product.model=TECNO KJ5\nro.build.version.release=13\n",
  );
  fs.writeFileSync(
    path.join(raiz, "proc", "meminfo"),
    "MemTotal:        3901004 kB\nMemAvailable:    1642000 kB\n",
  );
  fs.writeFileSync(path.join(bat, "capacity"), "39\n");
  fs.writeFileSync(path.join(bat, "status"), "Charging\n");
  fs.writeFileSync(path.join(bat, "temp"), "343\n");

  const r = panel({ SHIN_PANEL_RAIZ: raiz });
  assert.equal(r.status, 0);

  assert.match(r.texto, /TECNO/, "el modelo sale de build.prop");
  assert.match(r.texto, /Android 13/, "la versión sale de build.prop");
  assert.match(r.texto, /39%/, "el porcentaje sale de capacity");
  assert.match(r.texto, /cargando/, "el estado sale de status");
  assert.match(r.texto, /34\.3°C/, "la temperatura viene en décimas y se divide");
  // 3901004 kB ≈ 3810 MB; tiene que enseñar el total del teléfono, no otra cosa.
  assert.match(r.texto, /3810 MB/);
  // Con datos de Android no debe aparecer el nombre del sistema de escritorio.
  assert.doesNotMatch(r.texto, /Linux[\d .]*·/);
});

test("el panel no se descuadra en una pantalla estrecha", () => {
  const r = panel({ SHIN_PANEL_ANCHO: "46" });
  assert.equal(r.status, 0);
  const cajas = r.texto.split("\n").filter((l) => /^[│╭╰]/.test(l));
  const anchos = new Set(cajas.map((l) => [...l].length));
  assert.equal(anchos.size, 1, `anchos distintos: ${[...anchos].join(", ")}`);
  assert.ok(cajas.every((l) => [...l].length === 46), "cada línea mide 46");
});
