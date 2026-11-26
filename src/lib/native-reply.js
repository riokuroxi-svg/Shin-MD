/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  native-reply.js — Tarjetas con botones nativos (respuesta rápida,
//  enlace, copiar, selector).
//
//  LA REGLA QUE HACE QUE SE VEAN
//  ─────────────────────────────
//  Todos los botones de una tarjeta tienen que ser DEL MISMO TIPO. La
//  librería lo dice con todas las letras: si se mezcla un `quick_reply`
//  con un `cta_url` y un `cta_copy`, el cliente no puede deducir qué
//  flujo dibujar y pinta el mensaje entero como "no soportado" (o no
//  pinta nada). Antes se mezclaban aquí, y por eso `.play` y otros
//  comandos con botones no se veían.
//
//  Qué hace ahora: se agrupan por tipo y se manda el grupo que quepa
//  (el primero, en el orden en que los pidió el comando), metiendo los
//  demás como secciones del selector cuando se puede. Así siempre hay
//  una sola clase de botón en el mensaje.
//
//  Se usa la API de alto nivel de la librería (`generateWAMessageContent`
//  con `nativeFlow`), no el proto a mano: ella coloca la imagen en la
//  cabecera y arma el nodo `<biz>` sola.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

/**
 * Formato de la tarjeta.
 *
 *   moderno (por defecto) → `interactiveMessage` suelto, el más bonito.
 *   plantilla             → el mismo interactivo dentro de
 *                           `templateMessage.interactiveMessageTemplate`,
 *                           que es el envoltorio que entienden los
 *                           WhatsApp viejos.
 *
 * Se cambia con `BOTONES_FORMATO=plantilla` en el entorno.
 */
function formatoBotones() {
  const valor = String(process.env.BOTONES_FORMATO ?? "").trim().toLowerCase();
  return ["plantilla", "template", "compatible"].includes(valor) ? "plantilla" : "moderno";
}

/**
 * Convierte un botón del formato del proyecto al de la API de la
 * librería: selector (`sections`), respuesta rápida (`id`), enlace
 * (`url`) o copiar (`copy`).
 *
 * @param {object} button
 * @returns {{tipo: string, payload: object}}
 */
function normalizarBoton(button) {
  const texto = String(button.text || button.display_text || "");

  // Enlace
  if (button.url) {
    return {
      tipo: "cta_url",
      payload: { text: texto || "🌐 Abrir enlace", url: String(button.url) },
    };
  }
  // Copiar código
  if (button.copy_code || button.code) {
    return {
      tipo: "cta_copy",
      payload: { text: texto || "📋 Copiar", copy: String(button.copy_code || button.code) },
    };
  }
  // Selector de la librería: ya viene con secciones
  if (button.sections) {
    return {
      tipo: "single_select",
      payload: { text: texto || "📋 Elegir", sections: button.sections },
    };
  }
  // Respuesta rápida: lo de siempre
  return {
    tipo: button.name || "quick_reply",
    payload: { text: texto || "👉 Tocar", id: String(button.id || "") },
  };
}

/**
 * Envía una tarjeta con botones nativos.
 *
 * @param {object} opts
 * @param {object} opts.sock          Socket del conector.
 * @param {string} opts.jid           Chat destino.
 * @param {string} opts.body          Texto principal.
 * @param {string} [opts.footer]      Pie de la tarjeta.
 * @param {string} [opts.title]       Título de la cabecera (opcional).
 * @param {object} [opts.quoted]      Mensaje que se cita.
 * @param {Array}  [opts.buttons]     [{ text, id, copy_code, url }]
 * @param {Buffer|string} [opts.imageBuffer] Portada (Buffer o ruta).
 * @param {object|string} [opts.params] Adornos del mensaje (hoja inferior,
 *        cuenta atrás). Se arman con #lib/native-params.
 * @returns {Promise<{sent: boolean, key?: object, error?: any}>}
 */
export async function sendNativeQuickReply({
  sock,
  jid,
  body,
  footer = "",
  title = "",
  quoted,
  buttons = [],
  imageBuffer = null,
  params = null,
} = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("El socket no expone relayMessage");

    const { generateWAMessageContent, generateWAMessageFromContent } = await import("baileys");

    // ── Botones: un solo tipo por mensaje ───────────────────────
    const normalizados = (buttons || []).map(normalizarBoton);
    /** @type {Map<string, object[]>} */
    const porTipo = new Map();
    for (const b of normalizados) {
      const lista = porTipo.get(b.tipo) || [];
      lista.push(b.payload);
      porTipo.set(b.tipo, lista);
    }

    // Los `quick_reply` sueltos se convierten en un selector para poder
    // convivir con los demás en un único mensaje (dos `quick_reply` no
    // caben cuando hay otra clase de botón: el cliente no sabría qué
    // dibujar).
    if (porTipo.size > 1 && porTipo.has("quick_reply")) {
      const rapidos = porTipo.get("quick_reply");
      porTipo.delete("quick_reply");
      const previo = porTipo.get("single_select") || [];
      porTipo.set("single_select", [
        {
          text: previo[0]?.text || "📋 Opciones",
          sections: [
            {
              title: "Elige una opción",
              rows: rapidos.map((b) => ({ title: b.text, id: b.id })),
            },
            ...previo.flatMap((b) => b.sections || []),
          ],
        },
      ]);
    }

    // Se queda UN tipo. Prioridad de los que SIRVEN para actuar
    // (respuesta rápida y selector) sobre los decorativos (enlace,
    // copiar): si sólo cabe un tipo, lo que no puede faltar es el botón
    // que hace algo.
    const PRIORIDAD = ["quick_reply", "single_select", "cta_copy", "cta_url"];
    const ordenados = [...porTipo.entries()].sort(
      (a, b) => PRIORIDAD.indexOf(a[0]) - PRIORIDAD.indexOf(b[0]),
    );
    const [tipoElegido, listaElegida] = ordenados[0] || ["quick_reply", []];
    porTipo.clear();
    for (const [k, v] of ordenados) porTipo.set(k, v);
    let botonesFinales;
    if (tipoElegido === "single_select") {
      // Todas las secciones de todos los selectores, en uno solo.
      const secciones = listaElegida.flatMap((b) => b.sections || []);
      const sobrantes = [...porTipo.entries()].slice(1).flatMap(([, l]) => l);
      if (sobrantes.length) {
        secciones.push({
          title: "Más opciones",
          rows: sobrantes.map((b) => {
            if (b.url) return { title: b.text, description: b.url, id: b.url };
            if (b.copy) return { title: b.text, description: "copiar", id: b.copy };
            return { title: b.text, id: b.id || "" };
          }),
        });
      }
      botonesFinales = [
        { text: listaElegida[0]?.text || "📋 Opciones", sections: secciones },
      ];
    } else {
      botonesFinales = listaElegida;
      if (porTipo.size > 1) {
        log.warn(
          "native-reply: se descartan botones de otro tipo (" +
            [...porTipo.keys()].slice(1).join(", ") +
            "): mezclar tipos hace que el cliente no pinte la tarjeta",
        );
      }
    }

    // Un `messageParamsJson` vacío (`"{}"`) hace que algunos clientes
    // dibujen una franja gris de más y otros descarten la tarjeta: sólo
    // se manda si trae algo dentro.
    const paramsJson = (() => {
      if (!params) return null;
      const crudo = typeof params === "string" ? params : JSON.stringify(params);
      if (!crudo || crudo === "{}" || crudo === "null") return null;
      return crudo;
    })();

    const contenido = await generateWAMessageContent(
      {
        // OJO con la librería: si se manda `caption` SIN media, intenta
        // validar una cabecera multimedia que no existe y revienta con
        // "Invalid media type". El texto del cuerpo va como `text` cuando
        // no hay imagen; `caption` sólo acompaña a la media.
        ...(imageBuffer
          ? { image: Buffer.isBuffer(imageBuffer) ? imageBuffer : { url: String(imageBuffer) }, caption: String(body || "") }
          : { text: String(body || "") }),
        ...(footer ? { footer } : {}),
        nativeFlow: botonesFinales.length ? botonesFinales : undefined,
        interactiveAsTemplate: formatoBotones() === "plantilla",
        ...(paramsJson ? { optionTitle: "Opciones", optionText: "Ver opciones" } : {}),
      },
      { upload: sock.waUploadToServer, mediaCache: sock.mediaCache, logger: log },
    );

    // El título va en la cabecera si se pidió y hay media; si no, se
    // omite (un título vacío hace que algunos clientes descarten la
    // tarjeta).
    if (title && contenido.interactiveMessage && !contenido.interactiveMessage.header) {
      contenido.interactiveMessage.header = { title: String(title), hasMediaAttachment: false };
    }

    const generated = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });

    if (!generated?.key?.id || !generated.message) {
      throw new Error("No se pudo generar la tarjeta nativa");
    }

    // Sin additionalNodes: el `<biz>` lo pone la librería (y no pone dos).
    await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });

    return { sent: true, key: generated.key };
  } catch (error) {
    return { sent: false, error };
  }
}

export default sendNativeQuickReply;
