#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  preview-consola.mjs — enseña la consola sin arrancar el bot.
//
//  Imprime, con los mismos módulos que usa el arranque real, lo que se ve
//  al vincular un número. Sirve para dos cosas:
//
//    · revisar el diseño sin tocar WhatsApp (ni sesión, ni red);
//    · probar cómo queda en un ancho concreto.
//
//  Uso:
//    node tools/preview-consola.mjs
//    node tools/preview-consola.mjs --ancho 40
//    node tools/preview-consola.mjs --sin-color        (lo que queda en un log)
//    node tools/preview-consola.mjs --html vista.html  (para abrirlo en el navegador)
// ═══════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const anchoArg = args.indexOf("--ancho");
const sinColor = args.includes("--sin-color");
const pedirColor = args.includes("--color");

// El color se decide ANTES de cargar la consola: chalk lee el entorno al
// importarse, y cambiarlo después no sirve de nada.
if (sinColor || (!process.stdout.isTTY && !pedirColor)) process.env.NO_COLOR = "1";
if (pedirColor) process.env.FORCE_COLOR = "3";

const ui = await import("../src/services/consola.js");

const ancho = anchoArg !== -1 ? Number(args[anchoArg + 1]) || ui.ANCHO : ui.ANCHO;

const version = JSON.parse(
  (await import("node:fs")).readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const partes = [
  ui.banner({ version, node: process.versions.node, plataforma: process.platform }),
  ui.panelVinculacion({ ancho }).join("\n"),
  ui.preguntaNumero() + "+52 1 55 7437 0309",
  ui.panelCodigo({ numero: "5215574370309", codigo: "QK4M-7XTP", ancho }),
  ui.estado("ok", "conector: 10 parches al día"),
  ui.estado("ok", "comandos: 213 únicos · 752 entradas con alias"),
  ui.estado("info", "web: http://127.0.0.1:3000"),
  ui.estado("aviso", "WhatsApp no responde todavía; reintento en 5 s"),
  "",
  ui.mensaje({ hora: "14:03:22", quien: "Ana", donde: "privado", texto: "hola, ¿el bot sigue vivo?" }),
  ui.mensaje({ hora: "14:03:29", quien: "Ana", donde: "Familia ❀", texto: ".menu", comando: true, ms: 118 }),
  ui.mensaje({ hora: "14:04:10", quien: "Luis", donde: "privado", texto: ".sticker", comando: true, ms: 402 }),
  "",
  ui.caja({
    titulo: "falta el dueño",
    color: ui.COLOR.ambar,
    lineas: [
      "así se ve si te falta configurar OWNER_NUMBER:",
      "",
      "1) cp .env.example .env",
      "2) escribe tu número en OWNER_NUMBER (solo dígitos)",
      "3) reinicia el bot",
    ],
    ancho,
  }).join("\n"),
  ui.panelListo({
    version,
    nombre: "Shin-MD",
    comandos: 213,
    prefijo: ".",
    web: "http://127.0.0.1:3000",
    ancho,
  }),
  ui.pieTeclas(),
  "",
];

// eslint-disable-next-line no-control-regex -- se quitan los colores para el log
const limpio = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

const htmlArg = args.indexOf("--html");
if (htmlArg !== -1) {
  // Volcado a HTML: mismo texto, mismos colores, para poder mirarlo en el
  // navegador (o mandarlo) sin depender de una terminal.
  const { writeFileSync } = await import("node:fs");
  const destino = args[htmlArg + 1] || "vista-consola.html";
  const lineas = partes.join("\n").split("\n").map((linea) => {
    if (!linea.trim()) return "\n";
    let salida = "";
    let abierto = null;
    // eslint-disable-next-line no-control-regex -- se leen los códigos de color
    for (const trozo of linea.split(/(\x1b\[[0-9;]*m)/)) {
      // eslint-disable-next-line no-control-regex -- idem
      const cod = trozo.match(/^\x1b\[([0-9;]*)m$/);
      if (cod) {
        if (abierto) salida += "</span>";
        abierto = null;
        const t = cod[1];
        if (t.startsWith("38;2;")) {
          const [, , r, g, b] = t.split(";");
          abierto = `rgb(${r},${g},${b})`;
          salida += `<span style="color:${abierto}">`;
        } else if (t === "1") {
          abierto = "bold";
          salida += '<span style="font-weight:700">';
        }
        continue;
      }
      if (trozo) salida += trozo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    if (abierto) salida += "</span>";
    return salida + "\n";
  });
  const html = `<!doctype html>
<meta charset="utf-8">
<title>Shin-MD · cómo se ve la consola</title>
<style>
  body { margin:0; background:#0E0716; display:flex; justify-content:center; padding:40px 16px; }
  pre {
    margin:0; padding:28px 30px; border-radius:16px; background:#150A20;
    box-shadow:0 24px 60px rgba(0,0,0,.55), inset 0 0 0 1px rgba(242,143,180,.12);
    font:26px/1.42 "DejaVu Sans Mono", "Cascadia Mono", Menlo, Consolas, monospace;
    font-variant-ligatures:none; color:#CFC6E0; white-space:pre; overflow:auto; max-width:100%;
  }
</style>
<pre>${lineas.join("")}</pre>
`;
  writeFileSync(destino, html, "utf8");
  console.log("vista escrita en " + destino);
} else {
  process.stdout.write((sinColor ? limpio(partes.join("\n")) : partes.join("\n")) + "\n");
}
