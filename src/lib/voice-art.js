/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  voice-art.js — Notas de voz con onda dibujada y burbuja de color
//
//  QUÉ SE DESCUBRIÓ (y por qué nadie lo usa)
//  -----------------------------------------
//  1. audioMessage.waveform → 64 bytes que dibuja el emisor (ver
//     #lib/waveform). Baileys los sobreescribe con los reales SOLO si
//     le pasas ptt:true al preparar el medio:
//
//        requiresWaveformProcessing = mediaType === 'audio'
//                                     && uploadData.ptt === true
//        (node_modules/baileys/lib/Utils/messages.js:131)
//
//     Truco: se prepara el audio SIN ptt (así no lo analiza ni lo
//     pisa) y se marca ptt:true después, ya sobre el objeto. Sale
//     nota de voz, con nuestra onda intacta y sin gastar CPU
//     decodificando el mp3.
//
//  2. audioMessage.backgroundArgb → color de fondo de la burbuja.
//     Baileys solo lo rellena para estados (options.backgroundColor
//     con ptt), nunca para un chat normal. Aquí se pone a mano.
//
//  Todo con baileys 6.7.24 oficial: se arma el contenido y se manda
//  por relayMessage, igual que las tarjetas interactivas.
// ═══════════════════════════════════════════════════════════════════

import { drawWaveform, esWaveformValida, waveformFromText } from "#lib/waveform";

/**
 * "#ff4fa3" | "ff4fa3" | "FFFF4FA3" | 0xff4fa3 → entero ARGB.
 * Si no llega alfa, se asume opaco (FF), igual que hace baileys.
 * @returns {number|null} null si no es un color reconocible
 */
export function hexToArgb(color) {
  if (color === null || color === undefined || color === "") return null;

  if (typeof color === "number") {
    if (!Number.isFinite(color)) return null;
    // Negativos = ya vienen como int32 con signo; se normaliza a uint32.
    return color >= 0 ? color >>> 0 : (0xffffffff + color + 1) >>> 0;
  }

  let hex = String(color).trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length <= 6) hex = "FF" + hex.padStart(6, "0");
  if (hex.length !== 8) return null;

  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n >>> 0 : null;
}

/**
 * Deja listo un audioMessage con la onda y el color puestos.
 * Función aparte (y pura respecto a la red) para poder probarla:
 * recibe el audioMessage ya subido y devuelve el mismo objeto tocado.
 *
 * @param {object} audioMessage  el que devuelve prepareWAMessageMedia
 * @param {object} [op]
 * @param {string} [op.patron="firma"]  patrón de #lib/waveform
 * @param {string} [op.semilla]         texto que define la onda "firma"
 * @param {Uint8Array} [op.waveform]    onda ya dibujada (gana sobre patrón)
 * @param {string|number} [op.color]    fondo de la burbuja
 * @param {boolean} [op.ptt=true]       nota de voz (sin esto no hay onda)
 * @param {number} [op.seconds]
 */
export function vestirAudio(audioMessage, op = {}) {
  if (!audioMessage) throw new Error("falta el audioMessage");

  const onda = op.waveform
    ? op.waveform
    : op.patron === "firma" || !op.patron
      ? waveformFromText(op.semilla ?? "shin-md")
      : drawWaveform(op.patron, { semilla: op.semilla });

  if (!esWaveformValida(onda)) throw new Error("waveform inválida (deben ser 64 bytes 0-100)");

  audioMessage.waveform = onda;
  if (op.ptt !== false) audioMessage.ptt = true;

  const argb = hexToArgb(op.color);
  if (argb !== null) audioMessage.backgroundArgb = argb;

  if (Number.isFinite(op.seconds) && op.seconds > 0) {
    audioMessage.seconds = Math.round(op.seconds);
  }
  return audioMessage;
}

/**
 * Envía una nota de voz con onda propia.
 * Nunca lanza: devuelve {sent:false} para que quien llama pueda
 * caer al envío normal sin romper el comando.
 *
 * @returns {Promise<{sent: boolean, key?: object, error?: any}>}
 */
export async function sendVoiceArt(sock, jid, {
  audio,
  mimetype = "audio/mpeg",
  seconds,
  patron = "firma",
  semilla,
  color,
  quoted,
  ptt = true,
  contextInfo,
} = {}) {
  try {
    if (!sock?.relayMessage) throw new Error("el socket no expone relayMessage");
    if (typeof sock.waUploadToServer !== "function") throw new Error("el socket no puede subir medios");
    if (!audio) throw new Error("falta el audio");

    const { prepareWAMessageMedia, generateWAMessageFromContent } = await import("baileys");

    // OJO: se prepara SIN ptt a propósito (ver cabecera del archivo).
    const preparado = await prepareWAMessageMedia(
      { audio, mimetype, ...(Number.isFinite(seconds) && seconds > 0 ? { seconds: Math.round(seconds) } : {}) },
      { upload: sock.waUploadToServer },
    );

    const audioMessage = preparado?.audioMessage;
    if (!audioMessage) throw new Error("no se pudo preparar el audio");

    vestirAudio(audioMessage, { patron, semilla, color, ptt, seconds });
    if (contextInfo) audioMessage.contextInfo = { ...(audioMessage.contextInfo || {}), ...contextInfo };

    const generado = generateWAMessageFromContent(jid, { audioMessage }, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });
    if (!generado?.key?.id) throw new Error("no se generó el mensaje");

    await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}
