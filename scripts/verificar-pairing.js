#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  verificar-pairing.js — Prueba de ARRANQUE REAL del paring code.
//
//  Qué hace, en orden:
//    1. Inventa un número de teléfono al azar (no es de nadie).
//    2. Arranca el bot tal cual se arranca en producción:
//         node index.js --code <número inventado>
//       pero con la sesión en una carpeta temporal, para no tocar la
//       sesión real del dueño.
//    3. Vigila la consola y confirma que el bot llegó a PEDIR el código.
//    4. Cierra el bot y borra la carpeta temporal (sesión y base de datos).
//
//  Qué NO hace: no toca tu sesión, no vincula nada, no escribe en tu
//  base de datos. Solo abre una conexión con WhatsApp y pide el código
//  de un número inventado. WhatsApp responderá que ese número no está
//  registrado: eso es lo esperado y sigue probando que el flujo salió.
//
//  Toca los servidores de WhatsApp (1 petición por ejecución): no lo
//  metas en un bucle ni en un CI que corra sin parar.
//
//  Uso:  npm run test:pairing
//        node scripts/verificar-pairing.js            (país MX)
//        node scripts/verificar-pairing.js AR         (Argentina)
// ═══════════════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { telefonoAleatorio } from "../src/lib/cli-args.js";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAIS = (process.argv[2] || "MX").toUpperCase();
const ESPERA_MS = 45000;
const numero = telefonoAleatorio({ pais: PAIS });
const sesionTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "shin-pairing-"));
// La base de datos también va a la carpeta temporal: la prueba no debe
// escribir en data/shin.db del bot (ni en absoluto).
const baseTemporal = path.join(sesionTemporal, "prueba.db");

const lineas = [];
let pidioCodigo = false;
let recibioCodigo = false;
let fallo = "";
let evidencia = ""; // la línea exacta donde apareció el código

console.log("── Prueba de arranque del paring code ─────────────────────");
console.log(`   Número inventado: +${numero}  (país ${PAIS})`);
console.log(`   Sesión temporal:  ${sesionTemporal}`);
console.log(`   Base de datos:    ${baseTemporal}  (temporal)`);
console.log("   Arrancando el bot...\n");

const hijo = spawn(process.execPath, ["index.js", "--code", numero], {
  cwd: RAIZ,
  env: {
    ...process.env,
    SESSION_DIR: sesionTemporal,   // no tocar Sessions/Owner
    SHIN_DB_PATH: baseTemporal,    // no tocar data/shin.db
    SHIN_PAIRING_DEBUG: "1",       // deja la marca "solicitando código…"
    NODE_ENV: "test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

// Los logs del bot pueden llegar partidos en varios trozos (el logger
// escribe la etiqueta y el mensaje por separado), así que se guarda un
// búfer y solo se analizan las líneas completas.
let pendiente = "";
function revisar(texto) {
  pendiente += texto;
  const trozos = pendiente.split("\n");
  pendiente = trozos.pop() || "";
  for (const linea of trozos) {
    // eslint-disable-next-line no-control-regex -- quita los colores ANSI antes de analizar
    const limpia = linea.replace(/\u001b\[[0-9;]*m/g, "").trim();
    if (!limpia) continue;
    lineas.push(limpia);
    if (process.env.SHIN_PAIRING_VERBOSE === "1") console.log("   │ " + limpia);
    if (/solicitando código de vinculación/i.test(limpia)) pidioCodigo = true;
    if (/Código de emparejamiento/i.test(limpia)) {
      recibioCodigo = true;
      evidencia = limpia;
      // Ya está lo que buscábamos: no hace falta seguir conectados.
      setTimeout(() => terminar("ya tenemos el código"), 50);
    }
    if (/^Pairing:/i.test(limpia) && !fallo) fallo = limpia;
  }
}

hijo.stdout.on("data", (d) => revisar(String(d)));
hijo.stderr.on("data", (d) => revisar(String(d)));
hijo.on("close", () => revisar("\n")); // vuelca lo que quedara sin salto final

const reloj = setTimeout(() => terminar("tiempo agotado"), ESPERA_MS);
// Si el bot muere solo (por ejemplo, un error de arranque), se corta ya.
hijo.on("exit", (codigo) => {
  if (pidioCodigo || recibioCodigo) return; // ya veremos el resultado en terminar()
  terminar("el bot terminó antes de tiempo (código " + codigo + ")");
});

let terminado = false;
function terminar(motivo) {
  if (terminado) return;
  terminado = true;
  clearTimeout(reloj);
  try { hijo.kill("SIGKILL"); } catch {}
  try { fs.rmSync(sesionTemporal, { recursive: true, force: true }); } catch {}

  console.log("\n── Resultado ──────────────────────────────────────────────");
  if (recibioCodigo) {
    console.log("   ✅ El flujo completo funcionó: el bot pidió el código Y lo recibió.");
    console.log("      Línea exacta de la consola del bot:");
    console.log("        " + evidencia);
    console.log("      (Ese código ya caducó y era de un número inventado, no sirve");
    console.log("       para vincular nada.) Prueba SUPERADA.");
    process.exit(0);
  }
  if (pidioCodigo) {
    console.log("   ✅ El bot PIDIÓ el código de vinculación (\"solicitando código…\").");
    if (fallo) {
      console.log("   ℹ️  WhatsApp respondió: " + fallo);
      console.log("      Es lo ESPERADO con un número inventado: la petición");
      console.log("      llegó a WhatsApp y fue él quien la rechazó.");
    } else {
      console.log("   ℹ️  WhatsApp no respondió en el tiempo de la prueba;");
      console.log("      la petición ya había salido, que es lo que se prueba.");
    }
    console.log("   Prueba SUPERADA.");
    process.exit(0);
  }

  console.log("   ❌ El bot NUNCA llegó a pedir el código (" + motivo + ").");
  console.log("   Últimas líneas de la consola del bot:");
  for (const l of lineas.slice(-12)) console.log("      " + l);
  console.log("   Prueba FALLIDA.");
  process.exit(1);
}
