#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  panel.mjs — el estado del bot y del teléfono, en cajas
//
//  Dos vistas diferentes, y conviene no confundirlas:
//
//   · lo del BOT (memoria, cola, grupos) se lo pregunta a su panel
//     local, /health y /metrics, en 127.0.0.1:3000.
//   · lo del TELÉFONO (batería, disco, memoria del sistema) lo lee del
//     propio Android donde corre: /sys, /proc y /system/build.prop.
//
//  Todo lo que sale en pantalla es de la máquina en la que ejecutas el
//  comando. No hay nada de nadie más aquí, ni puede haberlo: este
//  archivo no abre conexiones que no sean a 127.0.0.1.
//
//  Uso:
//    npm run panel             (una vez)
//    npm run panel:vivir       (se refresca cada 2 s hasta Ctrl+C)
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import os from "node:os";

const AZUL = "\x1b[38;5;111m";
const VERDE = "\x1b[38;5;79m";
const AMBAR = "\x1b[38;5;179m";
const ROJO = "\x1b[38;5;174m";
const GRIS = "\x1b[38;5;245m";
const NEGRITA = "\x1b[1m";
const RESET = "\x1b[0m";

const URL_BASE = process.env.SHIN_PANEL_URL || "http://127.0.0.1:3000";
const VIVIR = process.argv.includes("--vivir");
const INTERVALO = Number(process.env.SHIN_PANEL_MS || 2000);
// Dónde buscar los datos del equipo. Normalmente la raíz del sistema; se
// puede apuntar a otra carpeta para probar el panel sin tener un Android.
const RAIZ = process.env.SHIN_PANEL_RAIZ || "";

const ancho = () => {
  // SHIN_PANEL_ANCHO existe porque algunas terminales (y sobre todo los
  // emuladores) informan un ancho que no es el real y la caja se descuadra.
  const forzado = Number(process.env.SHIN_PANEL_ANCHO || 0);
  if (forzado >= 40) return Math.min(forzado, 100);
  const t = process.stdout.columns;
  return Math.max(46, Math.min(t && t > 20 ? t - 2 : 72, 84));
};

// Ancho en pantalla: sin códigos de color y contando los caracteres
// anchos (los «█», «░», los acentos) como uno solo.
const visible = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;

/** Recorta sin partir un código de color a la mitad (mancharía la terminal). */
function recortar(texto, max) {
  let salida = "";
  let cuenta = 0;
  for (let i = 0; i < texto.length; ) {
    if (texto[i] === "\x1b") {
      const fin = texto.indexOf("m", i);
      salida += texto.slice(i, fin + 1);
      i = fin + 1;
      continue;
    }
    const ch = String.fromCodePoint(texto.codePointAt(i));
    if (cuenta + 1 > max) break;
    salida += ch;
    cuenta++;
    i += ch.length;
  }
  return salida + RESET;
}

/** Caja con título; todas las líneas miden lo mismo, o se ve escalonado. */
function caja(titulo, lineas, color = AZUL) {
  const W = ancho();
  const interior = W - 4; // "│" + " " + texto + " " + "│"
  const salida = [];
  const tituloTxt = titulo ? ` ${titulo} ` : "";
  salida.push(`${color}╭${tituloTxt}${"─".repeat(Math.max(0, W - 2 - visible(tituloTxt)))}╮${RESET}`);
  for (const cruda of lineas) {
    const linea = visible(cruda) > interior ? recortar(cruda, interior - 1) + "…" : cruda;
    salida.push(`${color}│${RESET} ${linea}${" ".repeat(Math.max(0, interior - visible(linea)))} ${color}│${RESET}`);
  }
  salida.push(`${color}╰${"─".repeat(W - 2)}╯${RESET}`);
  return salida.join("\n");
}

/** Barra de 18 bloques. */
function barra(valor, maximo, color) {
  const n = ancho() < 60 ? 12 : 18;
  const parte = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  const llenos = Math.round(parte * n);
  return `${color}${"█".repeat(llenos)}${GRIS}${"░".repeat(n - llenos)}${RESET}`;
}

const colorSegun = (v, aviso, malo) => (v >= malo ? ROJO : v >= aviso ? AMBAR : VERDE);

function hace(brutos) {
  const segundos = Math.floor(brutos); // os.uptime() trae decimales
  if (segundos < 60) return `${segundos}s`;
  const m = Math.floor(segundos / 60);
  if (m < 60) return `${m}m ${segundos % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const gb = (bytes) => `${(bytes / 1073741824).toFixed(1)} GB`;

// ─────────────────────────── el teléfono ───────────────────────────

const leer = (ruta) => {
  try {
    return fs.readFileSync(ruta, "utf8").trim();
  } catch {
    return null;
  }
};

/** Android deja leer esto sin permisos especiales. En Linux no existe. */
function datosAndroid() {
  const prop = leer(`${RAIZ}/system/build.prop`);
  if (!prop) return null;
  const campo = (clave) => {
    const m = prop.match(new RegExp(`^${clave}=(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  return {
    version: campo("ro.build.version.release"),
    modelo: campo("ro.product.model"),
    marca: campo("ro.product.brand"),
  };
}

function bateria() {
  for (const base of [`${RAIZ}/sys/class/power_supply/battery`, `${RAIZ}/sys/class/power_supply/bms`]) {
    const capacidad = leer(`${base}/capacity`);
    if (capacidad && /^\d+$/.test(capacidad)) {
      const temperatura = leer(`${base}/temp`);
      return {
        pct: Number(capacidad),
        estado: leer(`${base}/status`) || "",
        // Viene en décimas de grado.
        temp: temperatura && /^-?\d+$/.test(temperatura) ? Number(temperatura) / 10 : null,
      };
    }
  }
  return null;
}

function disco() {
  try {
    const s = fs.statfsSync(os.homedir());
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    return { total, libre, pct: total ? Math.round(((total - libre) / total) * 100) : 0 };
  } catch {
    return null;
  }
}

function memoriaSistema() {
  const info = leer(`${RAIZ}/proc/meminfo`);
  if (!info) return null;
  const total = Number((info.match(/^MemTotal:\s+(\d+) kB/m) || [])[1]);
  const disponible = Number((info.match(/^MemAvailable:\s+(\d+) kB/m) || [])[1]);
  if (!total || !disponible) return null;
  return { totalMB: Math.round(total / 1024), usadoMB: Math.round((total - disponible) / 1024) };
}

/** La IPv4 de la red local; en Android suele ser la del wifi. */
function ipLocal() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const i of interfaces || []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}

function cajaTelefono() {
  const and = datosAndroid();
  const bat = bateria();
  const dsc = disco();
  const mem = memoriaSistema();
  const ip = ipLocal();

  const equipo = and
    ? [and.marca, and.modelo, and.version ? `Android ${and.version}` : null, process.arch]
        .filter(Boolean)
        .join(" · ")
    : `${os.type()} ${os.release()} · ${process.arch}`;

  const lineas = [
    `${GRIS}equipo${RESET}    ${equipo}`,
    `${GRIS}encendido${RESET} ${hace(os.uptime())}${ip ? `   ${GRIS}red${RESET} ${ip}` : ""}`,
  ];

  if (bat) {
    const color = bat.pct <= 15 ? ROJO : bat.pct <= 35 ? AMBAR : VERDE;
    const carga = bat.estado === "Charging" ? "cargando" : bat.estado === "Full" ? "llena" : "descargando";
    // En pantalla estrecha sobra el detalle; el número es lo que importa.
    const detalle =
      ancho() >= 60 ? ` ${GRIS}${carga}${bat.temp !== null ? ` · ${bat.temp.toFixed(1)}°C` : ""}${RESET}` : "";
    lineas.push(
      `${GRIS}batería${RESET}   ${barra(bat.pct, 100, color)} ${String(bat.pct).padStart(3)}%${detalle}`,
    );
  }

  if (mem) {
    lineas.push(
      `${GRIS}memoria${RESET}   ${barra(mem.usadoMB, mem.totalMB, colorSegun((mem.usadoMB / mem.totalMB) * 100, 75, 90))}` +
        ` ${String(mem.usadoMB).padStart(4)} / ${mem.totalMB} MB`,
    );
  }

  if (dsc) {
    lineas.push(
      `${GRIS}disco${RESET}     ${barra(dsc.pct, 100, colorSegun(dsc.pct, 80, 92))}` +
        ` ${String(dsc.pct).padStart(3)}% ${GRIS}${gb(dsc.libre)} libres${RESET}`,
    );
  }

  return caja("TU TELÉFONO", lineas, VERDE);
}

// ───────────────────────────── el bot ─────────────────────────────

async function pedir(ruta) {
  const r = await fetch(URL_BASE + ruta, { signal: AbortSignal.timeout(2500) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function cajaBot() {
  let salud;
  let metricas;
  try {
    [salud, metricas] = await Promise.all([pedir("/health"), pedir("/metrics")]);
  } catch (e) {
    return caja(
      "SIN SEÑAL",
      [
        `${ROJO}el bot no responde en ${URL_BASE}${RESET}`,
        "",
        `${GRIS}${e.message}${RESET}`,
        "",
        `${GRIS}¿está arrancado?  cd ~/Shin-MD && npm run vigia -- --code${RESET}`,
      ],
      ROJO,
    );
  }

  const mem = metricas.memory.rssMB;
  const heap = metricas.memory.heapUsedMB;
  const riesgo = Number(salud.risk?.score ?? salud.risk ?? 0);
  const cola = Number(salud.queue ?? 0);

  const arriba = [
    `${NEGRITA}${salud.ok ? "ACTIVO" : "PARADO"}${RESET}  ${GRIS}${salud.state || "?"}${RESET}` +
      `  ${GRIS}·${RESET}  ${hace(Number(salud.uptimeSec) || 0)} encendido`,
    "",
    `${GRIS}memoria${RESET}   ${barra(mem, 512, colorSegun(mem, 300, 420))} ${String(mem).padStart(4)} MB`,
    `${GRIS}heap${RESET}      ${barra(heap, 256, colorSegun(heap, 150, 210))} ${String(heap).padStart(4)} MB`,
    `${GRIS}riesgo${RESET}    ${barra(riesgo, 100, colorSegun(riesgo, 60, 85))} ${String(riesgo).padStart(4)} / 100`,
    `${GRIS}cola${RESET}      ${barra(cola, 50, cola > 30 ? AMBAR : VERDE)} ${String(cola).padStart(4)} envíos`,
    "",
    `${GRIS}grupos${RESET} ${NEGRITA}${salud.groups ?? 0}${RESET}` +
      `   ${GRIS}versión${RESET} ${metricas.shin_version}` +
      `   ${GRIS}node${RESET} ${metricas.process.node}` +
      `   ${GRIS}pid${RESET} ${metricas.process.pid}`,
  ];

  return caja("SHIN-MD", arriba);
}

async function pintar() {
  // El teléfono no depende del bot: aunque esté parado, se ve igual.
  const piezas = [await cajaBot(), cajaTelefono()];
  piezas.push(
    `${GRIS}${new Date().toLocaleTimeString()}  ·  ${URL_BASE}${VIVIR ? "  ·  Ctrl+C para salir" : ""}${RESET}`,
  );
  return piezas.join("\n");
}

async function main() {
  if (!VIVIR) {
    console.log(await pintar());
    return;
  }
  for (;;) {
    const marco = await pintar();
    if (process.stdout.isTTY) process.stdout.write("\x1b[H\x1b[2J");
    console.log(marco);
    await new Promise((r) => setTimeout(r, INTERVALO));
  }
}

process.on("SIGINT", () => {
  console.log(`\n${GRIS}panel cerrado${RESET}`);
  process.exit(0);
});

main().catch((e) => {
  console.error("panel:", e.message);
  process.exit(1);
});
