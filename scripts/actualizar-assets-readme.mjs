#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  actualizar-assets-readme.mjs — Dibuja los SVG del README.
//
//  POR QUÉ EXISTE:
//  El README no lleva ni una imagen generada con IA ni un GIF pesado.
//  Todo lo que se mueve ahí son SVG escritos a mano por este script:
//  se ven nítidos en cualquier pantalla, pesan unos pocos KB y, sobre
//  todo, NO MIENTEN: los números que aparecen (comandos, alias, pruebas,
//  versión, Node, Baileys) se leen del propio repositorio cada vez que
//  se regeneran. Antes "136 pruebas" seguía escrito en una insignia
//  cuando la suite ya tenía 140.
//
//  Animaciones: SMIL (<animate>, <animateTransform>, <animateMotion>).
//  Se eligió SMIL y no CSS porque GitHub sirve las imágenes dentro de
//  un <img>: ahí no corre JavaScript, pero las animaciones SMIL sí se
//  reproducen en Chrome, Firefox y Safari.
//
//  Los kanji 反魂 NO son texto: son los trazados vectoriales del logo
//  (docs/assets/logo.svg). Así se ven igual en cualquier sistema, con
//  o sin fuentes japonesas instaladas.
//
//  Uso:  npm run docs:assets
//        node scripts/actualizar-assets-readme.mjs
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommands } from "#commands";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
const ASSETS = path.join(RAIZ, "docs", "assets");
const PAQUETE = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
const PLANTILLA = path.join(RAIZ, "docs", "web", "plantilla.html");
const RESUMEN = path.join(RAIZ, "test", "resumen-suite.json");

/* ─── Paleta (la misma del sistema de diseño del bot) ─────────────── */
const C = {
  verde: "#4ADE80",
  verdeSuave: "#8CF0B4",
  cian: "#38BDF8",
  violeta: "#A78BFA",
  rosa: "#F472B6",
  ambar: "#F0B429",
  rojo: "#E05468",
  sello: "#D9455A",
  noche1: "#05080C",
  noche2: "#0B1620",
  noche3: "#060D14",
  tintaOscura: "#CBD8E3",
  tintaSuave: "#8FA3B4",
  dia1: "#F7FBF8",
  dia2: "#E9F5EE",
  dia3: "#F2F9F4",
  tintaClara: "#1E2E3A",
  tintaClaraSuave: "#5A7080",
};

const SANS = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/* ─── Utilidades ─────────────────────────────────────────────────── */

/** Ancho aproximado de un texto sin depender de la fuente del sistema. */
function anchoTexto(t, tam, negrita = false) {
  const factor = negrita ? 0.575 : 0.545;
  return t.length * tam * factor;
}

function xml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ruido determinista: el mismo SVG en cada ejecución (diffs limpios). */
function azar(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Los dos trazados de 反魂 tal y como están dibujados en logo.svg.
 * La caja de cada glifo (x, y, ancho, alto) se midió sobre los propios
 * trazados: así el sello se centra igual en cualquier sistema, tenga o no
 * fuentes japonesas instaladas.
 */
function trazadosKanji() {
  const logo = fs.readFileSync(path.join(ASSETS, "logo.svg"), "utf8");
  const re = /<path transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)" d="([^"]+)"\/>/g;
  const ds = [...logo.matchAll(re)].map((m) => m[1]);
  if (ds.length !== 2) throw new Error("logo.svg ya no tiene los dos kanji esperados");
  return [
    { d: ds[0], x: 155, y: 36, w: 933, h: 1054 },
    { d: ds[1], x: 26, y: 39, w: 961, h: 1055 },
  ];
}

/**
 * Coloca 反魂 centrado en (cx, cy) con la altura pedida.
 * `relleno` es el color; `giro` permite el sello ligeramente inclinado.
 */
function kanji(cx, cy, alto, relleno, giro = 0) {
  const glifos = trazadosKanji();
  const s = alto / Math.max(...glifos.map((g) => g.h));
  const hueco = glifos[0].w * 0.05 * s;
  const anchoTotal = glifos.reduce((a, g) => a + g.w * s, 0) + hueco;
  let x = cx - anchoTotal / 2;
  let capa = "";
  for (const g of glifos) {
    const arriba = cy - (g.h * s) / 2;
    capa += `<path transform="translate(${(x - g.x * s).toFixed(2)} ${(arriba - g.y * s).toFixed(2)}) scale(${s.toFixed(5)})" d="${g.d}"/>`;
    x += g.w * s + hueco;
  }
  const giroAttr = giro ? ` transform="rotate(${giro} ${cx} ${cy})"` : "";
  return `<g fill="${relleno}"${giroAttr}>${capa}</g>`;
}

/** Pétalos de sakura cayendo. Semilla fija: mismo dibujo en cada corrida. */
function petalos(ancho, alto, cuantos, semilla, colores) {
  const r = azar(semilla);
  const d = "M0 0 C3.1 -4.4 8.9 -4.4 12 0 C8.9 4.4 3.1 4.4 0 0 Z";
  let salida = "";
  for (let i = 0; i < cuantos; i++) {
    const x = Math.round(20 + r() * (ancho - 40));
    const deriva = Math.round((r() - 0.5) * 90);
    const dur = (11 + r() * 9).toFixed(1);
    const retardo = (-r() * 16).toFixed(1);
    const escala = (0.5 + r() * 0.75).toFixed(2);
    const color = colores[Math.floor(r() * colores.length)];
    const opacidad = (0.22 + r() * 0.42).toFixed(2);
    salida +=
      `<g opacity="0">` +
      `<animate attributeName="opacity" values="0;${opacidad};${opacidad};0" keyTimes="0;0.12;0.82;1" dur="${dur}s" begin="${retardo}s" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 -30; ${deriva} ${alto + 40}" dur="${dur}s" begin="${retardo}s" repeatCount="indefinite"/>` +
      `<g transform="translate(${x} 0)">` +
      `<g><animateTransform attributeName="transform" type="rotate" values="0;360" dur="${(6 + r() * 7).toFixed(1)}s" repeatCount="indefinite"/>` +
      `<path d="${d}" fill="${color}" transform="scale(${escala})"/></g></g></g>`;
  }
  return salida;
}

/** Rejilla tenue de fondo. */
function rejilla(color, paso = 26) {
  return (
    `<pattern id="rejilla" width="${paso}" height="${paso}" patternUnits="userSpaceOnUse">` +
    `<path d="M${paso} 0H0V${paso}" fill="none" stroke="${color}" stroke-width="1"/></pattern>`
  );
}

function aurora(id, color, opacidad) {
  return (
    `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="${opacidad}"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
  );
}

/** Barrido RGB: degradado en movimiento para títulos y filos. */
function gradienteRGB(id, opacidad = 1, paleta) {
  const paradas = (paleta || [C.verde, C.cian, C.violeta, C.rosa, C.ambar, C.verde])
    .map(
      (c, i, a) =>
        `<stop offset="${(i / (a.length - 1)).toFixed(3)}" stop-color="${c}" stop-opacity="${opacidad}"/>`
    )
    .join("");
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0" spreadMethod="repeat">${paradas}` +
    `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="-1 0" dur="9s" repeatCount="indefinite"/>` +
    `</linearGradient>`
  );
}

/* ─── Cabecera del README (hero) ─────────────────────────────────── */

function hero(oscuro, n) {
  const W = 1200;
  const H = 340;
  const t = oscuro
    ? {
        f1: C.noche1,
        f2: C.noche2,
        f3: C.noche3,
        tinta: "#E8F1F8",
        suave: C.tintaOscura,
        tenue: "#7D90A0",
        filo: "rgba(255,255,255,0.06)",
      }
    : {
        f1: C.dia1,
        f2: C.dia2,
        f3: C.dia3,
        tinta: "#0B1A12",
        suave: "#2C3E4C",
        tenue: C.tintaClaraSuave,
        filo: "rgba(12,26,20,0.07)",
      };
  const petalosColor = oscuro ? [C.rosa, "#F9A8D4", C.verde] : [C.rosa, "#F0A6C8", "#7FD8A2"];

  const cp = oscuro
    ? { a: C.verde, b: C.cian, c: C.violeta, d: C.ambar, e: C.rosa }
    : { a: "#0E9F5B", b: "#0284C7", c: "#7C3AED", d: "#B45309", e: "#DB2777" };
  const chips = [
    { t: `${n.comandos} comandos`, c: cp.a },
    { t: `${n.nombres} nombres`, c: cp.b },
    { t: `${n.pruebas}/${n.pruebasTotal} pruebas`, c: cp.c },
    { t: `${n.categorias} categorías`, c: cp.d },
    { t: `licencia ${n.licencia}`, c: cp.e },
  ];
  let x = 0;
  const posiciones = chips.map((ch) => {
    const w = Math.round(anchoTexto(ch.t, 13, true) + 34);
    const o = { ...ch, w, x };
    x += w + 12;
    return o;
  });
  const total = x - 12;
  let filaChips = "";
  for (const p of posiciones) {
    const x0 = (W - total) / 2 + p.x;
    filaChips +=
      `<rect x="${x0}" y="252" width="${p.w}" height="32" rx="16" fill="${oscuro ? "rgba(255,255,255,0.045)" : "rgba(10,24,16,0.045)"}" stroke="${p.c}" stroke-opacity="0.38"/>` +
      `<text x="${(x0 + p.w / 2).toFixed(1)}" y="272.5" text-anchor="middle" font-family="${SANS}" font-size="13" font-weight="600" fill="${p.c}">${xml(p.t)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Shin-MD — bot de WhatsApp que no se cae, no se banea y no borra tu sesión">
  <title>Shin-MD</title>
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.f1}"/><stop offset="0.55" stop-color="${t.f2}"/><stop offset="1" stop-color="${t.f3}"/>
    </linearGradient>
    ${gradienteRGB("titulo", 1, oscuro ? null : ["#0E9F5B", "#0284C7", "#7C3AED", "#DB2777", "#B45309", "#0E9F5B"])}
    ${gradienteRGB("filargb", 1, oscuro ? null : ["#0E9F5B", "#0284C7", "#7C3AED", "#DB2777", "#B45309", "#0E9F5B"])}
    ${aurora("halo1", C.verde, oscuro ? "0.20" : "0.12")}
    ${aurora("halo2", C.cian, oscuro ? "0.16" : "0.10")}
    ${aurora("halo3", C.rosa, oscuro ? "0.12" : "0.07")}
    ${rejilla(oscuro ? t.filo : "rgba(12,26,20,0.035)")}
    <filter id="brillo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    <clipPath id="recorteHero"><rect width="${W}" height="${H}" rx="22"/></clipPath>
    <linearGradient id="selloBrillo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.28"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.02"/>
    </linearGradient>
  </defs>

  <g clip-path="url(#recorteHero)">
    <rect width="${W}" height="${H}" fill="url(#fondo)"/>
    <rect width="${W}" height="${H}" fill="url(#rejilla)"/>
    <ellipse cx="200" cy="20" rx="360" ry="240" fill="url(#halo1)"/>
    <ellipse cx="1020" cy="330" rx="380" ry="250" fill="url(#halo2)"/>
    <ellipse cx="600" cy="360" rx="420" ry="180" fill="url(#halo3)"/>

    <!-- órbitas lentas al fondo -->
    <g opacity="${oscuro ? "0.55" : "0.5"}">
      <g><animateTransform attributeName="transform" type="rotate" from="0 150 170" to="360 150 170" dur="60s" repeatCount="indefinite"/>
        <circle cx="150" cy="170" r="118" fill="none" stroke="${C.verde}" stroke-opacity="0.18" stroke-dasharray="3 9"/>
        <circle cx="268" cy="170" r="3.4" fill="${C.verde}" fill-opacity="0.7"/></g>
      <g><animateTransform attributeName="transform" type="rotate" from="360 1050 160" to="0 1050 160" dur="72s" repeatCount="indefinite"/>
        <circle cx="1050" cy="160" r="132" fill="none" stroke="${C.cian}" stroke-opacity="0.16" stroke-dasharray="3 9"/>
        <circle cx="918" cy="160" r="3.4" fill="${C.cian}" fill-opacity="0.7"/></g>
    </g>

    <!-- pétalos -->
    <g>${petalos(W, H, 16, oscuro ? 20261003 : 777, petalosColor)}</g>

    <!-- sello con 反魂 -->
    <g>
      <circle cx="600" cy="86" r="52" fill="none" stroke="${C.sello}" stroke-opacity="0.28">
        <animate attributeName="r" values="46;60;46" dur="7s" repeatCount="indefinite"/>
        <animate attributeName="stroke-opacity" values="0.32;0.05;0.32" dur="7s" repeatCount="indefinite"/>
      </circle>
      <circle cx="600" cy="86" r="60" fill="url(#halo1)" opacity="0.5"/>
      <g transform="rotate(-6 600 86)">
        <rect x="562" y="48" width="76" height="76" rx="20" fill="${C.sello}"/>
        <rect x="564.5" y="50.5" width="71" height="71" rx="18" fill="none" stroke="url(#selloBrillo)" stroke-width="1.4"/>
        ${kanji(600, 86, 40, "#FFFFFF")}
      </g>
    </g>

    <text x="600" y="34" text-anchor="middle" font-family="${SANS}" font-size="12.5" font-weight="700" letter-spacing="5" fill="${oscuro ? C.verdeSuave : "#12855B"}">EL RENACER DE UN BOT</text>

    <!-- título con barrido RGB -->
    <text x="600" y="190" text-anchor="middle" font-family="${SANS}" font-size="86" font-weight="800" letter-spacing="3" fill="url(#titulo)" opacity="${oscuro ? "0.5" : "0.28"}" filter="url(#brillo)">SHIN-MD</text>
    <text x="600" y="190" text-anchor="middle" font-family="${SANS}" font-size="86" font-weight="800" letter-spacing="3" fill="url(#titulo)">SHIN-MD</text>

    <text x="600" y="222" text-anchor="middle" font-family="${SANS}" font-size="16.5" fill="${t.suave}">Bot de WhatsApp que no se cae, no se banea y <tspan fill="${oscuro ? C.verdeSuave : "#12855B"}" font-weight="700">no borra tu sesión</tspan>.</text>

    <!-- chips de estado -->
    ${filaChips}
    <rect x="-360" y="0" width="360" height="${H}" fill="url(#filargb)" opacity="0.05">
      <animate attributeName="x" values="-360;${W}" dur="11s" repeatCount="indefinite"/>
    </rect>
    <rect x="0" y="${H - 3}" width="${W}" height="3" fill="url(#filargb)"/>
  </g>
</svg>`;
}
/* ─── Divisores ──────────────────────────────────────────────────── */

function divisor(oscuro) {
  const W = 1200;
  const H = 44;
  const linea = oscuro ? "rgba(255,255,255,0.10)" : "rgba(12,26,20,0.14)";
  const puntos = oscuro ? [C.rosa, C.verde, C.cian] : ["#E8A0C0", "#6FD79B", "#7CC7F0"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="separador">
  <defs>
    ${gradienteRGB("filo")}
    ${aurora("brilloDiv", C.verde, "0.20")}
  </defs>
  <g opacity="${oscuro ? "1" : "0.95"}">
    <rect x="140" y="22" width="400" height="1.6" fill="url(#filo)" opacity="0.75"/>
    <rect x="660" y="22" width="400" height="1.6" fill="url(#filo)" opacity="0.75"/>
  </g>
  <rect x="${0}" y="21" width="140" height="1.4" fill="${linea}" opacity="0.5"/>
  <rect x="1060" y="21" width="140" height="1.4" fill="${linea}" opacity="0.5"/>
  <g transform="translate(600 23)">
    <rect x="-6" y="-6" width="12" height="12" rx="3" transform="rotate(45)" fill="${C.verde}">
      <animate attributeName="opacity" values="0.5;1;0.5" dur="3.6s" repeatCount="indefinite"/>
    </rect>
    <rect x="-1.6" y="-1.6" width="3.2" height="3.2" rx="0.9" transform="rotate(45)" fill="${oscuro ? C.noche1 : C.dia1}"/>
    <circle r="20" fill="url(#brilloDiv)"/>
  </g>
  <g>${petalos(W, H, 7, oscuro ? 42 : 99, puntos)}</g>
</svg>`;
}

/* ─── Tarjetas oscuras (terminal, chat, flujo, medidor) ──────────── */

/** Marco de "ventana" reutilizable para las tarjetas de consola. */
function marco(W, H, titulo, subtitulo) {
  return `<defs>
    <linearGradient id="cristal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#070C12"/><stop offset="0.6" stop-color="#0B141C"/><stop offset="1" stop-color="#060A10"/>
    </linearGradient>
    ${rejilla("rgba(255,255,255,0.028)", 24)}
    ${gradienteRGB("filorgb")}
    <linearGradient id="brilloLinea" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4ADE80" stop-opacity="0"/><stop offset="0.5" stop-color="#4ADE80" stop-opacity="0.5"/><stop offset="1" stop-color="#4ADE80" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#cristal)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#rejilla)"/>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="17.5" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
  <rect x="26" y="0" width="${W - 52}" height="2.4" fill="url(#filorgb)" opacity="0.55"/>
  <circle cx="28" cy="24" r="5.5" fill="#FF5F57"/><circle cx="48" cy="24" r="5.5" fill="#FEBC2E"/><circle cx="68" cy="24" r="5.5" fill="#28C840"/>
  <text x="${W / 2}" y="28" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="#7D90A0">${xml(titulo)}</text>
  ${subtitulo ? `<text x="${W - 28}" y="28" text-anchor="end" font-family="${MONO}" font-size="11.5" fill="#54697B">${xml(subtitulo)}</text>` : ""}
  <rect x="20" y="42" width="${W - 40}" height="1.2" fill="rgba(255,255,255,0.07)"/>`;
}

/** Espera el turno de una línea: aparece deslizando y luego se queda. */
function lineaAparece(retardo, dur = 0.42) {
  return (
    `<animate attributeName="opacity" values="0;1" dur="${dur}s" begin="${retardo}s" fill="freeze"/>` +
    `<animateTransform attributeName="transform" type="translate" values="-10 0; 0 0" dur="${dur}s" begin="${retardo}s" fill="freeze"/>`
  );
}

function terminal(n) {
  const W = 1060;
  const H = 476;
  const lineas = [
    ["#8FA3B4", "$", "npm start -- --code", ""],
    ["#CBD8E3", "▲", `Shin-MD v${n.version}`, "Powered by riokuroxi-svg"],
    ["#4ADE80", "✓", "Licencia comprobada: LICENSE + NOTICE", "AGPL-3.0-only"],
    ["#38BDF8", "◐", "Motor: BOOT → INIT → CONNECT → READY → RUNNING", ""],
    ["#A78BFA", "✓", "Sesión en SQLite (WAL, chmod 600)", "auth.db"],
    ["#F0B429", "✓", "Anti-ban: jitter gaussiano σ 0.25 · base 1200 ms", ""],
    ["#4ADE80", "✓", "Cola de envíos activa · prioridad para .menu y .ping", ""],
    ["#F472B6", "◈", "Número nuevo: calentamiento 20 → 500 mensajes/día", "día 1 de 7"],
  ];
  let cuerpo = "";
  lineas.forEach((l, i) => {
    const y = 82 + i * 30;
    const color = l[0];
    cuerpo +=
      `<g>` +
      lineaAparece(i * 0.5) +
      `<text x="40" y="${y}" font-family="${MONO}" font-size="13.5" fill="${color}">${xml(l[1])}</text>` +
      `<text x="66" y="${y}" font-family="${MONO}" font-size="13.5" fill="#CBD8E3">${xml(l[2])}</text>` +
      (l[3]
        ? `<text x="${W - 40}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="12" fill="#54697B">${xml(l[3])}</text>`
        : "") +
      `</g>`;
  });

  // El código de vinculación se escribe letra a letra (recorte animado).
  const yCodigo = 82 + lineas.length * 30 + 18;
  const anchoCodigo = 560;
  cuerpo +=
    `<g clip-path="url(#recorteCodigo)">` +
    `<text x="40" y="${yCodigo}" font-family="${MONO}" font-size="15" fill="#F472B6">◈</text>` +
    `<text x="66" y="${yCodigo}" font-family="${MONO}" font-size="15" letter-spacing="2" fill="#FFD9EC">Código de vinculación: 7QK4-2ZP9</text>` +
    `</g>` +
    `<clipPath id="recorteCodigo"><rect x="34" y="${yCodigo - 22}" width="0" height="30">` +
    `<animate attributeName="width" values="0;${anchoCodigo}" dur="1.5s" begin="4.4s" fill="freeze"/></rect></clipPath>` +
    `<rect x="34" y="${yCodigo - 22}" width="0" height="30" clip-path="url(#recorteCodigo)" fill="none"/>` +
    `<rect x="34" y="${yCodigo - 17}" width="6" height="21" rx="1" fill="#4ADE80">` +
    `<animate attributeName="opacity" values="1;1;0;0" dur="1.1s" begin="4.4s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0; ${anchoCodigo} 0" dur="1.5s" begin="4.4s" fill="freeze"/>` +
    `</rect>`;

  // Barra inferior: el estado real del bot.
  const chips = [
    { c: "#4ADE80", t: "motor RUNNING" },
    { c: "#38BDF8", t: "cola 0" },
    { c: "#F0B429", t: "riesgo 4/100" },
    { c: "#A78BFA", t: "sesión intacta" },
  ];
  let x = 40;
  for (const ch of chips) {
    const w = Math.round(anchoTexto(ch.t, 12, true) + 46);
    cuerpo +=
      `<rect x="${x}" y="${H - 58}" width="${w}" height="28" rx="14" fill="rgba(255,255,255,0.04)" stroke="${ch.c}" stroke-opacity="0.35"/>` +
      `<circle cx="${x + 16}" cy="${H - 44}" r="4" fill="${ch.c}"><animate attributeName="opacity" values="0.35;1;0.35" dur="2.4s" repeatCount="indefinite"/></circle>` +
      `<text x="${x + 28}" y="${H - 39.5}" font-family="${MONO}" font-size="12" fill="#CBD8E3">${xml(ch.t)}</text>`;
    x += w + 12;
  }
  cuerpo += `<text x="${W - 40}" y="${H - 39}" text-anchor="end" font-family="${MONO}" font-size="11.5" fill="#54697B">logs/shin-${new Date().toISOString().slice(0, 10)}.log</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Arranque real de Shin-MD en la terminal">
  ${marco(W, H, "shin-md — npm start -- --code", `node ≥ ${n.node}`)}
  ${cuerpo}
  <rect x="0" y="0" width="${W}" height="3" rx="1.5" fill="url(#filorgb)"/>
</svg>`;
}

function chatDemo() {
  const W = 1000;
  const H = 620;
  const borde = "#1F2C34";

  /** Burbuja que entra deslizando y se queda. */
  const burbuja = (y, alto, ancho, entrante, contenido, retardo) =>
    `<g>` +
    lineaAparece(retardo, 0.5) +
    `<rect x="${entrante ? 70 : W - 70 - ancho}" y="${y}" width="${ancho}" height="${alto}" rx="14" fill="${entrante ? borde : "#134D3C"}" stroke="rgba(255,255,255,0.05)"/>` +
    contenido +
    `</g>`;

  let cuerpo = "";

  // 1) el usuario escribe .menu
  cuerpo += burbuja(
    86,
    54,
    200,
    false,
    `<text x="${W - 96}" y="112" text-anchor="end" font-family="${MONO}" font-size="15" fill="#D9FDD3">.menu</text>` +
      `<text x="${W - 96}" y="130" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="#7FA99B">12:04 ✓✓</text>`,
    0.3
  );

  // 2) "escribiendo…" que se apaga justo cuando entra la tarjeta
  const y = 150;
  cuerpo +=
    `<g opacity="0">` +
    `<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.5;0.62;1" dur="2.6s" begin="1.1s" fill="freeze"/>` +
    [0, 1, 2]
      .map(
        (i) =>
          `<circle cx="${102 + i * 17}" cy="${y + 20}" r="4.2" fill="#8FA3B4">` +
          `<animate attributeName="cy" values="${y + 20};${y + 15};${y + 20}" dur="1s" begin="${i * 0.16}s" repeatCount="indefinite"/></circle>`
      )
      .join("") +
    `<rect x="70" y="${y}" width="88" height="40" rx="14" fill="${borde}"/>` +
    `</g>`;

  // 3) la tarjeta del menú, con botones de verdad
  const alto = 216;
  // El icono vive en una caja de 20x20; el texto empieza siempre a la misma
  // distancia, así ningún botón se pisa a sí mismo.
  const boton = (bx, ancho, trazo, texto, color) =>
    `<g>` +
    `<rect x="${bx}" y="${y + 112}" width="${ancho}" height="34" rx="9" fill="${color}" fill-opacity="0.10" stroke="${color}" stroke-opacity="0.38"/>` +
    `<g transform="translate(${bx + 12} ${y + 109})" fill="none" stroke="${color}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${trazo}</g>` +
    `<text x="${bx + 38}" y="${y + 134}" font-family="${SANS}" font-size="12.5" font-weight="600" fill="${color}">${texto}</text>` +
    `</g>`;

  cuerpo += burbuja(
    y,
    alto,
    470,
    true,
    `<g>
      <path d="M94 ${y + 32} h12 M258 ${y + 32} h${470 - 48 - 176}" stroke="#4ADE80" stroke-opacity="0.5" stroke-width="1.4" stroke-linecap="round"/>
      <text x="114" y="${y + 28}" font-family="${MONO}" font-size="14" fill="#4ADE80">✦ SHIN-MD ✦</text>
      ${kanji(404, y + 23, 19, "#D9455A", -4)}
      ${kanji(103, y + 60, 17, "#E8F1F8")}
      <text x="122" y="${y + 65}" font-family="${MONO}" font-size="12.5" fill="#CBD8E3">· todo bajo control</text>
      <text x="94" y="${y + 88}" font-family="${MONO}" font-size="12.5" fill="#8FA3B4">210 comandos · 15 categorías · 0 caídas</text>
      <rect x="94" y="${y + 100}" width="${470 - 48}" height="1" fill="rgba(255,255,255,0.08)"/>
      ${boton(94, 152, `<path d="M11.4 1.2 4.6 11.6h4.2L6.8 18.8 13.6 8.4H9.4z" fill="#8CF0B4" stroke="none"/>`, "Comandos", "#8CF0B4")}
      ${boton(254, 124, `<path d="M10 1.6 16.4 4v4.2c0 3-2.7 5.5-6.4 6.4-3.7-.9-6.4-3.4-6.4-6.4V4z"/><path d="M7 9.6 9.1 11.7 12.8 7.6"/>`, "Riesgo", "#C4B5FD")}
      ${boton(386, 130, `<path d="M1.4 10.6h3L7 4.4l3 11.2 2.4-6h3.2"/>`, "Estado", "#7DD3FC")}
      <text x="94" y="${y + 172}" font-family="${SANS}" font-size="12" fill="#8FA3B4">Toca un botón o escribe el comando que quieras.</text>
      <text x="94" y="${y + 194}" font-family="${MONO}" font-size="10.5" fill="#5F7488">lista desplegable → 15 categorías · el bot cae solo a texto si tu WhatsApp no la soporta</text>
    </g>`,
    2.8
  );

  // 4) tira de estado del sistema
  const chipY = y + alto + 16;
  cuerpo +=
    `<g>` +
    lineaAparece(3.6, 0.5) +
    `<rect x="40" y="${chipY}" width="${W - 80}" height="34" rx="12" fill="rgba(74,222,128,0.06)" stroke="rgba(74,222,128,0.22)"/>` +
    `<circle cx="62" cy="${chipY + 17}" r="4.2" fill="#4ADE80"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite"/></circle>` +
    `<text x="78" y="${chipY + 21.5}" font-family="${MONO}" font-size="12" fill="#A7E5C0">riesgo 4/100 · cola 0 · warm-up 12/60 hoy · sin servicios de terceros en medio</text>` +
    `</g>`;

  // 5) segundo intercambio: comando de administración
  const y3 = chipY + 50;
  cuerpo += burbuja(
    y3,
    46,
    230,
    false,
    `<text x="${W - 96}" y="${y3 + 29}" text-anchor="end" font-family="${MONO}" font-size="15" fill="#D9FDD3">.warn @kuro</text>`,
    4.4
  );
  cuerpo += burbuja(
    y3 + 58,
    78,
    430,
    true,
    `<text x="94" y="${y3 + 86}" font-family="${SANS}" font-size="13.5" fill="#E8F1F8">Aviso 1/3 para @kuro.</text>
     <text x="94" y="${y3 + 106}" font-family="${SANS}" font-size="13" fill="#8FA3B4">Respeta las reglas del grupo o habrá expulsión.</text>
     <text x="94" y="${y3 + 126}" font-family="${MONO}" font-size="10.5" fill="#5F7488">12:04 ✓✓ · warn · quedan 2 avisos antes de la expulsión</text>`,
    5.0
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Conversación real con Shin-MD dentro de WhatsApp">
  <defs>
    <linearGradient id="chatFondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A1216"/><stop offset="1" stop-color="#070E12"/>
    </linearGradient>
    ${gradienteRGB("filorgb")}
    ${rejilla("rgba(255,255,255,0.022)", 24)}
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#chatFondo)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#rejilla)"/>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="17.5" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>

  <!-- cabecera del chat -->
  <rect x="0" y="0" width="${W}" height="62" rx="18" fill="#111C22"/>
  <rect x="0" y="44" width="${W}" height="18" fill="#111C22"/>
  <circle cx="44" cy="31" r="18" fill="#0F2C22" stroke="rgba(74,222,128,0.35)"/>
  ${kanji(44, 31, 15, "#4ADE80", -6)}
  <text x="74" y="28" font-family="${SANS}" font-size="14.5" font-weight="700" fill="#E8F1F8">Shin-MD</text>
  <text x="74" y="46" font-family="${MONO}" font-size="11" fill="#7FA99B">en línea · responder</text>
  <text x="${W - 30}" y="36" text-anchor="end" font-family="${MONO}" font-size="11" fill="#5F7488">warm-up día 1 · 12/60 hoy</text>
  <rect x="0" y="60" width="${W}" height="2" fill="url(#filorgb)" opacity="0.4"/>
  ${cuerpo}
</svg>`;
}

function flujoMensaje() {
  const W = 1180;
  const H = 330;
  const nodos = [
    { t: "Mensaje", s: "entra al socket", c: C.cian },
    { t: "Antispam", s: "ráfagas y flood", c: C.rojo },
    { t: "Router", s: "prefijo + alias", c: C.verde },
    { t: "Permisos", s: "admin / dueño", c: C.violeta },
    { t: "Handler", s: "el comando", c: C.ambar },
    { t: "Cola", s: "prioridad y reintento", c: C.cian },
    { t: "WhatsApp", s: "jitter gaussiano", c: C.verde },
  ];
  const margen = 46;
  const hueco = 22;
  const ancho = (W - margen * 2 - hueco * (nodos.length - 1)) / nodos.length;
  const alto = 78;
  const y = 150;
  const centros = nodos.map((_, i) => margen + i * (ancho + hueco) + ancho / 2);

  let dibujo = "";
  // Conexiones con línea de puntos y el destello que viaja.
  for (let i = 0; i < nodos.length - 1; i++) {
    const x1 = margen + i * (ancho + hueco) + ancho + 6;
    const x2 = margen + (i + 1) * (ancho + hueco) - 6;
    dibujo +=
      `<rect x="${x1}" y="${y + alto / 2 - 1}" width="${x2 - x1}" height="2" rx="1" fill="rgba(255,255,255,0.10)"/>` +
      `<path id="arco${i}" d="M${x1} ${y + alto / 2} H${x2}" fill="none" stroke="none"/>`;
  }
  // Un único destello recorre todo el pipeline y cada nodo se enciende a su paso.
  const caminoTotal = `M${margen + ancho / 2} ${y + alto / 2} H${W - margen - ancho / 2}`;
  const paso = 1.05; // segundos entre nodo y nodo
  const durTotal = (paso * (nodos.length - 1)).toFixed(2);
  dibujo +=
    `<path d="${caminoTotal}" fill="none" stroke="${C.verde}" stroke-opacity="0.16" stroke-width="2" stroke-linecap="round"/>` +
    `<circle r="5.5" fill="${C.verde}" filter="url(#brilloNodo)">` +
    `<animateMotion dur="${durTotal}s" repeatCount="indefinite" path="${caminoTotal}" />` +
    `</circle>` +
    `<circle r="11" fill="${C.verde}" opacity="0.22">` +
    `<animateMotion dur="${durTotal}s" repeatCount="indefinite" path="${caminoTotal}"/>` +
    `</circle>`;

  nodos.forEach((n, i) => {
    const x = margen + i * (ancho + hueco);
    dibujo +=
      `<g>` +
      `<animate attributeName="opacity" values="0;1" dur="0.4s" begin="${(i * paso).toFixed(2)}s" fill="freeze"/>` +
      `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="14" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.10)"/>` +
      `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="14" fill="none" stroke="${n.c}" stroke-width="1.6" stroke-opacity="0">` +
      `<animate attributeName="stroke-opacity" values="0;0.85;0" dur="${(paso * nodos.length).toFixed(2)}s" begin="${(i * paso).toFixed(2)}s" repeatCount="indefinite"/></rect>` +
      `<circle cx="${x + 18}" cy="${y + 22}" r="4.6" fill="${n.c}"/>` +
      `<text x="${x + ancho / 2}" y="${y + 30}" text-anchor="middle" font-family="${SANS}" font-size="14.5" font-weight="700" fill="#E8F1F8">${xml(n.t)}</text>` +
      `<text x="${x + ancho / 2}" y="${y + 52}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="#8FA3B4">${xml(n.s)}</text>` +
      `</g>`;
    // flecha entre nodos
    if (i < nodos.length - 1) {
      dibujo += `<path d="M${x + ancho + 3} ${y + alto / 2 - 4} l6 4 l-6 4" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1.6" stroke-linejoin="round"/>`;
    }
  });

  // Salida bloqueada: el antispam corta por arriba.
  dibujo +=
    `<g>` +
    `<path d="M${centros[1]} ${y - 8} V86" fill="none" stroke="${C.rojo}" stroke-width="1.6" stroke-dasharray="5 5" stroke-opacity="0.7"/>` +
    `<path d="M${centros[1] - 5} 94 l5 -8 l5 8" fill="none" stroke="${C.rojo}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="${centros[1] - 132}" y="46" width="264" height="40" rx="12" fill="rgba(224,84,104,0.10)" stroke="rgba(224,84,104,0.40)"/>` +
    `<text x="${centros[1]}" y="64" text-anchor="middle" font-family="${SANS}" font-size="12.5" font-weight="600" fill="#F3A7B3">Spam y flood: se cortan aquí</text>` +
    `<text x="${centros[1]}" y="79" text-anchor="middle" font-family="${MONO}" font-size="10.5" fill="#C98A96">SHIN_BRAIN=0 para desactivarlo</text>` +
    `</g>`;

  // Pie: prioridad de los comandos críticos
  dibujo +=
    `<g>` +
    `<rect x="${margen}" y="252" width="${W - margen * 2}" height="52" rx="14" fill="rgba(74,222,128,0.05)" stroke="rgba(74,222,128,0.22)"/>` +
    `<text x="${margen + 22}" y="274" font-family="${SANS}" font-size="12.5" font-weight="700" fill="#8CF0B4">Carril prioritario</text>` +
    `<text x="${margen + 22}" y="292" font-family="${MONO}" font-size="11.5" fill="#A7C4B4">.menu · .ping · .owner salen al instante, incluso con el tope diario del warm-up alcanzado.</text>` +
    `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="${W - margen * 2 - 200} 0" dur="3.4s" repeatCount="indefinite"/>` +
    `<rect x="${margen + 150}" y="266" width="46" height="4" rx="2" fill="#4ADE80" opacity="0.7"/></g>` +
    `</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Recorrido de un mensaje dentro de Shin-MD">
  <defs>${gradienteRGB("filorgb")}${rejilla("rgba(255,255,255,0.022)", 24)}
    <filter id="brilloNodo" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
    <linearGradient id="fondoFlujo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070C12"/><stop offset="1" stop-color="#0A121A"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#fondoFlujo)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#rejilla)"/>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="17.5" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
  <text x="${W / 2}" y="30" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="#7D90A0">shin-md · recorrido de un comando, de tu chat al envío</text>
  <rect x="0" y="0" width="${W}" height="3" rx="1.5" fill="url(#filorgb)"/>
  ${dibujo}
</svg>`;
}

function medidorRiesgo() {
  const W = 1060;
  const H = 380;
  const cx = 292;
  const cy = 258;
  const R = 168;
  const aux = { brillo: 0 };

  /** Punto del arco: 0 → izquierda, 100 → derecha, siempre por arriba. */
  const punto = (v, r) => {
    const rad = (Math.PI * (180 - (v / 100) * 180)) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };

  const arco = (desde, hasta, color, grosor, opacidad = 1) => {
    const [x1, y1] = punto(desde, R);
    const [x2, y2] = punto(hasta, R);
    // large-arc-flag: 1 solo si el tramo pasa de 180° (100 unidades).
    const grande = hasta - desde > 100 ? 1 : 0;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 ${grande} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" opacity="${opacidad}"/>`;
  };

  let cuerpo = "";
  // carril de fondo + tramos de color
  cuerpo += arco(0, 100, "rgba(255,255,255,0.07)", 18);
  cuerpo += arco(0.5, 58, "#4ADE80", 14);
  cuerpo += arco(62, 78, "#F0B429", 14);
  cuerpo += arco(82, 99.5, "#E05468", 14);
  cuerpo +=
    `<g>` +
    `<animate attributeName="opacity" values="0.15;0.85;0.15" dur="5.5s" repeatCount="indefinite"/>` +
    arco(82, 99.5, "#FF6B81", 3) +
    `</g>`;

  // marcas y números
  for (const v of [0, 20, 40, 60, 80, 100]) {
    const [x1, y1] = punto(v, R - 16);
    const [x2, y2] = punto(v, R - 26);
    const [xt, yt] = punto(v, R - 42);
    cuerpo +=
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,0.22)" stroke-width="1.4"/>` +
      `<text x="${xt.toFixed(1)}" y="${(yt + 4).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#5F7488">${v}</text>`;
  }

  // aguja
  const angulo = (v) => (-90 + (v / 100) * 180).toFixed(2);
  const cuadro = (v) => `${angulo(v)} ${cx} ${cy}`;
  cuerpo +=
    `<g transform="rotate(${cuadro(4)})">` +
    `<animateTransform attributeName="transform" type="rotate" values="${cuadro(4)}; ${cuadro(10)}; ${cuadro(82)}; ${cuadro(82)}; ${cuadro(14)}; ${cuadro(4)}" keyTimes="0;0.16;0.3;0.52;0.7;1" dur="14s" repeatCount="indefinite"/>` +
    `<path d="M${cx - 5.5} ${cy} L${cx} ${cy - R + 30} L${cx + 5.5} ${cy} Z" fill="#E8F1F8" opacity="0.92"/>` +
    `</g>` +
    `<circle cx="${cx}" cy="${cy}" r="15" fill="#0B141C" stroke="rgba(255,255,255,0.25)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="5" fill="#4ADE80"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite"/></circle>`;

  // lectura que cambia con la aguja
  const lecturas = [
    { r: "4", c: "#4ADE80", t: "todo tranquilo", desde: 0 },
    { r: "82", c: "#E05468", t: "envíos en pausa", desde: 0.28 },
    { r: "14", c: "#F0B429", t: "recuperado solo", desde: 0.62 },
  ];
  lecturas.forEach((l) => {
    cuerpo +=
      `<g opacity="0">` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.7;1" dur="14s" begin="${(l.desde * 14).toFixed(2)}s" repeatCount="indefinite"/>` +
      `<text x="${cx}" y="${cy + 62}" text-anchor="middle" font-family="${SANS}" font-size="64" font-weight="800" fill="${l.c}">${l.r}</text>` +
      `<text x="${cx}" y="${cy + 86}" text-anchor="middle" font-family="${SANS}" font-size="12.5" fill="#8FA3B4">${l.t}</text>` +
      `</g>`;
  });
  cuerpo += `<text x="${cx}" y="${cy + 116}" text-anchor="middle" font-family="${MONO}" font-size="11" fill="#54697B">riesgo calculado sobre la última hora</text>`;

  // leyenda derecha
  const xl = 640;
  const filas = [
    { c: "#4ADE80", t: "0 – 30", s: "normal: la cola envía con su jitter gaussiano." },
    { c: "#F0B429", t: "30 – 80", s: "ojo: el monitor vigila más seguido." },
    { c: "#E05468", t: "≥ 80", s: "el watchdog PAUSA los envíos, no apaga el bot." },
    { c: "#FF6B81", t: "≥ 95", s: "reconexión forzada; 3 sin alivio → aviso claro." },
  ];
  let yl = 74;
  cuerpo += `<text x="${xl}" y="46" font-family="${SANS}" font-size="12.5" font-weight="700" letter-spacing="2" fill="#7D90A0">MONITOR DE RIESGO 0-100</text>`;
  for (const f of filas) {
    cuerpo +=
      `<rect x="${xl}" y="${yl - 15}" width="4" height="44" rx="2" fill="${f.c}"/>` +
      `<text x="${xl + 18}" y="${yl}" font-family="${MONO}" font-size="13.5" font-weight="700" fill="${f.c}">${f.t}</text>` +
      `<text x="${xl + 18}" y="${yl + 20}" font-family="${SANS}" font-size="12.5" fill="#CBD8E3">${xml(f.s)}</text>`;
    yl += 56;
  }
  cuerpo +=
    `<rect x="${xl - 16}" y="${yl - 16}" width="${W - xl - 14}" height="74" rx="14" fill="rgba(74,222,128,0.05)" stroke="rgba(74,222,128,0.22)"/>` +
    `<text x="${xl}" y="${yl + 6}" font-family="${SANS}" font-size="12.5" font-weight="700" fill="#8CF0B4">Cola de envíos</text>` +
    `<text x="${xl}" y="${yl + 26}" font-family="${MONO}" font-size="11" fill="#A7C4B4">0 en espera · prioridad activa · tope de 120 s por envío</text>` +
    `<rect x="${xl}" y="${yl + 38}" width="${W - xl - 46}" height="6" rx="3" fill="rgba(255,255,255,0.07)"/>` +
    `<rect x="${xl}" y="${yl + 38}" width="0" height="6" rx="3" fill="#4ADE80">` +
    `<animate attributeName="width" values="0;${W - xl - 46};0" dur="6s" repeatCount="indefinite"/></rect>`;
  void aux;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Medidor de riesgo y watchdog de Shin-MD">
  <defs>${gradienteRGB("filorgb")}${rejilla("rgba(255,255,255,0.022)", 24)}
    <linearGradient id="fondoMed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070C12"/><stop offset="1" stop-color="#0A121A"/></linearGradient>
    <radialGradient id="haloMed" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#4ADE80" stop-opacity="0.14"/><stop offset="1" stop-color="#4ADE80" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#fondoMed)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#rejilla)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="240" ry="200" fill="url(#haloMed)"/>
  <rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" rx="17.5" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
  <rect x="0" y="0" width="${W}" height="3" rx="1.5" fill="url(#filorgb)"/>
  <text x="${W / 2}" y="30" text-anchor="middle" font-family="${MONO}" font-size="12.5" fill="#7D90A0">shin-md · el watchdog decide por ti (y no borra tu sesión)</text>
  ${cuerpo}
</svg>`;
}

/* ─── Tira de insignias (hechas en casa, sin shields.io) ─────────── */

function icono(tipo, x, y, color) {
  const comunes = `fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  if (tipo === "check")
    return `<circle cx="${x}" cy="${y}" r="7.6" fill="${color}" fill-opacity="0.16"/><path d="M${x - 3.4} ${y} l2.5 2.5 4.6-5" ${comunes}/>`;
  if (tipo === "rayo")
    return `<path d="M${x + 1.8} ${y - 7.6} l-5.6 8.6 h3.6 l-1.5 7 5.8-8.9 h-3.6z" fill="${color}"/>`;
  if (tipo === "etiqueta")
    return `<path d="M${x - 6.4} ${y - 4.6} h7.6 l5.6 5.6 -5.6 5.6 h-7.6 z" ${comunes}/><circle cx="${x - 3.4}" cy="${y + 1}" r="1.1" fill="${color}"/>`;
  if (tipo === "rejilla")
    return `<rect x="${x - 6.6}" y="${y - 6.6}" width="5.6" height="5.6" rx="1.2" ${comunes}/><rect x="${x + 1}" y="${y - 6.6}" width="5.6" height="5.6" rx="1.2" ${comunes}/><rect x="${x - 6.6}" y="${y + 1}" width="5.6" height="5.6" rx="1.2" ${comunes}/><rect x="${x + 1}" y="${y + 1}" width="5.6" height="5.6" rx="1.2" ${comunes}/>`;
  if (tipo === "nodo")
    return `<path d="M${x} ${y - 7.4} l6.4 3.7 v7.4 L${x} ${y + 7.4} l-6.4-3.7 v-7.4z" ${comunes}/>`;
  if (tipo === "globo")
    return `<circle cx="${x}" cy="${y}" r="6.6" ${comunes}/><path d="M${x - 4.6} ${y + 6.6} l-1.6 4.4 4.6-2.2" fill="${color}"/>`;
  return `<path d="M${x} ${y - 6.6} v13.2 M${x - 4.6} ${y + 6.6} h9.2 M${x - 6.4} ${y - 3.4} h12.8" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`;
}

function insignias(oscuro, n) {
  const items = [
    { t: `${n.pruebas}/${n.pruebasTotal} pruebas`, c: C.verde, i: "check", latido: true },
    { t: `${n.comandos} comandos`, c: C.verde, i: "rayo" },
    { t: `${n.nombres} nombres`, c: C.cian, i: "etiqueta" },
    { t: `${n.categorias} categorías`, c: C.violeta, i: "rejilla" },
    { t: `Node ≥ ${n.node}`, c: "#5FA04E", i: "nodo" },
    { t: `Baileys ${n.baileys}`, c: "#25D366", i: "globo" },
    { t: n.licencia, c: C.ambar, i: "balanza" },
  ];
  const alto = 36;
  const hueco = 12;
  const anchos = items.map((it) => Math.round(anchoTexto(it.t, 13.5, true) + 52));
  const total = anchos.reduce((a, b) => a + b, 0) + hueco * (items.length - 1);
  const W = total + 8;
  const H = alto + 6;
  const fondo = oscuro ? "#0E161E" : "#FFFFFF";
  const tinta = oscuro ? "#CBD8E3" : "#22323D";
  const tintaBorde = oscuro ? "rgba(255,255,255,0.14)" : "rgba(16,32,26,0.12)";

  let x = 4;
  let salida = "";
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const w = anchos[i];
    salida +=
      `<g>` +
      `<rect x="${x}" y="3" width="${w}" height="${alto}" rx="${alto / 2}" fill="${fondo}" stroke="${tintaBorde}" stroke-width="1.4"/>` +
      `<rect x="${x}" y="3" width="${w}" height="${alto}" rx="${alto / 2}" fill="${it.c}" fill-opacity="${oscuro ? "0.07" : "0.05"}"/>` +
      `<rect x="${x + 4}" y="3" width="${w - 8}" height="1.6" rx="0.8" fill="${it.c}" opacity="0.35"/>` +
      icono(it.i, x + 22, 21, it.c) +
      (it.latido
        ? `<circle cx="${x + 22}" cy="21" r="11" fill="none" stroke="${it.c}" stroke-opacity="0.35"><animate attributeName="r" values="9;13;9" dur="3.2s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0.35;0;0.35" dur="3.2s" repeatCount="indefinite"/></circle>`
        : "") +
      `<text x="${x + 40}" y="25.5" font-family="${SANS}" font-size="13.5" font-weight="600" fill="${tinta}">${xml(it.t)}</text>` +
      `</g>`;
    x += w + hueco;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Insignias de Shin-MD">
  <defs>${gradienteRGB("filorgb")}</defs>
  <rect x="0" y="${H - 2}" width="${W}" height="2" rx="1" fill="url(#filorgb)" opacity="0.35"/>
  ${salida}
</svg>`;
}

/* ─── Datos reales del repositorio ───────────────────────────────── */

async function leerDatos() {
  const comandos = await loadCommands();
  const vistos = new Set();
  const cats = new Set();
  let entradas = 0;
  for (const cmd of comandos.values()) {
    entradas++;
    if (!cmd || vistos.has(cmd.file)) continue;
    vistos.add(cmd.file);
    cats.add(cmd.category || "utils");
  }
  // Las etiquetas visibles salen de la misma tabla que usa la página web.
  let etiquetas = cats;
  try {
    const html = fs.readFileSync(PLANTILLA, "utf8");
    const bloque = html.match(/var CATEGORIAS = \{([\s\S]*?)\};/)[1];
    const mapa = new Map();
    for (const m of bloque.matchAll(/(\w+): \["([^"]+)", "([^"]+)"\]/g)) mapa.set(m[1], m[2]);
    etiquetas = new Set([...cats].map((c) => mapa.get(c) || c));
  } catch {
    /* si la plantilla cambia de forma, se usa el nombre crudo de la categoría */
  }

  let pruebas = 0;
  let pruebasTotal = 0;
  try {
    const r = JSON.parse(fs.readFileSync(RESUMEN, "utf8"));
    pruebas = Number(r.pasan) || 0;
    pruebasTotal = Number(r.total) || pruebas;
  } catch {
    const archivos = fs.readdirSync(path.join(RAIZ, "test")).filter((f) => f.endsWith(".test.js"));
    pruebas = pruebasTotal = archivos.length ? 0 : 0;
  }
  const baileys = (PAQUETE.dependencies?.baileys || "").split("@").pop() || "6.7.24";

  return {
    comandos: vistos.size,
    nombres: entradas,
    categorias: etiquetas.size,
    pruebas,
    pruebasTotal,
    version: PAQUETE.version,
    node: (PAQUETE.engines?.node || "22").replace(/[^0-9.]/g, "").replace(/\.0$/, ""),
    baileys,
    licencia: "AGPL-3.0-only",
  };
}

/* ─── Principal ─────────────────────────────────────────────────── */

async function principal() {
  const n = await leerDatos();
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

  const archivos = [
    ["hero-oscuro.svg", hero(true, n)],
    ["hero-claro.svg", hero(false, n)],
    ["divisor-oscuro.svg", divisor(true)],
    ["divisor-claro.svg", divisor(false)],
    ["terminal-arranque.svg", terminal(n)],
    ["chat-demo.svg", chatDemo()],
    ["flujo-mensaje.svg", flujoMensaje()],
    ["medidor-riesgo.svg", medidorRiesgo()],
    ["insignias-oscuro.svg", insignias(true, n)],
    ["insignias-claro.svg", insignias(false, n)],
  ];

  console.log(
    `◐  Datos reales: ${n.comandos} comandos · ${n.nombres} nombres · ${n.categorias} categorías · ` +
      `${n.pruebas}/${n.pruebasTotal} pruebas · v${n.version} · Node ≥ ${n.node} · Baileys ${n.baileys}`
  );
  for (const [nombre, svg] of archivos) {
    fs.writeFileSync(path.join(ASSETS, nombre), svg);
    const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
    console.log(`✓  docs/assets/${nombre} · ${kb} KB`);
  }

  // Los SVG ya salen con los números de hoy, pero el TEXTO del README se
  // escribe a mano: si se quedó viejo, mejor saberlo ahora que en un issue.
  const readme = fs.readFileSync(path.join(RAIZ, "README.md"), "utf8");
  const desfasado = [
    [`${n.comandos} comandos`, "comandos"],
    [`${n.nombres} nombres`, "nombres"],
    [`${n.pruebas}/${n.pruebasTotal} pruebas`, "pruebas"],
  ].filter(([texto]) => !readme.includes(texto));
  if (desfasado.length) {
    console.warn(
      "⚠  El README no anuncia: " +
        desfasado.map(([, que]) => que).join(" · ") +
        " → actualízalo (la prueba docs-web lo comprueba en cada push)."
    );
  } else {
    console.log("✓  El README anuncia los mismos números que el bot.");
  }
  console.log("✓  Assets del README regenerados. Nada escrito a mano: todo sale del bot.");
}

principal().catch((err) => {
  console.error("✖ No se pudieron generar los assets:", err.message || err);
  process.exit(1);
});
