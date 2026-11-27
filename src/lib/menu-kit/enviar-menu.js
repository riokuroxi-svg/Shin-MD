/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  enviar-menu.js — EL menú. Uno solo, en un solo sitio.
//
//  Reemplaza las cinco rutas que había (v1 imagen, v2 texto, v3 vídeo,
//  v4 dashboard, v5 tarjeta) y las copias de `menu-card.js`.
//
//  UNA sola burbuja:
//     vídeo en bucle (gifPlayback) + texto + botones nativos + oferta
//     y, si el dueño lo pide, la nota de voz del menú.
//
//  NUNCA deja sin respuesta:
//     si el envío nativo falla, sale el texto con las opciones escritas,
//     con los ids CON prefijo para que se puedan teclear.
//
//  Interruptores (sin tocar código):
//     MENU_MODO=moderno|plantilla|clasico     formato de los botones
//     MENU_BOTONES=off                        todo a texto
//     MENU_AUDIO=off                          sin nota de voz
//     MENU_VIDEO_PATH / MENU_AUDIO_PATH       assets propios
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from "baileys";
import { nodosInteractivos } from "#lib/wa-nodes";
import log from "#logger";
import {
  datosDelVideo,
  videoDelMenu,
  miniaturaDelMenu,
  portadaDelMenu,
  audioDelMenu,
  tarjetaOferta,
} from "./menu-media.js";

/* ── Botones declarativos ──────────────────────────────────────────── */

/**
 * Traduce un botón declarativo al tipo nativo que WhatsApp entiende.
 *   { id }       → quick_reply   (manda ese texto como si se escribiera)
 *   { copy }     → cta_copy      (copia al portapapeles)
 *   { url }      → cta_url       (abre enlace / webview)
 *   { call }     → cta_call      (marca un número)
 *   { sections } → single_select (lista desplegable)
 */
export function botonDeclarativo(b = {}) {
  const texto = b.text || "Opción";
  const icon = b.icon ? String(b.icon).toUpperCase() : undefined;

  if (b.id) {
    return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: texto, id: b.id, icon }) };
  }
  if (b.copy) {
    return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: texto, copy_code: b.copy, icon }) };
  }
  if (b.url) {
    return {
      name: "cta_url",
      buttonParamsJson: JSON.stringify({ display_text: texto, url: b.url, merchant_url: b.url, icon }),
    };
  }
  if (b.call) {
    return { name: "cta_call", buttonParamsJson: JSON.stringify({ display_text: texto, phone_number: b.call, icon }) };
  }
  if (b.sections) {
    return { name: "single_select", buttonParamsJson: JSON.stringify({ title: texto, sections: b.sections, icon }) };
  }
  return null;
}

export function armarBotones(lista = []) {
  return lista.map(botonDeclarativo).filter(Boolean);
}

/**
 * WhatsApp dibuja 3 botones sin desplegar; el cuarto y siguientes solo
 * aparecen si se pide la hoja inferior.
 */
export function paramsHoja(botones = [], { titulo = "Menú", abrir = "Ver más opciones", oferta = null } = {}) {
  const necesitaHoja = botones.length > 3;
  if (!necesitaHoja && !oferta) return undefined;
  const params = {};
  if (necesitaHoja) {
    params.bottom_sheet = {
      in_thread_buttons_limit: 1,
      divider_indices: botones.map((_, i) => i),
      list_title: titulo,
      button_title: abrir,
    };
  }
  if (oferta) {
    params.limited_time_offer = {
      text: oferta.texto,
      copy_code: oferta.codigo,
      ...(oferta.url ? { url: oferta.url } : {}),
    };
  }
  return JSON.stringify(params);
}

/* ── Respaldo en texto ────────────────────────────────────────────── */

/**
 * Escribe los botones como líneas para que se puedan teclear.
 * Los ids salen CON prefijo: copiar «allmenu» no ejecuta nada.
 */
export function textoDeRespaldo(cuerpo, botones = [], prefijo = ".") {
  const conPrefijo = (id) => {
    const s = String(id ?? "").trim();
    if (!s) return s;
    return s.startsWith(prefijo) ? s : `${prefijo}${s}`;
  };
  const lineas = [];
  for (const b of botones) {
    let p = {};
    try {
      p = JSON.parse(b.buttonParamsJson || "{}");
    } catch {
      p = {};
    }
    if (b.name === "single_select") {
      lineas.push(`▸ ${p.title || "Opciones"}:`);
      for (const s of p.sections || []) {
        for (const r of s.rows || []) lineas.push(`   • ${r.title} → ${conPrefijo(r.id)}`);
      }
    } else if (p.url) {
      lineas.push(`▸ ${p.display_text}: ${p.url}`);
    } else if (p.id) {
      lineas.push(`▸ ${p.display_text} → ${conPrefijo(p.id)}`);
    } else if (p.copy_code) {
      lineas.push(`▸ ${p.display_text}: ${p.copy_code}`);
    } else {
      lineas.push(`▸ ${p.display_text || "Opción"}`);
    }
  }
  return lineas.length ? `${cuerpo}\n\n${lineas.join("\n")}` : cuerpo;
}

/* ── Modos ────────────────────────────────────────────────────────── */

export function modoMenu() {
  const v = String(process.env.MENU_MODO || "").trim().toLowerCase();
  if (["clasico", "clásico", "buttons", "legacy"].includes(v)) return "clasico";
  if (["plantilla", "template", "compatible"].includes(v)) return "plantilla";
  return "moderno";
}

function conViewOnce() {
  return String(process.env.MENU_VIEWONCE || "").trim() === "1";
}

/* ── La cabecera de vídeo ─────────────────────────────────────────── */

/**
 * Prepara el vídeo como cabecera animada.
 * Devuelve `videoMessage` con medidas y miniatura, o null.
 */
async function prepararVideo(sock) {
  const video = videoDelMenu();
  if (!video) return null;

  try {
    const datos = video.datos || datosDelVideo(video.buffer) || {};
    const miniatura = miniaturaDelMenu();

    const media = await prepareWAMessageMedia(
      {
        video: video.buffer,
        gifPlayback: true,
        mimetype: "video/mp4",
        // Sin estos tres, el teléfono pinta la tarjeta como archivo.
        ...(datos.seconds ? { seconds: datos.seconds } : {}),
        ...(datos.width && datos.height ? { width: datos.width, height: datos.height } : {}),
        ...(miniatura ? { jpegThumbnail: miniatura } : {}),
      },
      { upload: sock.waUploadToServer },
    );
    return media?.videoMessage || null;
  } catch (err) {
    log.warn("menu: no se pudo preparar el vídeo (" + (err.message || err) + ")");
    return null;
  }
}

/**
 * Prepara la portada dibujada como cabecera fija.
 * Solo se usa cuando no hay vídeo: el vídeo manda (es el efecto «foto que
 * se mueve»); la portada es el respaldo cuando `MENU_TEMA` está puesto o
 * los assets de vídeo no existen.
 */
async function prepararPortada(sock) {
  const portada = portadaDelMenu();
  if (!portada) return null;
  try {
    const media = await prepareWAMessageMedia(
      { image: portada.buffer, mimetype: "image/png" },
      { upload: sock.waUploadToServer },
    );
    return media?.imageMessage || null;
  } catch (err) {
    log.warn("menu: no se pudo preparar la portada (" + (err.message || err) + ")");
    return null;
  }
}

/* ── La tarjeta del menú ──────────────────────────────────────────── */

/**
 * Manda el menú. Una sola función para todo el bot.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op
 * @param {string} op.cuerpo        texto principal
 * @param {string} [op.pie]         línea pequeña
 * @param {Array}  [op.botones]     declarativos
 * @param {object} [op.cita]        mensaje a citar
 * @param {string} [op.prefijo]
 * @param {{title:string, sections:object[]}} [op.selector]  lista desplegable
 * @param {boolean} [op.notaDeVoz]  mandar el audio después
 * @returns {Promise<object|null>}
 */
export async function enviarMenu(sock, jid, op = {}) {
  const {
    cuerpo = "",
    pie = "",
    botones = [],
    cita = null,
    prefijo = ".",
    selector = null,
    notaDeVoz = false,
  } = op;

  const citar = cita ? { quoted: cita } : undefined;

  // Si viene un selector, entra como primer botón (lista desplegable).
  const lista = selector ? [{ text: selector.title || "📂 Categorías", sections: selector.sections }, ...botones] : botones;
  const armados = armarBotones(lista);

  // ── Sin botones o apagados: texto con las opciones escritas ──
  if (!armados.length || String(process.env.MENU_BOTONES || "") === "off") {
    return sock.sendMessage(jid, { text: textoDeRespaldo(cuerpo, armados, prefijo) }, citar);
  }

  // ── Canales: no admiten botones de ninguna forma ──
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
      await sock.sendMessage(jid, { text: cuerpo, footer: pie || undefined, buttons: clasicos }, citar);
      if (notaDeVoz && String(process.env.MENU_AUDIO || "") !== "off") await mandarNotaDeVoz(sock, jid, citar);
      return true;
    }
    // Con listas o enlaces el clásico perdería opciones: sigue el moderno.
  }

  try {
    // Cabecera animada (gifPlayback). Es lo que da el efecto «foto que se mueve».
    const videoMessage = await prepararVideo(sock);
    const imageMessage = videoMessage ? null : await prepararPortada(sock);
    const oferta = tarjetaOferta();

    const interactivo = {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        // Sin este secreto el teléfono no resuelve el toque del botón.
        messageSecret: randomBytes(32),
      },
      interactiveMessage: proto.Message.InteractiveMessage.fromObject({
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: cuerpo }),
        ...(pie ? { footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: pie }) } : {}),
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: "",
          subtitle: "",
          hasMediaAttachment: !!(videoMessage || imageMessage),
          ...(videoMessage ? { videoMessage } : {}),
          ...(imageMessage ? { imageMessage } : {}),
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: armados.map((b) => ({ name: b.name, buttonParamsJson: b.buttonParamsJson })),
          messageParamsJson: paramsHoja(armados, { titulo: pie || "Menú", oferta }) || undefined,
        }),
      }),
    };

    let contenido = conViewOnce() ? { viewOnceMessage: { message: interactivo } } : interactivo;

    if (modo === "plantilla" && !conViewOnce()) {
      contenido = {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
          messageSecret: randomBytes(32),
        },
        templateMessage: {
          interactiveMessageTemplate: interactivo.interactiveMessage,
          templateId: "MENU-" + Date.now(),
        },
      };
    }

    const armado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted: cita || undefined,
    });

    await sock.relayMessage(jid, armado.message, {
      messageId: armado.key.id,
      // UN solo <biz> completo. Sin él, el teléfono tira el mensaje sin avisar.
      additionalNodes: nodosInteractivos(jid, { ai: true }),
    });

    if (notaDeVoz && String(process.env.MENU_AUDIO || "") !== "off") {
      await mandarNotaDeVoz(sock, jid, citar);
    }

    return armado;
  } catch (err) {
    log.warn("menu: el envío nativo falló, se manda el texto (" + (err.message || err) + ")");
    try {
      return await sock.sendMessage(jid, { text: textoDeRespaldo(cuerpo, armados, prefijo) }, citar);
    } catch {
      return null;
    }
  }
}

/**
 * Nota de voz del menú.
 * Va DESPUÉS de la tarjeta y citada sobre ella, como en los bots de
 * referencia: así el audio queda «colgando» de la tarjeta y no suelto.
 * Si el asset no está o el envío falla, no rompe nada.
 */
export async function mandarNotaDeVoz(sock, jid, citar = undefined) {
  const audio = audioDelMenu();
  if (!audio) return false;
  try {
    await sock.sendMessage(
      jid,
      { audio: audio.buffer, mimetype: "audio/ogg; codecs=opus", ptt: true },
      citar,
    );
    return true;
  } catch (err) {
    log.warn("menu: la nota de voz no se pudo enviar (" + (err.message || err) + ")");
    return false;
  }
}

/**
 * Arma el contenido SIN enviarlo. Para las pruebas offline: se puede
 * comprobar el payload completo sin abrir WhatsApp.
 */
export function armarPayload({ cuerpo = "", pie = "", botones = [], selector = null, videoMessage = null }) {
  const lista = selector ? [{ text: selector.title || "Categorías", sections: selector.sections }, ...botones] : botones;
  const armados = armarBotones(lista);
  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32),
    },
    interactiveMessage: {
      body: { text: cuerpo },
      ...(pie ? { footer: { text: pie } } : {}),
      header: {
        title: "",
        hasMediaAttachment: !!videoMessage,
        ...(videoMessage ? { videoMessage } : {}),
      },
      nativeFlowMessage: {
        buttons: armados,
        messageParamsJson: paramsHoja(armados, { titulo: pie || "Menú", oferta: tarjetaOferta() }),
      },
    },
  };
}

export default { enviarMenu, mandarNotaDeVoz, armarPayload, armarBotones, textoDeRespaldo };
