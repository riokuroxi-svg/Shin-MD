/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { pickRandom } from "#lib/random";
// ═══════════════════════════════════════════════════════════════════
//  theme.js — Sistema de diseño de Shin-MD (Tanda 1)
//
//  POR QUÉ EXISTE:
//  Hoy cada uno de los 205 comandos dibuja su caja, elige su emoji y
//  redacta su error como quiere. El bot se siente hecho por 10 personas
//  distintas, y cambiar el estilo obliga a tocar 205 archivos.
//  Aquí vive UNA sola definición de: paleta, iconos, cajas, tipografía,
//  pie de mensaje y estados del sistema. Todo lo demás bebe de aquí.
//
//  REGLA: este archivo NO envía nada y NO toca la red. Solo devuelve
//  texto y rutas. Así se puede probar entero sin abrir una sesión.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { toSmallCaps, toMathSansBold } from "#lib/formatter";

// ── Paleta ──────────────────────────────────────────────────────────
// Solo aplica a lo que DIBUJAMOS nosotros (tarjetas-imagen y banners).
// WhatsApp no permite pintar las burbujas del chat.
export const COLORS = Object.freeze({
  pink: "#FF4FA3",
  violet: "#C77DFF",
  cyan: "#7AD7FF",
  night: "#1A1030",
  ink: "#0B141A",
  success: "#6EE7A8",
  warning: "#FFB02E",
  danger: "#F15C6D",
  muted: "#8696A0",
  gradient: ["#FF4FA3", "#C77DFF", "#7AD7FF"],
});

// ── Iconografía ─────────────────────────────────────────────────────
// Un emoji fijo por categoría, igual en TODO el bot. El usuario aprende
// a leer el menú de reojo.
export const CATEGORY_ICONS = Object.freeze({
  downloads: "📥",
  economia: "💰",
  economy: "💰",
  fun: "🎮",
  games: "🎮",
  gacha: "🎴",
  main: "🏠",
  grupo: "👥",
  group: "👥",
  anime: "🎌",
  nsfw: "🔞",
  profile: "👤",
  sockets: "🔌",
  stickers: "🖼️",
  utils: "🛠️",
  owner: "👑",
  info: "💡",
});

export function categoryIcon(key) {
  return CATEGORY_ICONS[String(key || "").toLowerCase()] || "✦";
}

// ── Marca ───────────────────────────────────────────────────────────
export const BRAND = Object.freeze({
  name: "Shin-MD",
  kanji: "反魂",
  mark: "❦",
  footer: "❦ Shin-MD · 反魂",
});

// ── Tipografía ──────────────────────────────────────────────────────
// Regla: UN título grande por mensaje. Si todo grita, nada resalta.

/** Título principal del mensaje. Máximo uno por mensaje. */
export function title(text) {
  return toMathSansBold(String(text || "").toUpperCase());
}

/** Etiqueta de sección o categoría. */
export function label(text) {
  return toSmallCaps(String(text || ""));
}

/** Fila de dato: etiqueta en normal, valor en negrita. Siempre así. */
export function kv(name, value) {
  return `> ❖ ${name} › *${value}*`;
}

/** Nota secundaria (metadatos, ayudas). Baja el ruido visual. */
export function note(text) {
  return `> ${text}`;
}

/** Pie de mensaje estándar. */
export function footer(extra) {
  return extra ? `${BRAND.footer} · ${extra}` : BRAND.footer;
}

// ── Las tres cajas ──────────────────────────────────────────────────

/** Caja PRINCIPAL: menú, perfil, owner. La cara del bot. */
export function boxMain(head, lines = []) {
  const body = (Array.isArray(lines) ? lines : [lines])
    .filter(l => l !== null && l !== undefined && l !== "")
    .map(l => `┃ ${l}`)
    .join("\n");
  return `╭━━━〔 ${title(head)} 〕━━━╮\n${body}\n╰━━━━━━━━━━━━━━━╯`;
}

/** Caja DATOS: resultados y fichas de información. */
export function boxData(head, rows = []) {
  const body = (Array.isArray(rows) ? rows : [])
    .filter(r => Array.isArray(r) ? r[1] !== undefined && r[1] !== null && r[1] !== "" : !!r)
    .map(r => Array.isArray(r) ? `│ ❖ ${r[0]} › *${r[1]}*` : `│ ${r}`)
    .join("\n");
  return `┌─ ${label(head)}\n${body}\n└───────────────`;
}

/** Caja AVISO: errores, permisos, advertencias. */
export function boxNotice(icon, lines = []) {
  const body = (Array.isArray(lines) ? lines : [lines])
    .filter(Boolean)
    .map(l => `   ${l}`)
    .join("\n");
  return `${icon} ─────────────\n${body}\n─────────────────`;
}


// ── El pase de estilo ───────────────────────────────────────────────
//  El sistema de diseño estaba montado… y lo usaban 9 comandos de 212.
//  Los otros 101 seguían con su «《✧》» a mano, cada uno a su manera.
//  Reescribirlos de uno en uno es pedir que se rompa algo, así que el
//  pase se da en el punto único de envío: entra texto, sale texto con
//  la cara de la casa.
//
//  Reglas, a propósito cobardes (si hay duda, NO se toca):
//   · lo que ya usa una caja de la casa se deja tal cual
//   · lo que lleva bloques de código ``` se deja tal cual
//   · lo largo (más de 700 letras) se deja: son fichas, no avisos
//   · solo se reescribe el ADORNO de la primera línea, nunca el texto

/** Adornos que los comandos usaban de propia cosecha. */
const ADORNOS = /^\s*(《✧》|ꕥ|𖹭 ❀|𖹭|✎|✧|◈|❀|『.*?』|\[!\]|>>)\s*/u;

/** ¿Ya lleva la cara de la casa? */
export function yaTieneEstilo(texto = "") {
  return /^[╭┌]|^[^\n]{0,4}─────/.test(texto) || texto.includes("┃ ") || texto.includes("│ ❖");
}

/** Elige el icono por lo que dice el mensaje, no por lo que traía. */
function iconoPara(texto = "") {
  const t = texto.toLowerCase();
  if (/no se pudo|error|fall|inválid|invalid|no pude|no parece|no es válid/.test(t)) return "❌";
  if (/solo|permiso|admin|dueñ|owner|bloquead/.test(t)) return "🔒";
  if (/espera|aguarda|cooldown|demasiado rápido/.test(t)) return "🕐";
  if (/eliminad|guardad|actualizad|establecid|añadid|listo|hecho/.test(t)) return "✅";
  if (/responde a|envía|manda|escribe|ejemplo|se usa/.test(t)) return "💡";
  return "✦";
}

/**
 * Da el estilo de la casa a un texto suelto. Pura y sin sorpresas:
 * si no está segura de mejorar el mensaje, lo devuelve intacto.
 *
 * @param {string} texto
 * @returns {string}
 */
export function estilizar(texto) {
  if (typeof texto !== "string") return texto;
  const limpio = texto.trim();
  if (!limpio) return texto;
  if (limpio.length > 700) return texto;          // fichas y menús: suyos son
  if (limpio.includes("```")) return texto;        // código: ni tocarlo
  if (yaTieneEstilo(limpio)) return texto;         // ya es de la casa
  if (!ADORNOS.test(limpio)) return texto;         // sin adorno: no es un aviso

  const lineas = limpio.replace(ADORNOS, "").split("\n");
  const cabeza = lineas[0].trim();
  if (!cabeza) return texto;
  const resto = lineas.slice(1).map(l => l.trim()).filter(Boolean);
  return boxNotice(iconoPara(limpio), [cabeza, ...resto]);
}

// ── Estados del sistema ─────────────────────────────────────────────
// Antes cada comando redactaba su propio error. Ahora hay UNA forma de
// decir cada cosa, en español, corta y cálida (nunca "ERROR: invalid
// parameter"). Añadir un estado nuevo se hace aquí, no en 205 archivos.

const STATES = {
  denied:      (d) => boxNotice("🔒", [`Este comando es solo para *${d.who || "el owner"}*.`]),
  onlyOwner:   ()  => boxNotice("🔒", ["Este comando es solo para el *owner* del bot."]),
  onlyAdmin:   ()  => boxNotice("🔒", ["Este comando es solo para *admins* del grupo."]),
  onlyGroup:   ()  => boxNotice("👥", ["Este comando solo funciona *dentro de un grupo*."]),
  onlyPrivate: ()  => boxNotice("💬", ["Este comando solo funciona por *chat privado*."]),
  botNotAdmin: ()  => boxNotice("⚙️", ["Necesito ser *admin* del grupo para hacer eso.", "Dame admin e inténtalo de nuevo."]),
  cooldown:    (d) => `🕐 Espera *${d.seconds || 5}s* antes de volver a usar \`${d.command || "ese comando"}\`.`,
  loading:     (d) => `⏳ *${d.text || "Trabajando"}…*`,
  success:     (d) => `✅ ${d.text || "Listo."}`,
  notfound:    (d) => `🔍 No encontré *${d.what || "eso"}*.\n> ${d.hint || "Prueba con otro nombre."}`,
  needQuote:   (d) => boxNotice("💬", [`Responde al mensaje que quieres ${d.action || "usar"} y vuelve a escribir el comando.`]),
  usage:       (d) => `💡 Se usa así: \`${d.usage || ""}\`${d.example ? `\n> Ejemplo: \`${d.example}\`` : ""}`,
  error:       (d) => boxNotice("❌", ["Algo salió mal.", d.detail ? `_${String(d.detail).slice(0, 120)}_` : "Inténtalo de nuevo en un momento."]),
};

/**
 * Mensaje de estado unificado.
 * @param {string} kind  denied|onlyOwner|onlyAdmin|onlyGroup|onlyPrivate|
 *                       botNotAdmin|cooldown|loading|success|notfound|
 *                       needQuote|usage|error
 * @param {object} data  datos del estado (ver STATES)
 */
export function state(kind, data = {}) {
  const fn = STATES[kind];
  if (!fn) return STATES.error({ detail: `estado desconocido: ${kind}` });
  return fn(data || {});
}

/** Lista de estados disponibles (para pruebas y documentación). */
export function stateKinds() {
  return Object.keys(STATES);
}

// ── Banner según la hora ────────────────────────────────────────────
// Mismo comando, distinta cara de día y de noche. Cuesta cero mensajes.

const BANNER_DIR = path.join(process.cwd(), "media", "banners");
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

/** 'day' de 06:00 a 18:59, 'night' el resto. Hora local del servidor. */
export function bannerMode(date = new Date()) {
  const h = date.getHours();
  return h >= 6 && h < 19 ? "day" : "night";
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => IMG_EXT.test(f))
      .map(f => path.join(dir, f))
      .filter(p => { try { return fs.statSync(p).isFile(); } catch { return false; } })
      .sort();
  } catch { return []; }
}

/**
 * Todos los banners del modo indicado.
 *  1) media/banners/<modo>/*        → varios, para rotar
 *  2) media/banners/banner-<modo>.* → uno solo
 * Devuelve [] si no hay ninguno (el llamador conserva su respaldo).
 */
export function listBanners(mode = bannerMode()) {
  const carpeta = listFiles(path.join(BANNER_DIR, mode));
  if (carpeta.length) return carpeta;
  return listFiles(BANNER_DIR).filter(p => path.basename(p).toLowerCase().startsWith(`banner-${mode}`));
}

/**
 * Ruta de un banner para la hora actual, o null si no hay.
 * NUNCA lanza: si no hay banners, el comando sigue con su respaldo.
 */
export function pickBanner(mode = bannerMode()) {
  const lista = listBanners(mode);
  if (!lista.length) return null;
  return pickRandom(lista);
}

export default {
  COLORS, CATEGORY_ICONS, BRAND,
  categoryIcon, title, label, kv, note, footer,
  boxMain, boxData, boxNotice,
  estilizar, yaTieneEstilo,
  state, stateKinds,
  bannerMode, listBanners, pickBanner,
};
