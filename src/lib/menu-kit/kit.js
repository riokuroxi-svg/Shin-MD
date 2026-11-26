/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * message-kit — el envío único, en tres formatos, con respaldo.
 * Formatos (variable de entorno, sin tocar código):
 *   MENU_MODO=moderno  (defecto)  interactiveMessage + nativeFlow
 *   MENU_MODO=plantilla           interactivo dentro de templateMessage (clientes viejos)
 *   MENU_MODO=clasico             buttonsMessage (solo respuestas rápidas)
 *   MENU_VIEWONCE=1               vuelve al envoltorio de 2022 (botones grises: no recomendado)
 */
import {
  messageContextInfo, nodosInteractivos, botonesDeclarativos,
  paramsHoja, textoDeRespaldo, datosDelVideo,
} from "./nucleo.js";
import fs from "node:fs";

export function modoMenu() {
  const v = String(process.env.MENU_MODO || "").trim().toLowerCase();
  if (["clasico", "clásico", "buttons", "legacy"].includes(v)) return "clasico";
  if (["plantilla", "template", "compatible"].includes(v)) return "plantilla";
  return "moderno";
}

function conViewOnce() {
  return String(process.env.MENU_VIEWONCE || "").trim() === "1";
}

/**
 * Envía el menú. Una sola función para todos los comandos.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op
 * @param {string} op.cuerpo        texto principal
 * @param {string} [op.pie]         línea pequeña
 * @param {string} [op.titulo]
 * @param {Array}  [op.botones]     declarativos: {text, id|copy|url|call|sections}
 * @param {string} [op.videoPath]   header animado (gifPlayback)
 * @param {string} [op.imagenPath]  header fijo
 * @param {object} [op.cita]        mensaje a citar
 * @param {string} [op.prefijo]
 * @param {object} [op.baileys]     { proto, generateWAMessageFromContent, prepareWAMessageMedia }
 */
export async function enviarMenu(sock, jid, op = {}) {
  const {
    cuerpo = "", pie = "", titulo = "", botones = [], videoPath = null,
    imagenPath = null, cita = null, prefijo = ".", baileys = null,
  } = op;

  const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = baileys || {};
  const armados = botonesDeclarativos(botones);
  const citar = cita ? { quoted: cita } : undefined;

  // ── Sin botones o apagados: texto con las opciones escritas ──
  if (!armados.length || String(process.env.MENU_BOTONES || "") === "off") {
    return sock.sendMessage(jid, { text: textoDeRespaldo(cuerpo, armados, prefijo) }, citar);
  }

  // ── Canales: no admiten botones ──
  if (typeof jid === "string" && jid.endsWith("@newsletter")) {
    return sock.sendMessage(jid, { text: textoDeRespaldo(cuerpo, armados, prefijo) }, citar);
  }

  const modo = modoMenu();

  // ── Modo clásico: lo manda la librería (ella pone su nodo biz) ──
  if (modo === "clasico") {
    const soloRapidos = armados.every((b) => b.name === "quick_reply");
    if (soloRapidos) {
      const clasicos = armados.map((b) => {
        const p = JSON.parse(b.buttonParamsJson);
        return { text: p.display_text, id: String(p.id) };
      });
      return sock.sendMessage(jid, { text: cuerpo, footer: pie || undefined, buttons: clasicos }, citar);
    }
    // Si hay listas o enlaces, el clásico perdería opciones: sigue el moderno.
  }

  try {
    // ── Cabecera animada o fija ──
    let mediaMessage = null;
    let esVideo = false;

    if (videoPath && fs.existsSync(videoPath)) {
      esVideo = true;
      const buf = fs.readFileSync(videoPath);
      const datos = datosDelVideo(buf) || {};
      mediaMessage = (await prepareWAMessageMedia(
        {
          video: buf,
          gifPlayback: true,
          mimetype: "video/mp4",
          // Sin estos tres, el teléfono pinta la tarjeta como ARCHIVO.
          ...(datos.seconds ? { seconds: datos.seconds } : {}),
          ...(datos.width && datos.height ? { width: datos.width, height: datos.height } : {}),
        },
        { upload: sock.waUploadToServer },
      ))?.videoMessage;
    } else if (imagenPath && fs.existsSync(imagenPath)) {
      const buf = fs.readFileSync(imagenPath);
      mediaMessage = (await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer }))?.imageMessage;
    }

    const interactivo = {
      ...messageContextInfo(),
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: cuerpo }),
        ...(pie ? { footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: pie }) } : {}),
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: mediaMessage ? "" : titulo,
          subtitle: "",
          hasMediaAttachment: !!mediaMessage,
          ...(mediaMessage ? (esVideo ? { videoMessage: mediaMessage } : { imageMessage: mediaMessage }) : {}),
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: armados.map((b) => ({ name: b.name, buttonParamsJson: b.buttonParamsJson })),
          messageParamsJson: paramsHoja(armados, { titulo }) || undefined,
        }),
      }),
    };

    let contenido = conViewOnce() ? { viewOnceMessage: { message: interactivo } } : interactivo;

    if (modo === "plantilla" && !conViewOnce()) {
      contenido = {
        ...messageContextInfo(),
        templateMessage: {
          interactiveMessageTemplate: interactivo.interactiveMessage,
          templateId: "MENU-" + Date.now(),
        },
      };
    }

    const armado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id || sock.user?.jid,
      quoted: cita || undefined,
    });

    await sock.relayMessage(jid, armado.message, {
      messageId: armado.key.id,
      // Un solo <biz> completo. Sin esto el teléfono tira el mensaje sin avisar.
      additionalNodes: nodosInteractivos(jid, { ai: true }),
    });

    return armado;
  } catch (err) {
    // El respaldo no es adorno: es lo que evita que alguien se quede sin respuesta.
    if (typeof console !== "undefined") console.warn("menu: envío nativo falló, texto de respaldo:", err?.message);
    try {
      return await sock.sendMessage(jid, { text: textoDeRespaldo(cuerpo, armados, prefijo) }, citar);
    } catch {
      return null;
    }
  }
}

/**
 * Arma el contenido SIN enviar. Sirve para las pruebas:
 * se puede comprobar el payload completo offline.
 */
export function armarPayload({ cuerpo = "", pie = "", titulo = "", botones = [], baileys, mediaMessage = null, esVideo = false }) {
  const { proto } = baileys;
  const armados = botonesDeclarativos(botones);
  return {
    ...messageContextInfo(),
    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: cuerpo }),
      ...(pie ? { footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: pie }) } : {}),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: mediaMessage ? "" : titulo,
        hasMediaAttachment: !!mediaMessage,
        ...(mediaMessage ? (esVideo ? { videoMessage: mediaMessage } : { imageMessage: mediaMessage }) : {}),
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
        buttons: armados.map((b) => ({ name: b.name, buttonParamsJson: b.buttonParamsJson })),
        messageParamsJson: paramsHoja(armados, { titulo }) || undefined,
      }),
    }),
  };
}
