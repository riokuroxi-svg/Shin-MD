/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  #lib/translate — traducción con cara de WhatsApp
//
//  WhatsApp estrenó traducción en 2025, PERO:
//    · se hace entera en el móvil (packs de idioma descargados),
//    · en Android solo entre 6 idiomas: en, es, hi, pt, ru, ar,
//    · en WhatsApp Web no existe,
//    · y no hay NI UN campo de traducción en el protocolo: lo busqué
//      en los 2113 campos de los 561 tipos. Cero.
//
//  O sea: nadie puede dispararla desde fuera, y el que lee desde el
//  ordenador se queda sin ella. Por eso el bot sí aporta algo aquí.
//
//  Este módulo es toda la parte pensante y NO toca la red por su
//  cuenta: recibe el fetch por parámetro, así que se prueba entero
//  sin internet.
// ═══════════════════════════════════════════════════════════════════

/** Tope de texto por traducción: más que esto lo corta el proveedor. */
import { nodosInteractivos } from "#lib/wa-nodes";
export const MAX_TEXTO = 1800;
/** Tiempo máximo esperando al traductor. */
export const TIMEOUT_MS = 8000;
/** Traducciones recordadas para no repetir la misma llamada. */
export const MAX_CACHE = 200;

/** Los idiomas con nombre en español y su bandera. */
export const IDIOMAS = Object.freeze({
  es: { nombre: "español", bandera: "🇪🇸" },
  en: { nombre: "inglés", bandera: "🇬🇧" },
  pt: { nombre: "portugués", bandera: "🇧🇷" },
  fr: { nombre: "francés", bandera: "🇫🇷" },
  it: { nombre: "italiano", bandera: "🇮🇹" },
  de: { nombre: "alemán", bandera: "🇩🇪" },
  ru: { nombre: "ruso", bandera: "🇷🇺" },
  ar: { nombre: "árabe", bandera: "🇸🇦" },
  hi: { nombre: "hindi", bandera: "🇮🇳" },
  ja: { nombre: "japonés", bandera: "🇯🇵" },
  ko: { nombre: "coreano", bandera: "🇰🇷" },
  zh: { nombre: "chino", bandera: "🇨🇳" },
  nl: { nombre: "neerlandés", bandera: "🇳🇱" },
  tr: { nombre: "turco", bandera: "🇹🇷" },
  pl: { nombre: "polaco", bandera: "🇵🇱" },
  id: { nombre: "indonesio", bandera: "🇮🇩" },
  vi: { nombre: "vietnamita", bandera: "🇻🇳" },
  th: { nombre: "tailandés", bandera: "🇹🇭" },
  uk: { nombre: "ucraniano", bandera: "🇺🇦" },
  ro: { nombre: "rumano", bandera: "🇷🇴" },
  el: { nombre: "griego", bandera: "🇬🇷" },
  he: { nombre: "hebreo", bandera: "🇮🇱" },
  sv: { nombre: "sueco", bandera: "🇸🇪" },
  fil: { nombre: "filipino", bandera: "🇵🇭" },
  ca: { nombre: "catalán", bandera: "🏳" },
  eu: { nombre: "euskera", bandera: "🏳" },
  gl: { nombre: "gallego", bandera: "🏳" },
  la: { nombre: "latín", bandera: "🏛" },
});

/** Cómo lo escribe la gente de verdad → código. */
const ALIAS = Object.freeze({
  espanol: "es", español: "es", castellano: "es", spanish: "es", esp: "es",
  ingles: "en", inglés: "en", english: "en", ing: "en", eng: "en",
  portugues: "pt", portugués: "pt", brasileno: "pt", brasileño: "pt", portuguese: "pt", br: "pt",
  frances: "fr", francés: "fr", french: "fr",
  italiano: "it", italian: "it",
  aleman: "de", alemán: "de", german: "de",
  ruso: "ru", russian: "ru",
  arabe: "ar", árabe: "ar", arabic: "ar",
  hindi: "hi",
  japones: "ja", japonés: "ja", japanese: "ja", jp: "ja",
  coreano: "ko", korean: "ko", kr: "ko",
  chino: "zh", chinese: "zh", mandarin: "zh", mandarín: "zh", cn: "zh",
  neerlandes: "nl", neerlandés: "nl", holandes: "nl", holandés: "nl", dutch: "nl",
  turco: "tr", turkish: "tr",
  polaco: "pl", polish: "pl",
  indonesio: "id", indonesian: "id",
  vietnamita: "vi",
  tailandes: "th", tailandés: "th",
  ucraniano: "uk",
  rumano: "ro",
  griego: "el", greek: "el",
  hebreo: "he",
  sueco: "sv",
  filipino: "fil", tagalo: "fil",
  catalan: "ca", catalán: "ca",
  euskera: "eu", vasco: "eu",
  gallego: "gl",
  latin: "la", latín: "la",
});

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Acepta "en", "inglés", "ingles", "english", "pt-BR"… y devuelve el
 * código, o null si no es un idioma.
 */
export function resolverIdioma(entrada) {
  const crudo = String(entrada ?? "").trim().toLowerCase();
  if (!crudo) return null;

  const base = crudo.split(/[-_]/)[0];
  if (IDIOMAS[crudo]) return crudo;
  if (IDIOMAS[base]) return base;
  if (ALIAS[crudo]) return ALIAS[crudo];
  if (ALIAS[base]) return ALIAS[base];

  const limpio = sinTildes(crudo);
  if (ALIAS[limpio]) return ALIAS[limpio];
  for (const [alias, codigo] of Object.entries(ALIAS)) {
    if (sinTildes(alias) === limpio) return codigo;
  }
  return null;
}

export function nombreIdioma(codigo) {
  const c = String(codigo || "").toLowerCase().split(/[-_]/)[0];
  return IDIOMAS[c]?.nombre || (codigo ? String(codigo) : "desconocido");
}

export function banderaIdioma(codigo) {
  const c = String(codigo || "").toLowerCase().split(/[-_]/)[0];
  return IDIOMAS[c]?.bandera || "🌐";
}

/**
 * Descifra lo que pidió el usuario. Puro y probado: es donde fallaba
 * el comando viejo.
 *
 *   .tr inglés hola      → {idioma:"en", texto:"hola"}
 *   .tr hola             → {idioma:"es", texto:"hola"}  (sin idioma → al del bot)
 *   .tr en   (citando)   → {idioma:"en", texto:<lo citado>}
 *   .tr      (citando)   → {idioma:"es", texto:<lo citado>}
 */
export function parsePeticion(args = [], textoCitado = "", { porDefecto = "es" } = {}) {
  const lista = (Array.isArray(args) ? args : []).filter((a) => String(a ?? "").trim());
  const citado = String(textoCitado ?? "").trim();

  let idioma = porDefecto;
  let resto = [...lista];

  if (lista.length) {
    const posible = resolverIdioma(lista[0]);
    // Solo se come la primera palabra como idioma si queda texto
    // detrás o si hay algo citado que traducir.
    if (posible && (lista.length > 1 || citado)) {
      idioma = posible;
      resto = lista.slice(1);
    } else if (posible && lista.length === 1 && !citado) {
      idioma = posible;
      resto = [];
    }
  }

  const texto = resto.join(" ").trim() || citado;
  if (!texto) {
    return { ok: false, motivo: "sin-texto", idioma };
  }
  if (texto.length > MAX_TEXTO) {
    return { ok: true, idioma, texto: texto.slice(0, MAX_TEXTO), recortado: true };
  }
  return { ok: true, idioma, texto, recortado: false };
}


// ── Detector de idioma propio ──────────────────────────────────────
// Sin red y sin dependencias. Hace falta por dos motivos: MyMemory no
// dice de qué idioma venía, y en el modo automático hay que saber si
// un mensaje ya está en el idioma del grupo ANTES de gastar una
// llamada al traductor (y una cuota de envío).

/** Alfabetos que cantan solos. El chino va al final: el japonés también usa kanji. */
const ESCRITURAS = [
  [/[\u3040-\u309F\u30A0-\u30FF]/, "ja"],
  [/[\uAC00-\uD7AF]/, "ko"],
  [/[\u0400-\u04FF]/, "ru"],
  [/[\u0600-\u06FF]/, "ar"],
  [/[\u0590-\u05FF]/, "he"],
  [/[\u0370-\u03FF]/, "el"],
  [/[\u0900-\u097F]/, "hi"],
  [/[\u0E00-\u0E7F]/, "th"],
  [/[\u4E00-\u9FFF]/, "zh"],
];

/** Palabras vacías: las que más se repiten en cada idioma. */
const VACIAS = Object.freeze({
  es: ["que","de","no","la","el","en","y","es","por","para","con","los","las","un","una","me","te","se","mi","tu","pero","como","muy","esta","este","hola","gracias","porque","cuando","donde","tambien","bien","todo","todos","todas","hay","ya","si","buenas","buenos","dias","noches","gente","alguien","nadie","ahora","aqui","eso","asi","favor","perdon","claro","vale","oye","manana","hoy","ver","hacer","quiero","puedo"],
  en: ["the","is","and","to","of","in","you","that","it","for","on","are","with","this","have","from","not","but","what","your","just","can","will","how","they","about","there","would","like","when","thanks","hello","good","morning","night","evening","please","sorry","hey","yes","guys","know","think","need","really","love","time","today","tomorrow","see","get","make","want"],
  pt: ["que","nao","de","para","com","uma","por","mais","como","voce","isso","esta","muito","tem","obrigado","obrigada","ola","bom","boa","dia","noite","sim","tambem","quando","onde","porque","fazer","tudo","bem","favor","gente","agora","hoje","amanha","quero"],
  fr: ["le","la","les","de","des","est","une","que","pas","pour","dans","vous","avec","sur","plus","mais","nous","comme","tout","bien","merci","bonjour","bonsoir","aussi","quand","salut","oui","non","aujourd","demain","faire","veux"],
  it: ["che","non","di","per","una","con","sono","questo","come","anche","piu","molto","grazie","ciao","bene","buongiorno","buonasera","quando","perche","tutto","sempre","fare","oggi","domani","voglio","si"],
  de: ["der","die","das","und","ist","nicht","ein","eine","mit","auf","fur","auch","aber","wie","was","wir","ich","sie","danke","hallo","sehr","wenn","geht","dir","mir","guten","guten","morgen","abend","bitte","heute","morgen","noch","schon","haben","sein","du","zu","von","im","nur","mehr","kann","gut"],
  nl: ["het","een","van","niet","is","dat","met","voor","maar","ook","naar","zijn","hebben","deze","dank","hallo"],
  ca: ["amb","aixo","molt","tambe","perque","aquest","gracies","sempre","nosaltres","aquesta","pero","aviat"],
});

/** Pistas de escritura: tildes y signos que casi solo usa un idioma. */
const PISTAS = [
  [/[ñ¿¡]/i, "es", 2.2],
  [/[ãõç]/i, "pt", 2.0],
  [/[ßäöü]/i, "de", 1.6],
  [/[àèìòù]/i, "it", 1.2],
  [/[œêôûëï]/i, "fr", 1.4],
  [/l·l|·/i, "ca", 1.2],
];

/**
 * Adivina el idioma de un texto. Devuelve {codigo, confianza} o
 * {codigo:null} si no se atreve.
 */
export function detectarIdioma(texto) {
  const limpio = String(texto ?? "").trim();
  if (limpio.length < 3) return { codigo: null, confianza: 0 };

  for (const [patron, codigo] of ESCRITURAS) {
    if (patron.test(limpio)) return { codigo, confianza: 1 };
  }

  const palabras = sinTildes(limpio.toLowerCase())
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!palabras.length) return { codigo: null, confianza: 0 };

  // Empujón mínimo a los idiomas más probables en este grupo: sirve
  // para deshacer empates tontos (un "hola" es español mucho más a
  // menudo que catalán).
  const PRIOR = { es: 0.03, en: 0.03, pt: 0.02, fr: 0.01, it: 0.01, de: 0.01, nl: 0, ca: 0 };

  const puntos = {};
  for (const [codigo, lista] of Object.entries(VACIAS)) {
    const juego = new Set(lista);
    let aciertos = 0;
    for (const p of palabras) if (juego.has(p)) aciertos += 1;
    puntos[codigo] = aciertos / palabras.length + (aciertos ? (PRIOR[codigo] || 0) : 0);
  }
  for (const [patron, codigo, peso] of PISTAS) {
    if (patron.test(limpio)) puntos[codigo] = (puntos[codigo] || 0) + 0.12 * peso;
  }

  const orden = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
  const [mejor, valor] = orden[0];
  const segundo = orden[1]?.[1] ?? 0;
  if (valor < 0.1 || valor - segundo < 0.012) return { codigo: null, confianza: Number(valor.toFixed(3)) };
  return { codigo: mejor, confianza: Number(Math.min(1, valor * 2.5).toFixed(3)) };
}

// ── Proveedores ────────────────────────────────────────────────────
// Dos, para que una caída no deje el comando muerto. Las funciones
// que interpretan la respuesta van sueltas para poder probarlas con
// respuestas de mentira.

/** google: [[["hola","hello",…]],null,"en",…] */
export function parseGoogle(datos) {
  if (!Array.isArray(datos) || !Array.isArray(datos[0])) return null;
  const texto = datos[0].map((t) => (Array.isArray(t) ? t[0] : "")).join("").trim();
  if (!texto) return null;
  const de = typeof datos[2] === "string" ? datos[2].split(/[-_]/)[0] : "";
  return { texto, de };
}

/** mymemory: {responseData:{translatedText}, responseStatus:200} */
export function parseMyMemory(datos) {
  const texto = String(datos?.responseData?.translatedText ?? "").trim();
  if (!texto || Number(datos?.responseStatus) >= 400) return null;
  return { texto, de: "" };
}

const PROVEEDORES = [
  {
    nombre: "Google Traductor",
    url: "https://translate.googleapis.com",
    favicon: "https://www.google.com/s2/favicons?domain=translate.google.com&sz=64",
    construir: (texto, destino) =>
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
      encodeURIComponent(destino) + "&dt=t&q=" + encodeURIComponent(texto),
    leer: parseGoogle,
  },
  {
    nombre: "MyMemory",
    url: "https://mymemory.translated.net",
    favicon: "https://www.google.com/s2/favicons?domain=mymemory.translated.net&sz=64",
    construir: (texto, destino, origen) =>
      "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(texto) +
      "&langpair=" + encodeURIComponent((origen || "autodetect") + "|" + destino),
    leer: parseMyMemory,
  },
];

const cache = new Map();

export function limpiarCache() { cache.clear(); }
export function tamanoCache() { return cache.size; }

function recordar(clave, valor) {
  cache.set(clave, valor);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

/**
 * Traduce. Prueba los proveedores en orden y nunca lanza: devuelve
 * {ok:false, motivo} para que el comando decida qué decir.
 *
 * @param {object} op
 * @param {Function} op.fetchImpl  para las pruebas (por defecto, el fetch global)
 */
export async function traducir(texto, destino, { fetchImpl, timeoutMs = TIMEOUT_MS, usarCache = true } = {}) {
  const limpio = String(texto ?? "").trim().slice(0, MAX_TEXTO);
  const idioma = resolverIdioma(destino);
  if (!limpio) return { ok: false, motivo: "sin-texto" };
  if (!idioma) return { ok: false, motivo: "idioma-desconocido" };

  const clave = idioma + "\u0000" + limpio;
  if (usarCache && cache.has(clave)) return { ...cache.get(clave), cacheado: true };

  const pedir = fetchImpl || globalThis.fetch;
  if (typeof pedir !== "function") return { ok: false, motivo: "sin-red" };

  let ultimoFallo = "";
  for (const proveedor of PROVEEDORES) {
    try {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), timeoutMs);
      let respuesta;
      try {
        respuesta = await pedir(proveedor.construir(limpio, idioma), {
          signal: control.signal,
          headers: { "User-Agent": "Mozilla/5.0 (Shin-MD)" },
        });
      } finally {
        clearTimeout(reloj);
      }

      if (!respuesta?.ok) { ultimoFallo = "http-" + (respuesta?.status ?? "?"); continue; }

      const datos = await respuesta.json();
      const leido = proveedor.leer(datos);
      if (!leido) { ultimoFallo = "respuesta-rara"; continue; }

      // MyMemory no dice de dónde venía: lo adivinamos aquí.
      const detectado = leido.de || detectarIdioma(limpio).codigo || "";

      const salida = {
        ok: true,
        texto: leido.texto,
        de: detectado,
        deAdivinado: !leido.de && Boolean(detectado),
        a: idioma,
        proveedor: proveedor.nombre,
        fuente: { url: proveedor.url, favicon: proveedor.favicon, nombre: proveedor.nombre },
      };
      if (usarCache) recordar(clave, salida);
      return salida;
    } catch (error) {
      ultimoFallo = error?.name === "AbortError" ? "tiempo-agotado" : (error?.message || "fallo");
    }
  }
  return { ok: false, motivo: ultimoFallo || "sin-proveedores" };
}

/**
 * Decide si un mensaje del grupo merece traducción automática.
 * Pura: aquí se concentran todos los frenos anti-spam.
 */
export function debeTraducir(texto, { destino = "es", minimo = 8 } = {}) {
  const limpio = String(texto ?? "").trim();
  if (limpio.length < minimo) return { si: false, motivo: "muy-corto" };
  if (/^[\p{P}\p{S}\p{Emoji}\s\d]+$/u.test(limpio)) return { si: false, motivo: "sin-letras" };
  if (/^(https?:\/\/|www\.)\S+$/i.test(limpio)) return { si: false, motivo: "solo-enlace" };
  if (/^[./#!$%&*+-]\w/.test(limpio)) return { si: false, motivo: "es-un-comando" };
  if (!destino) return { si: false, motivo: "sin-destino" };

  // Lo más importante del modo automático: si ya está en el idioma
  // del grupo, ni se llama al traductor ni se gasta un envío.
  const { codigo, confianza } = detectarIdioma(limpio);
  if (codigo && codigo === resolverIdioma(destino) && confianza >= 0.25) {
    return { si: false, motivo: "ya-esta-en-ese-idioma", detectado: codigo };
  }
  return { si: true, detectado: codigo };
}

/** Freno por grupo: ni ráfagas ni inundar el chat. */
export function crearFreno({ huecoMs = 6000, porHora = 40 } = {}) {
  const estado = new Map();
  return {
    permite(jid, ahora = Date.now()) {
      const previo = estado.get(jid) || { ultimo: 0, ventana: ahora, contador: 0 };
      if (ahora - previo.ventana > 3600_000) { previo.ventana = ahora; previo.contador = 0; }
      if (ahora - previo.ultimo < huecoMs) return false;
      if (previo.contador >= porHora) return false;
      previo.ultimo = ahora;
      previo.contador += 1;
      estado.set(jid, previo);
      return true;
    },
    olvidar(jid) { estado.delete(jid); },
    tamano() { return estado.size; },
  };
}

/**
 * La tarjeta: cabecera con las dos banderas, la traducción, botón
 * para copiarla y otro para ver el original, más el aviso de que es
 * automática y la fuente con su favicon.
 */
export function buildTraduccionContent({ original = "", traduccion, de = "", a = "es", fuente = null, conBotones = true } = {}) {
  const texto = String(traduccion ?? "").trim();
  if (!texto) throw new Error("no hay traducción que enseñar");

  const origen = de ? `${banderaIdioma(de)} ${nombreIdioma(de)}` : "🌐 idioma detectado";
  const cuerpo = `${origen}  →  ${banderaIdioma(a)} ${nombreIdioma(a)}\n\n${texto}`;

  const contenido = {
    interactiveMessage: {
      body: { text: cuerpo },
      footer: { text: "❦ Shin-MD · traducción" },
      nativeFlowMessage: { messageVersion: 1, buttons: [] },
    },
    messageContextInfo: {
      botMetadata: { messageDisclaimerText: "Traducción automática: puede no ser exacta." },
    },
  };

  if (conBotones) {
    contenido.interactiveMessage.nativeFlowMessage.buttons = [
      { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: "Copiar traducción", copy_code: texto.slice(0, 1000), id: "tr-copy" }) },
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Ver original", id: ".ver-original" }) },
    ];
  }

  if (fuente?.url) {
    contenido.messageContextInfo.botMetadata.richResponseSourcesMetadata = {
      sources: [{
        provider: 0,
        sourceProviderUrl: String(fuente.url),
        ...(fuente.favicon ? { faviconCdnUrl: String(fuente.favicon) } : {}),
        sourceQuery: String(original || "").slice(0, 120),
        citationNumber: 1,
      }],
    };
  }

  return contenido;
}

/** Respaldo en texto, por si el cliente no dibuja la tarjeta. */
export function renderTraduccionTexto({ traduccion, de = "", a = "es" } = {}) {
  return `${banderaIdioma(de)} ${nombreIdioma(de)} → ${banderaIdioma(a)} ${nombreIdioma(a)}\n\n${String(traduccion ?? "").trim()}`;
}

/** Envía la tarjeta; si algo falla, cae al texto plano. No lanza. */
export async function sendTraduccion(sock, jid, datos = {}, { quoted } = {}) {
  try {
    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, buildTraduccionContent(datos), {
      userJid: sock?.user?.id,
      quoted,
      timestamp: new Date(),
    });
    await sock.relayMessage(jid, generado.message, {
      messageId: generado.key.id,
      // Sin estos nodos WhatsApp se traga el mensaje y no dibuja los
      // botones. Lo cazó el verificador: esta tarjeta salía pelada.
      additionalNodes: nodosInteractivos(jid),
    });
    return { sent: true, key: generado.key, modo: "tarjeta" };
  } catch (error) {
    try {
      await sock.sendMessage(jid, { text: renderTraduccionTexto(datos) }, { quoted });
      return { sent: true, modo: "texto", error };
    } catch (error2) {
      return { sent: false, error: error2 };
    }
  }
}
