/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  bot-steps.js — Los "pasos de razonamiento" de Meta AI
//
//  QUÉ SE ENCONTRÓ
//  ---------------
//  Cuando Meta AI está trabajando enseña un panel con pasos que se
//  van tachando («Buscando…», «Leyendo 3 fuentes…», «Escribiendo»),
//  cada uno con su estado y sus fuentes con favicon. Ese panel no es
//  texto: es un trozo del protocolo que baileys 6.7.24 ya define y
//  ninguna librería de bots toca:
//
//    messageContextInfo.botMetadata.progressIndicatorMetadata
//      · progressDescription
//      · stepsMetadata[] → BotPlanningStepMetadata
//          statusTitle | statusBody | status | isReasoning
//          | sourcesMetadata[] (título, proveedor, url, favicon)
//          | sections[] (subtítulo + cuerpo)
//    PlanningStepStatus = { PLANNED: 1, EXECUTING: 2, FINISHED: 3 }
//
//  Y se puede ACTUALIZAR: el mismo mensaje se edita con
//  protocolMessage.type = MESSAGE_EDIT (14) metiendo el contenido
//  nuevo completo, botMetadata incluido. O sea: un panel de progreso
//  nativo que avanza solo, sin mandar mensajes nuevos.
//
//  Comprobado contra el proto (test/tanda3.test.js). Que el cliente
//  lo dibuje se mira con `.lab pasos`; si no lo dibuja, queda el
//  texto normal del mensaje, que siempre va puesto como respaldo.
// ═══════════════════════════════════════════════════════════════════

/** PlanningStepStatus del proto. */
export const PASO = Object.freeze({ PLANEADO: 1, EJECUTANDO: 2, HECHO: 3 });

/** ProtocolMessage.Type.MESSAGE_EDIT */
export const TIPO_EDICION = 14;

/** BotPlanningSearchSourceProvider: 0 desconocido, 1 otro, 2 Google, 3 Bing. */
export const PROVEEDOR = Object.freeze({ DESCONOCIDO: 0, OTRO: 1, GOOGLE: 2, BING: 3 });

/**
 * Pasa una lista cómoda a la forma del protocolo.
 * Entrada: [{ titulo, detalle, estado, razonando, fuentes, secciones }]
 */
export function normalizarPasos(pasos = []) {
  return (Array.isArray(pasos) ? pasos : []).map((p) => {
    const paso = {
      statusTitle: String(p?.titulo ?? ""),
      status: Number.isInteger(p?.estado) ? p.estado : PASO.PLANEADO,
    };
    if (p?.detalle) paso.statusBody = String(p.detalle);
    if (p?.razonando) paso.isReasoning = true;

    if (Array.isArray(p?.fuentes) && p.fuentes.length) {
      paso.sourcesMetadata = p.fuentes.map((f) => ({
        sourceTitle: String(f?.titulo ?? f?.url ?? ""),
        provider: Number.isInteger(f?.proveedor) ? f.proveedor : PROVEEDOR.OTRO,
        ...(f?.url ? { sourceUrl: String(f.url) } : {}),
      }));
    }

    if (Array.isArray(p?.secciones) && p.secciones.length) {
      paso.sections = p.secciones.map((s) => ({
        sectionTitle: String(s?.titulo ?? ""),
        sectionBody: String(s?.cuerpo ?? ""),
      }));
    }
    return paso;
  });
}

/**
 * Contenido completo: panel de pasos + texto de respaldo.
 * El texto SIEMPRE va: si el cliente no dibuja el panel, se lee igual.
 */
export function buildStepsContent({ texto = "", descripcion = "", pasos = [], disclaimer = "" } = {}) {
  const lista = normalizarPasos(pasos);
  if (!lista.length) throw new Error("hacen falta pasos");

  const botMetadata = {
    progressIndicatorMetadata: {
      progressDescription: String(descripcion || ""),
      stepsMetadata: lista,
    },
  };
  if (disclaimer) botMetadata.messageDisclaimerText = String(disclaimer);

  return {
    messageContextInfo: { botMetadata },
    extendedTextMessage: { text: String(texto || descripcion || "…") },
  };
}

/** Envoltorio de edición: cambia un mensaje ya enviado por otro contenido. */
export function buildStepsEdit(key, contenido, ahora = Date.now()) {
  if (!key?.id) throw new Error("falta la clave del mensaje a editar");
  return {
    protocolMessage: {
      key,
      type: TIPO_EDICION,
      timestampMs: ahora,
      editedMessage: contenido,
    },
  };
}

/** Texto de respaldo legible a partir de los pasos (por si no se dibuja). */
export function renderPasosTexto(pasos = [], descripcion = "") {
  const icono = { [PASO.PLANEADO]: "○", [PASO.EJECUTANDO]: "◐", [PASO.HECHO]: "●" };
  const lineas = (pasos || []).map((p) => {
    const marca = icono[p?.estado ?? PASO.PLANEADO] || "○";
    return `${marca} ${p?.titulo ?? ""}${p?.detalle ? ` · ${p.detalle}` : ""}`;
  });
  return [descripcion ? `*${descripcion}*` : "", ...lineas].filter(Boolean).join("\n");
}

/**
 * Los mismos nodos binarios que usa `native-reply` (el único camino
 * cuyos botones se ven de verdad en el móvil). Sin ellos WhatsApp
 * recibe el panel pero no lo dibuja: se queda solo el texto.
 *
 * El nodo `bot` (biz_bot=1) es el que marca el mensaje como "de un
 * bot", que es justo lo que hace que el cliente se moleste en leer
 * botMetadata. En grupos WhatsApp no lo admite, así que ahí el panel
 * puede no pintarse — y por eso el texto de respaldo va SIEMPRE
 * dentro del mismo mensaje.
 */
function nodosDePanel(jid) {
  const esPrivado = typeof jid === "string" && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"));
  const nodos = [{
    tag: "biz",
    attrs: {
      actual_actors: "2",
      host_storage: "2",
      privacy_mode_ts: Math.floor(Date.now() / 1000).toString(),
    },
    content: [
      { tag: "interactive", attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] },
      { tag: "quality_control", attrs: { source_type: "third_party" } },
    ],
  }];
  if (esPrivado) nodos.push({ tag: "bot", attrs: { biz_bot: "1" } });
  return nodos;
}

/**
 * Manda el panel. Nunca lanza.
 * @returns {Promise<{sent:boolean, key?:object, error?:any}>}
 */
export async function sendSteps(sock, jid, datos, { quoted } = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");

    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, buildStepsContent(datos), {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó el panel");

    await sock.relayMessage(jid, generado.message, {
      messageId: generado.key.id,
      additionalNodes: nodosDePanel(jid),
    });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}

/**
 * Panel de pasos vivo: se manda una vez y se edita según avanza.
 * Mismo espíritu que #lib/progress, pero nativo.
 *
 * @param {object[]} pasos  [{titulo, detalle, fuentes, secciones}]
 * @param {object} [op]
 * @param {number} [op.minGapMs=1200]  freno anti-ráfaga entre ediciones
 * @returns {{start:Function, avanzar:Function, finish:Function, fail:Function, key:Function, alive:Function}}
 */
export function createNativeSteps(sock, jid, { quoted = null, minGapMs = 1200, descripcion = "" } = {}) {
  let key = null;
  let pasos = [];
  let cerrado = false;
  let ultimo = 0;

  async function pintar(texto, forzar = false) {
    if (cerrado || !key) return false;
    const ahora = Date.now();
    if (!forzar && ahora - ultimo < minGapMs) return false;
    ultimo = ahora;

    try {
      const contenido = buildStepsContent({ texto, descripcion, pasos });
      await sock.relayMessage(jid, buildStepsEdit(key, contenido, ahora), {
        additionalNodes: nodosDePanel(jid),
      });
      return true;
    } catch {
      return false;
    }
  }

  return {
    /** Manda el panel con todos los pasos planeados y el primero en marcha. */
    async start(lista = [], texto = "") {
      pasos = (Array.isArray(lista) ? lista : []).map((p, i) => ({
        ...p,
        estado: i === 0 ? PASO.EJECUTANDO : PASO.PLANEADO,
      }));
      const r = await sendSteps(sock, jid, {
        texto: texto || renderPasosTexto(pasos, descripcion),
        descripcion,
        pasos,
      }, { quoted });
      if (r.sent) { key = r.key; ultimo = Date.now(); }
      return r.sent;
    },

    /** Marca hechos los anteriores y pone en marcha el paso indicado. */
    async avanzar(indice, extra = {}) {
      pasos = pasos.map((p, i) => ({
        ...p,
        ...(i === indice ? extra : {}),
        estado: i < indice ? PASO.HECHO : i === indice ? PASO.EJECUTANDO : PASO.PLANEADO,
      }));
      return pintar(renderPasosTexto(pasos, descripcion));
    },

    /**
     * Cierra el panel con todo hecho.
     * @param {string} [texto] Si se pasa, sustituye a la lista de pasos.
     * @param {object} [op]
     * @param {string} [op.cola] Línea que se añade al final (el resumen).
     */
    async finish(texto = "", { cola = "" } = {}) {
      pasos = pasos.map((p) => ({ ...p, estado: PASO.HECHO }));
      const cuerpo = (texto || renderPasosTexto(pasos, descripcion)) + (cola ? `\n${cola}` : "");
      const ok = await pintar(cuerpo, true);
      cerrado = true;
      return ok;
    },

    /** Cierra dejando el fallo a la vista, sin mandar otro mensaje. */
    async fail(motivo = "") {
      const texto = renderPasosTexto(pasos, descripcion) + (motivo ? `\n\n⚠️ ${motivo}` : "");
      const ok = await pintar(texto, true);
      cerrado = true;
      return ok;
    },

    key() { return key; },
    alive() { return !!key && !cerrado; },
  };
}

export default { PASO, buildStepsContent, buildStepsEdit, sendSteps, createNativeSteps, renderPasosTexto };
