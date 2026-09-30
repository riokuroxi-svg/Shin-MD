/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * auditar-html.mjs — Lo que prometieron las 8 maquetas, contra el código.
 *
 * Cada promesa trae la SEÑAL que demuestra que está viva: el nombre de
 * la función que un comando real tiene que llamar. Se busca en cmds/
 * (uso diario), luego en src/ (montado pero sin cablear). Sin señal en
 * ningún sitio, la promesa está sin cumplir y hay que decirlo.
 *
 *   node scripts/auditar-html.mjs            → tabla en pantalla
 *   node scripts/auditar-html.mjs --md ruta  → informe en markdown
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

function recoger(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) recoger(p, acc);
    else if (f.endsWith(".js")) acc.push(p);
  }
  return acc;
}

const FICHEROS = [...recoger("cmds"), ...recoger("src")];
const TEXTO = new Map(FICHEROS.map((f) => [f, readFileSync(f, "utf8")]));

/** Dónde aparece una señal, separando uso diario de solo-librería. */
function buscar(senal) {
  const enCmds = [], enSrc = [], enLab = [];
  for (const [f, s] of TEXTO) {
    if (!s.includes(senal)) continue;
    if (f.includes("lab")) enLab.push(f);
    else if (f.startsWith("cmds/")) enCmds.push(f);
    else enSrc.push(f);
  }
  return { enCmds, enSrc, enLab };
}

// origen · promesa · señal de que un COMANDO la usa · nota
const PROMESAS = [
  ["catálogo", "Menú con lista desplegable", "singleSelect("],
  ["catálogo", "Hoja inferior para >3 botones", "buildSheetParams|hoja:|buildBottomSheet"],
  ["catálogo", "Botones de respuesta rápida", "quickReply(|sendNativeQuickReply"],
  ["catálogo", "Banner con enlace (externalAdReply)", "externalAdReply"],
  ["catálogo", "Firma de canal / cita falsa", "getChannelContext"],
  ["catálogo", "Tema día y noche", "pickBanner"],
  ["catálogo", "Cuenta atrás en la tarjeta", "offerParams|buildLimitedTimeOffer"],
  ["catálogo", "Progreso que se edita solo", "createProgress"],
  ["catálogo", "Panel de pasos de razonamiento", "createNativeSteps|sendSteps"],
  ["catálogo", "Evento con asistencia", "buildEventContent"],
  ["catálogo", "Vídeo redondo (PTV)", "ptv: true"],
  ["catálogo", "Álbum de fotos", "sendAlbum"],
  ["catálogo", "Quiz nativo con respuesta correcta", "sendQuiz"],
  ["catálogo", "Encuesta con foto por opción", "sendImagePoll"],
  ["catálogo", "Nota de voz con onda dibujada", "vestirAudio|sendVoiceArt"],
  ["catálogo", "Recordatorio nativo", "ctaReminder"],
  ["catálogo", "Fijar mensaje en el grupo", "buildPin"],
  ["catálogo", "Rescatar mensaje temporal", "buildKeep"],
  ["catálogo", "Copiar de un toque", "ctaCopy("],
  ["catálogo", "Abrir enlace desde botón", "ctaUrl("],
  ["catálogo", "Traductor propio", "sendTraduccion|traducir("],
  ["catálogo", "Detector de idioma sin red", "detectarIdioma"],
  ["catálogo", "Traducción automática del grupo", "idiomaDelChat"],
  ["catálogo", "Respuesta enriquecida (tablas, LaTeX, mapas)", "sendRich"],
  ["catálogo", "Webview dentro de WhatsApp", "ctaWebview"],
  ["catálogo", "Pedir datos / dirección", "address_message"],
  ["catálogo", "Llamada programada", "buildLlamadaProgramada"],
  ["catálogo", "Ubicación en vivo", "buildUbicacionViva"],
  ["catálogo", "Pagos, pedidos y facturas", "buildSolicitudPago|buildPedido|buildFactura"],
  ["maquetas", "Carrusel de tarjetas", "sendCarousel"],
  ["maquetas", "Menú que cambia con la hora", "pickBanner"],
  ["maquetas", "Miniatura en el audio/documento", "jpegThumbnail"],
  ["maquetas", "Tarjetas dibujadas por el bot", "generateProfileCard"],
  ["diseño", "Las tres cajas", "boxNotice|boxMain|boxData"],
  ["diseño", "Estados unificados del sistema", 'state("'],
  ["diseño", "Iconos por categoría", "categoryIcon"],
  ["diseño", "Pase de estilo a los comandos viejos", "estilizar("],
  ["diseño", "Rediseño de .owner", "sendNativeQuickReply"],
  ["diseño", "Rediseño de .pin", "DURACION_FIJADO"],
  ["diseño", "Rediseño de .play", "createProgress"],
  ["diseño", "Rediseño de .daily", "offerParams"],
  ["diseño", "Rediseño de .perfil y nivel", "boxData"],
];

const filas = PROMESAS.map(([origen, promesa, senales]) => {
  const partes = senales.split("|");
  const res = partes.map(buscar);
  const enCmds = [...new Set(res.flatMap((r) => r.enCmds))];
  const enSrc = [...new Set(res.flatMap((r) => r.enSrc))];
  const enLab = [...new Set(res.flatMap((r) => r.enLab))];
  const estado = enCmds.length ? "EN USO" : enSrc.length ? "MONTADO" : enLab.length ? "SOLO LAB" : "SIN HACER";
  return { origen, promesa, estado, donde: (enCmds.length ? enCmds : enSrc.length ? enSrc : enLab).slice(0, 3) };
});

const cuenta = filas.reduce((a, f) => ((a[f.estado] = (a[f.estado] || 0) + 1), a), {});

const ORDEN = { "EN USO": 0, MONTADO: 1, "SOLO LAB": 2, "SIN HACER": 3 };
filas.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.promesa.localeCompare(b.promesa));

for (const f of filas) console.log(`${f.estado.padEnd(10)} │ ${f.promesa.padEnd(46)} │ ${f.donde[0] || ""}`);
console.log("\n" + Object.entries(cuenta).map(([k, v]) => `${k}: ${v}`).join(" · ") + `  (de ${filas.length})`);

const destino = process.argv.includes("--md") ? process.argv[process.argv.indexOf("--md") + 1] : null;
if (destino) {
  const md = [
    "# Las maquetas contra el código",
    "",
    `Generado por \`scripts/auditar-html.mjs\` · ${filas.length} promesas.`,
    "",
    "| Estado | Promesa | Origen | Dónde vive |",
    "| --- | --- | --- | --- |",
    ...filas.map((f) => `| ${f.estado} | ${f.promesa} | ${f.origen} | \`${f.donde[0] || "—"}\` |`),
    "",
    "**EN USO** = lo llama un comando del día a día · **MONTADO** = la librería existe y está probada, "
    + "pero ningún comando la usa todavía · **SOLO LAB** = únicamente dentro de `.lab` · **SIN HACER** = no existe.",
    "",
  ].join("\n");
  writeFileSync(destino, md);
  console.log("\nInforme en " + destino);
}
