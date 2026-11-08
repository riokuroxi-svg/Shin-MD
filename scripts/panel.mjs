#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  panel.mjs — el estado del bot, en cajas, dentro de la terminal
//
//  Pregunta a /health y /metrics del panel local (127.0.0.1:3000) y lo
//  dibuja con bordes. Pensado para Termux: se abre, se mira, se cierra.
//
//  Uso:
//    npm run panel             (una vez)
//    npm run panel -- --vivir  (se refresca cada 2 s hasta Ctrl+C)
// ═══════════════════════════════════════════════════════════════════

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

const ancho = () => {
  const t = process.stdout.columns;
  return Math.max(46, Math.min(t && t > 20 ? t - 2 : 72, 84));
};

// Longitud que ocupa en pantalla: sin códigos de color y contando los
// caracteres anchos (los «█», «░» y los acentos combinados) como lo que son.
const visible = (s) =>
  [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;

/** Caja con título, sin depender de que el texto encaje exacto. */
function caja(titulo, lineas, color = AZUL) {
  const W = ancho();
  const interior = W - 4; // "│" + " " + texto + relleno + " " + "│"
  const salida = [];
  const tituloTxt = titulo ? ` ${titulo} ` : "";
  const relleno = Math.max(0, W - 2 - visible(tituloTxt));
  salida.push(`${color}╭${tituloTxt}${"─".repeat(relleno)}╮${RESET}`);
  for (const linea of lineas) {
    const rellenoL = Math.max(0, interior - visible(linea));
    salida.push(`${color}│${RESET} ${linea}${" ".repeat(rellenoL)} ${color}│${RESET}`);
  }
  salida.push(`${color}╰${"─".repeat(W - 2)}╯${RESET}`);
  return salida.join("\n");
}

/** Barra de 18 bloques, como las de las capturas que te gustaban. */
function barra(valor, maximo, color) {
  const n = 18;
  const parte = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  const llenos = Math.round(parte * n);
  return `${color}${"█".repeat(llenos)}${GRIS}${"░".repeat(n - llenos)}${RESET}`;
}

const colorSegun = (v, aviso, malo) => (v >= malo ? ROJO : v >= aviso ? AMBAR : VERDE);

function hace(segundos) {
  if (segundos < 60) return `${segundos}s`;
  const m = Math.floor(segundos / 60);
  if (m < 60) return `${m}m ${segundos % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

async function pedir(ruta) {
  const r = await fetch(URL_BASE + ruta, { signal: AbortSignal.timeout(2500) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function pintar() {
  let salud;
  let metricas;
  try {
    [salud, metricas] = await Promise.all([pedir("/health"), pedir("/metrics")]);
  } catch (e) {
    const lineas = [
      `${ROJO}el bot no responde en ${URL_BASE}${RESET}`,
      "",
      `${GRIS}${e.message}${RESET}`,
      "",
      `${GRIS}¿está arrancado?  cd ~/Shin-MD && npm run vigia -- --code${RESET}`,
    ];
    return caja("SIN SEÑAL", lineas, ROJO);
  }

  const mem = metricas.memory.rssMB;
  const heap = metricas.memory.heapUsedMB;
  const riesgo = Number(salud.risk?.score ?? salud.risk ?? 0);
  const cola = Number(salud.queue ?? 0);
  const estado = String(salud.state || "?");

  const arriba = [
    `${NEGRITA}${salud.ok ? "ACTIVO" : "PARADO"}${RESET}  ${GRIS}${estado}${RESET}` +
      `  ${GRIS}·${RESET}  ${hace(salud.uptimeSec)} encendido`,
    "",
    `${GRIS}memoria${RESET}   ${barra(mem, 512, colorSegun(mem, 300, 420))} ${String(mem).padStart(4)} MB`,
    `${GRIS}heap${RESET}      ${barra(heap, 256, colorSegun(heap, 150, 210))} ${String(heap).padStart(4)} MB`,
    `${GRIS}riesgo${RESET}    ${barra(riesgo, 100, colorSegun(riesgo, 60, 85))} ${String(riesgo).padStart(4)} / 100`,
    `${GRIS}cola${RESET}      ${barra(cola, 50, cola > 30 ? AMBAR : VERDE)} ${String(cola).padStart(4)} envíos`,
  ];

  const abajo = [
    `${GRIS}grupos${RESET}       ${NEGRITA}${salud.groups ?? 0}${RESET}`,
    `${GRIS}versión${RESET}      ${metricas.shin_version}`,
    `${GRIS}node${RESET}         ${metricas.process.node}  ${GRIS}${metricas.process.platform}${RESET}`,
    `${GRIS}pid${RESET}          ${metricas.process.pid}`,
  ];

  return [
    caja("SHIN-MD", arriba),
    caja("SISTEMA", abajo, VERDE),
    `${GRIS}${new Date().toLocaleTimeString()}  ·  ${URL_BASE}${VIVIR ? "  ·  Ctrl+C para salir" : ""}${RESET}`,
  ].join("\n");
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
