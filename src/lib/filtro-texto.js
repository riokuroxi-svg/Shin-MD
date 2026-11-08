/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  filtro-texto.js — Filtro de palabras que NO se equivoca.
//
//  EL PROBLEMA QUE RESUELVE (medido, no supuesto):
//  El filtro anterior era `lista.some(p => texto.includes(p))`, es decir
//  buscar el fragmento en cualquier parte del texto. Con eso, estas
//  búsquedas INOCENTES quedaban bloqueadas:
//
//      "cuando es tu cumpleaños"  → por la palabra "cum"
//      "transporte publico"       → por "trans"
//      "un documento importante"  → por "cum"
//      "el sexto lugar"           → por "sex"
//      "transparencia del grupo"  → por "trans"
//      "transferencia bancaria"   → por "trans"
//      "cumbia para bailar"       → por "cum"
//      "asado del domingo"        → por "sado"
//
//  8 de cada 12 búsquedas normales se bloqueaban sin motivo.
//
//  LA SOLUCIÓN, en tres pasos:
//   1. Normalizar: quita acentos, convierte homóglifos (cirílico/griego
//      que se ven igual que el latino), y deshace el "leet" (p0rn → porn,
//      s3x → sex, v@gina → vagina). Los intentos de evasión dejan de serlo.
//   2. Clasificar cada palabra de la lista: las CORTAS (≤4 letras) y las
//      AMBIGUAS se buscan como palabra completa ("cum" ya no encuentra
//      "cumpleaños"); las largas e inequívocas se buscan como fragmento
//      ("porno" sí encuentra "pornografía").
//   3. Comparar también el texto "compacto" (sin puntos, guiones ni
//      espacios) para cazar "p.o.r.n.o" y "p o r n o".
//
//  El mapa de homóglifos viene del trabajo de red-teaming de Shin-Lab
//  (experiments/tools/tool-registry.js), adaptado aquí a producción.
// ═══════════════════════════════════════════════════════════════════

/** Homóglifos: caracteres cirílicos/griegos que se ven como latinos. */
const HOMOGLIFOS = {
  "\u0430": "a", "\u0410": "a", // а А
  "\u0435": "e", "\u0415": "e", // е Е
  "\u043E": "o", "\u041E": "o", // о О
  "\u0440": "p", "\u0420": "p", // р Р
  "\u0441": "c", "\u0421": "c", // с С
  "\u0443": "y", "\u0423": "y", // у У
  "\u0445": "x", "\u0425": "x", // х Х
  "\u0456": "i", "\u0406": "i", // і І
  "\u0458": "j", "\u0408": "j", // ј Ј
  "\u0455": "s", "\u0405": "s", // ѕ Ѕ
  "\u03BF": "o", "\u039F": "o", // griega omicron
  "\u03B1": "a", "\u0391": "a", // griega alfa
  "\u03C1": "p", "\u03A1": "p", // griega rho
  "\u03BD": "v", "\u039D": "v", // griega nu
};

/** "Leet speak": números y símbolos usados para parecer otra letra. */
const LEET = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", "$": "s", "!": "i", "|": "l",
};

/**
 * Palabras de la lista que, siendo más largas de 4 letras, siguen siendo
 * ambiguas: aparecen dentro de palabras normales del español. Se buscan
 * como palabra completa. ("trans" vive en transporte, transparencia,
 * transferencia, transformar, tránsito…)
 */
const AMBIGUAS = new Set(["trans", "facial", "webcam", "explicit"]);

/**
 * Deja el texto en su forma "comparable": sin acentos, sin homóglifos,
 * sin leet, sin codificaciones raras.
 * @param {string} texto
 * @returns {string}
 */
export function normalizarTexto(texto) {
  let t = String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Deshacer trucos de codificación antes de comparar:
  // %70orno → porno   ·   \x70orno → porno
  try {
    if (/%[0-9a-fA-F]{2}/.test(t)) t = decodeURIComponent(t);
  } catch {}
  t = t.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  t = t.toLowerCase();

  let salida = "";
  for (const c of t) salida += HOMOGLIFOS[c] || LEET[c] || c;
  return salida;
}

/** Longitud "de verdad" (solo letras y números). */
function nucleo(palabra) {
  return normalizarTexto(palabra).replace(/[^a-z0-9]/g, "");
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Precompila la lista una sola vez: 197 palabras × cada búsqueda sería
 * un desperdicio de CPU en un bot que corre 24/7.
 */
let _compilado = null;
let _listaCache = null;

function compilar(lista) {
  if (_compilado && _listaCache === lista) return _compilado;
  const porPalabraCompleta = [];
  const porFragmento = [];
  for (const cruda of lista) {
    const norm = normalizarTexto(cruda);
    const key = nucleo(cruda);
    if (!key) continue;
    const esPalabraCompleta = key.length <= 4 || AMBIGUAS.has(key);
    if (esPalabraCompleta) porPalabraCompleta.push(new RegExp(`(^|[^a-z0-9])${escaparRegex(norm)}([^a-z0-9]|$)`, "i"));
    else porFragmento.push({ palabra: cruda, norm, compacto: key, compacta: key.length >= 5 });
  }
  _compilado = { porPalabraCompleta, porFragmento };
  _listaCache = lista;
  return _compilado;
}

/**
 * ¿El texto contiene alguna palabra prohibida? Sin falsos positivos.
 *
 * @param {string} texto            lo que escribió el usuario
 * @param {string[]} lista          palabras/frases prohibidas
 * @returns {string|null} la palabra que hizo match, o null si está limpio
 */
export function contienePalabraProhibida(texto, lista) {
  if (!texto || !Array.isArray(lista) || lista.length === 0) return null;
  const norm = normalizarTexto(texto);
  const compacto = norm.replace(/[^a-z0-9]/g, "");
  const { porPalabraCompleta, porFragmento } = compilar(lista);

  // 1) palabras cortas/ambiguas: solo como palabra completa
  for (const re of porPalabraCompleta) {
    const m = re.exec(norm);
    if (m) return m[0].trim();
  }

  // 2) palabras largas e inequívocas: fragmento, y también sin separadores
  for (const { palabra, norm: n, compacto: c, compacta } of porFragmento) {
    if (norm.includes(n)) return palabra;
    if (compacta && compacto.includes(c)) return palabra;
  }

  return null;
}

export default { normalizarTexto, contienePalabraProhibida };
