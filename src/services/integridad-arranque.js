/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  integridad-arranque.js — el director de orquesta de las 5 capas
//
//    1. INTEGRIDAD  ¿cambió algo desde la foto?      → #lib/integridad
//    2. ANOMALÍAS   ¿lo instalado cuadra con el lock? → #lib/analisis
//    3. ANÁLISIS    ¿el contenido tiene señales malas? → #lib/analisis
//    4. PREVENCIÓN  ¿esto debe impedir arrancar?      → aquí
//    5. AUDITORÍA   ¿queda constancia?                → #lib/auditoria
//
//  Lo importante del diseño: DETECTAR y PREVENIR son cosas distintas y
//  se deciden en sitios distintos. Por defecto esta capa solo AVISA;
//  quien impide arrancar es `scripts/preload-integridad.mjs`, y solo en
//  modo estricto. Así nadie más puede confundir «lo detecté» con «lo
//  impedí».
//
//  Este archivo NO importa nada de `node_modules` a propósito: se usa
//  desde el preload, antes de que existan `pino`, `chalk` o `baileys`.
//  Si importara el logger del bot, la comprobación llegaría después de
//  cargar media cadena de dependencias, que es justo el fallo que se
//  está corrigiendo.
// ═══════════════════════════════════════════════════════════════════

import { sellar, revisarAlArrancar, claveDe } from "../lib/integridad.js";
import { analizarCadena, analizarContenido } from "../lib/analisis-dependencias.js";
import { registrar } from "../lib/auditoria-seguridad.js";

const AMBAR = "\x1b[38;5;179m";
const ROJO = "\x1b[38;5;174m";
const VERDE = "\x1b[38;5;79m";
const GRIS = "\x1b[38;5;245m";
const RESET = "\x1b[0m";

const hayColor = () =>
  process.env.NO_COLOR === undefined && process.stdout && process.stdout.isTTY !== false;
const pinta = (codigo, texto) => (hayColor() ? codigo + texto + RESET : texto);

/** Impresora por defecto: la consola, sin dependencias. */
function imprimirPorDefecto(texto) {
  console.log(texto);
}

/**
 * Decide el modo: `off` | `avisar` | `estricto`.
 * También acepta `strict` porque es lo que escribe medio mundo.
 */
export function modoDeEntorno(entorno = process.env) {
  const v = String(entorno.SHIN_INTEGRIDAD || "avisar").toLowerCase();
  if (["off", "0", "no", "apagado"].includes(v)) return "off";
  if (["estricto", "strict", "on", "1", "sí", "si"].includes(v)) return "estricto";
  return "avisar";
}

/**
 * Corre las cinco capas y devuelve el veredicto completo.
 * No imprime si se le pasa `imprimir: null`.
 *
 * @param {object} [opciones]
 * @param {string} [opciones.raiz]           carpeta del bot
 * @param {string} [opciones.modo]           off | avisar | estricto
 * @param {boolean} [opciones.contenido]     analizar contenido (capa 3)
 * @param {boolean} [opciones.completo]      analizar TODO aunque el sello esté al día
 * @param {number}  [opciones.limite]
 * @param {function|null} [opciones.imprimir]
 * @param {boolean} [opciones.registrarEnLog]
 */
export function ejecutarAuditoria({
  raiz = process.cwd(),
  modo = modoDeEntorno(),
  contenido,
  completo = process.env.SHIN_ANALISIS === "completo",
  limite,
  imprimir = imprimirPorDefecto,
  registrarEnLog = true,
} = {}) {
  const decir = (texto) => {
    if (imprimir) imprimir(texto);
  };

  if (modo === "off") {
    return {
      ok: true,
      estado: "apagado",
      capas: {
        integridad: null,
        anomalias: null,
        analisis: null,
        prevencion: null,
        auditoria: null,
      },
      hallazgos: [],
      resumen: { alta: 0, media: 0, baja: 0 },
      bloquea: false,
      motivos: [],
    };
  }

  // ── Capa 1: integridad ────────────────────────────────────────
  const veredicto = revisarAlArrancar({ raiz, modo });
  const detalle = veredicto.detalle || {};
  const cambiados = [...(detalle.cambiados || [])];
  const nuevos = [...(detalle.nuevos || [])];

  // ── Capa 2: anomalías de la cadena ────────────────────────────
  // (sale del propio detalle de integridad: no cuesta nada)
  const anomalias = {
    cambiados: cambiados.length,
    nuevos: nuevos.length,
    faltan: (detalle.faltan || []).length,
    enlaces: (detalle.enlaces || []).length,
    cabeceras: (detalle.cabeceras || []).length,
    firmaOk: detalle.firmaOk ?? null,
    firmado: detalle.firmaEnSello ?? false,
    lock: (detalle.cabeceras || []).some((c) => /package-lock/.test(c)),
  };

  // ── Capa 3: análisis de contenido ─────────────────────────────
  // Si el sello está al día no se revisa el árbol entero: no hay nada
  // nuevo que mirar, y arrancar el bot no es sitio para recorrer 6.000
  // archivos. Se revisa todo cuando el sello no existe (primera vez) o
  // cuando se pide explícitamente.
  const haySello = veredicto.estado === "igual" || veredicto.estado === "cambio";
  const revisarContenido =
    contenido === undefined
      ? completo ||
        !haySello ||
        veredicto.estado === "cambio" ||
        veredicto.estado === "sello-invalido"
      : contenido;

  const solo =
    haySello && !completo && (cambiados.length || nuevos.length) ? [...cambiados, ...nuevos] : null;

  // La cadena de suministro se comprueba SIEMPRE (leer el lock y listar dos
  // carpetas cuesta milisegundos). Lo caro es leer el contenido de los
  // archivos, y eso solo se hace cuando hay algo nuevo que leer.
  let analisis = {
    hallazgos: [],
    resumen: { alta: 0, media: 0, baja: 0 },
    analizados: 0,
    limpio: true,
  };
  try {
    const cadena = analizarCadena({ raiz });
    const contenido = revisarContenido
      ? analizarContenido({ raiz, solo, limite })
      : { analizados: 0, hallazgos: [], recortado: false };
    const hallazgos = [...contenido.hallazgos, ...cadena.hallazgos];
    const resumen = { alta: 0, media: 0, baja: 0 };
    for (const h of hallazgos) resumen[h.gravedad] = (resumen[h.gravedad] || 0) + 1;
    analisis = {
      hallazgos,
      resumen,
      analizados: contenido.analizados,
      recortado: contenido.recortado,
      paquetesDeclarados: cadena.paquetesDeclarados,
      contenidoRevisado: revisarContenido,
      limpio: hallazgos.length === 0,
    };
  } catch (err) {
    analisis.error = err.message;
  }

  // ── Capa 4: prevención ────────────────────────────────────────
  const motivos = [];
  if (veredicto.estado === "sello-invalido") motivos.push("el sello no es válido");
  if (veredicto.estado === "cambio") motivos.push("el árbol cambió desde el sello");
  if (veredicto.estado === "sin-sello") motivos.push("no hay sello: no se puede comparar nada");
  if ((analisis.resumen?.alta || 0) > 0) {
    motivos.push(analisis.resumen.alta + " hallazgo(s) de gravedad alta en las dependencias");
  }
  const bloquea = motivos.length > 0;
  const ok = !(modo === "estricto" && bloquea);

  const veredictoFinal = {
    ok,
    estado: veredicto.estado,
    modo,
    capas: {
      integridad: {
        estado: veredicto.estado,
        paquetes: detalle.paquetes ?? null,
        selloEn: detalle.selloEn ?? null,
        firmado: anomalias.firmado,
        firmaOk: anomalias.firmaOk,
      },
      anomalias,
      analisis: {
        analizados: analisis.analizados,
        hallazgos: analisis.hallazgos.length,
        resumen: analisis.resumen,
        recortado: Boolean(analisis.recortado),
        contenidoRevisado: Boolean(analisis.contenidoRevisado),
        error: analisis.error || null,
      },
      prevencion: { bloquea, motivos },
      auditoria: { registro: null },
    },
    hallazgos: analisis.hallazgos || [],
    resumen: analisis.resumen || { alta: 0, media: 0, baja: 0 },
    bloquea,
    motivos,
    mensaje: veredicto.mensaje,
    aviso: veredicto.aviso,
  };

  // ── Salida para las personas ──────────────────────────────────
  const g = veredictoFinal;
  const icono = !g.bloquea
    ? pinta(VERDE, "✓")
    : modo === "estricto"
      ? pinta(ROJO, "✗")
      : pinta(AMBAR, "!");
  const cifras = [];
  if (g.capas.integridad.paquetes) cifras.push(g.capas.integridad.paquetes + " archivos");
  if (g.capas.analisis.analizados) cifras.push(g.capas.analisis.analizados + " analizados");
  const cola = cifras.length ? pinta(GRIS, " · " + cifras.join(" · ")) : "";

  // Titular SIEMPRE: una línea que se pueda leer de un vistazo y buscar en el
  // log. Antes solo salía cuando todo estaba perfecto, así que un árbol con un
  // aviso suelto no dejaba ninguna línea reconocible al empezar.
  const avisos = (g.resumen.alta || 0) + (g.resumen.media || 0) + (g.resumen.baja || 0);
  const limpioYAlDia = g.estado === "igual" && avisos === 0;
  const comoEsta =
    {
      igual: "sello al día",
      cambio: "el árbol cambió desde el sello",
      "sello-invalido": "el sello no es válido",
      "sin-sello": "sin sello: no hay con qué comparar",
    }[g.estado] || g.estado;

  decir(
    limpioYAlDia
      ? icono + " seguridad: sello al día y dependencias sin señales" + cola
      : icono + " seguridad: " + comoEsta + (avisos ? " · " + avisos + " aviso(s)" : "") + cola
  );

  if (!limpioYAlDia) {
    // Primero lo que dijo la capa 1 (con nombres de archivo), después lo que
    // encontraron el análisis y la cadena de suministro.
    if (g.estado !== "igual") {
      for (const linea of String(g.mensaje || "").split("\n")) {
        decir(pinta(AMBAR, "  " + linea));
      }
    }
    for (const h of g.hallazgos.slice(0, 12)) {
      const color = h.gravedad === "alta" ? ROJO : h.gravedad === "media" ? AMBAR : GRIS;
      decir("  " + pinta(color, "[" + h.gravedad + "]") + " " + h.regla + " — " + h.descripcion);
      if (h.archivo && h.archivo !== "package-lock.json") {
        decir(pinta(GRIS, "      " + h.archivo + (h.evidencia ? "  ·  " + h.evidencia : "")));
      }
    }
    if (g.hallazgos.length > 12) {
      decir(pinta(GRIS, "  … y " + (g.hallazgos.length - 12) + " hallazgos más (ver /health)"));
    }
    if (modo === "estricto" && g.bloquea) {
      decir(pinta(ROJO, "  modo estricto: no se arranca. Motivos: " + g.motivos.join("; ")));
      decir(pinta(GRIS, "  si el cambio lo hiciste tú y ya lo revisaste:  node index.js --sellar"));
      decir(pinta(GRIS, "  para arrancar avisando igualmente:            SHIN_INTEGRIDAD=avisar"));
    } else if (g.bloquea) {
      decir(
        pinta(
          AMBAR,
          "  aviso, no bloqueo (modo avisar). Para que impida arrancar: SHIN_INTEGRIDAD=estricto"
        )
      );
    }
  }

  // ── Capa 5: auditoría ─────────────────────────────────────────
  if (registrarEnLog) {
    veredictoFinal.capas.auditoria.registro = registrar(
      {
        tipo: "arranque",
        modo,
        estado: g.estado,
        bloquea: g.bloquea,
        motivos: g.motivos,
        capas: {
          integridad: g.capas.integridad,
          anomalias: g.capas.anomalias,
          analisis: g.capas.analisis,
        },
        hallazgos: g.hallazgos.slice(0, 20).map((h) => ({
          regla: h.regla,
          gravedad: h.gravedad,
          archivo: h.archivo,
        })),
      },
      { raiz }
    );
  }

  globalThis.__shinSeguridad = veredictoFinal;
  // Compatibilidad: /health y algún test siguen leyendo __shinIntegridad.
  globalThis.__shinIntegridad = { ...detalle, estado: g.estado };

  return veredictoFinal;
}

/**
 * Sella el árbol actual (operación explícita de una persona).
 * @param {{raiz?:string, imprimir?:function|null}} [opciones]
 */
export function sellarArbol({ raiz = process.cwd(), imprimir = imprimirPorDefecto } = {}) {
  const h = sellar({ raiz });
  const clave = claveDe(raiz, { crear: false });
  if (imprimir) {
    imprimir(
      pinta(VERDE, "✓") +
        " sello de integridad: " +
        h.paquetes +
        " archivos de node_modules fotografiados" +
        (h.firmado ? " y firmados (HMAC-SHA256)" : pinta(AMBAR, " SIN firmar (no hay clave)"))
    );
    imprimir(
      pinta(
        GRIS,
        "  sello: data/.shin-integridad.json · clave: " +
          (clave ? "data/.shin-clave" : "SHIN_INTEGRIDAD_CLAVE")
      )
    );
  }
  registrar({ tipo: "sello", paquetes: h.paquetes, firmado: h.firmado }, { raiz });
  globalThis.__shinIntegridad = { estado: "sellado", paquetes: h.paquetes, firmado: h.firmado };
  return h;
}

/**
 * Lo que llama `boot/index.js`. Se mantiene el nombre y el contrato:
 * devuelve false cuando el proceso no debe continuar.
 *
 * @param {string[]} args
 * @param {{raiz?:string, imprimir?:function|null, modo?:string}} [opciones]
 */
export function pasoDeIntegridad(args = process.argv.slice(2), { raiz, imprimir, modo } = {}) {
  const quiereSellar = args.includes("--sellar") || args.includes("--seal");
  const base = raiz || process.cwd();

  if (quiereSellar) {
    sellarArbol({ raiz: base, imprimir });
    return false; // trabajo hecho: no hay que arrancar el bot
  }

  const modoFinal = modo || modoDeEntorno();
  if (modoFinal === "off") return true;

  // Si el preload ya hizo el trabajo en este proceso, no se repite: solo se
  // confirma con una línea. Así el arranque cuesta lo mismo que antes.
  const yaHecho = globalThis.__shinSeguridad;
  if (yaHecho) {
    if (!yaHecho.ok) return false;
    return true;
  }

  const r = ejecutarAuditoria({ raiz: base, modo: modoFinal, imprimir });
  return r.ok;
}

export default pasoDeIntegridad;
