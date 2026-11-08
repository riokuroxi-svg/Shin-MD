/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  vigia.mjs — deja el bot levantado sin que tengas que hacerlo tú
//
//  Arranca `index.js` como hijo con canal IPC y lo vuelve a levantar:
//    · cuando el comando .restart pide reiniciar (process.send("restart"))
//    · cuando el proceso muere solo (caída, OOM, cierre raro)
//
//  Lo que NO hace: insister eternamente. Si el bot muere 5 veces en menos
//  de dos minutos, se para y lo dice: eso es un fallo de verdad, no algo
//  que se arregle reiniciando más rápido.
//
//  Uso:
//    npm run vigia              (arranca y vigila)
//    npm run vigia -- --code    (lo mismo, con código de vinculación)
//
//  Para pararlo: Ctrl+C. El hijo recibe SIGTERM y cierra limpio.
// ═══════════════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ENTRADA = path.join(RAIZ, "index.js");
const ARGS = process.argv.slice(2);

const VENTANA_MS = 120_000;   // ventana para contar caídas seguidas
const MAX_CAIDAS = 5;         // más que esto y no es algo que se arregle solo
const ESPERA_MAX_MS = 15_000; // tope del retroceso entre intentos

let hijo = null;
let parando = false;
let caidas = [];
let reinicios = 0;

const hora = () => new Date().toTimeString().slice(0, 8);
const decir = (texto) => console.log(`\x1b[90m[${hora()}]\x1b[0m ${texto}`);

function espera(ms) {
  return new Promise((listo) => setTimeout(listo, ms));
}

async function arrancar() {
  hijo = spawn(process.execPath, [ENTRADA, ...ARGS], {
    cwd: RAIZ,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: { ...process.env, SHIN_VIGILADO: "1" },
  });

  hijo.on("message", (mensaje) => {
    if (mensaje === "restart") {
      reinicios += 1;
      decir(`el bot pidió reiniciar (reinicio nº ${reinicios})`);
      hijo.kill("SIGTERM");
    }
  });

  const { code, signal } = await new Promise((listo) => {
    hijo.on("exit", (codigo, senal) => listo({ code: codigo, signal: senal }));
  });

  hijo = null;

  if (parando) return "parar";

  // Cierre limpio pedido por el bot (SIGTERM desde .restart) o caída.
  if (signal === "SIGTERM" && !parando) {
    // Viene de .restart: se vuelve a levantar sin contar como caída.
    decir("levantando otra vez…");
    await espera(400);
    return "reiniciar";
  }

  const ahora = Date.now();
  caidas = caidas.filter((t) => ahora - t < VENTANA_MS);
  caidas.push(ahora);

  if (caidas.length >= MAX_CAIDAS) {
    console.error(
      `\n  ✗ El bot se cayó ${caidas.length} veces en ${VENTANA_MS / 1000}s.` +
        `\n  Eso no se arregla reiniciando: mira el error de arriba.` +
        `\n  Dejo de intentarlo; arráncalo tú cuando esté resuelto.\n`,
    );
    return "rendirse";
  }

  const esperaMs = Math.min(1000 * 2 ** (caidas.length - 1), ESPERA_MAX_MS);
  const como = signal ? `con la señal ${signal}` : `con código ${code}`;
  decir(`se cayó ${como}; vuelvo a levantarlo en ${(esperaMs / 1000).toFixed(1)}s`);
  await espera(esperaMs);
  return "reiniciar";
}

async function main() {
  decir("vigía activo: si el bot se cae o pide reiniciar, lo levanto solo");
  for (;;) {
    const decision = await arrancar();
    if (decision !== "reiniciar") {
      if (decision === "rendirse") process.exitCode = 1;
      break;
    }
  }
}

for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    if (parando) process.exit(130);
    parando = true;
    decir("parando… (Ctrl+C otra vez para forzar)");
    if (hijo) hijo.kill("SIGTERM");
    else process.exit(130);
  });
}

main().catch((e) => {
  console.error("vigía:", e.message);
  process.exit(1);
});
