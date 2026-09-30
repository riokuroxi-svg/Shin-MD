/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  ptv.js — Video redondo (mensaje de video instantáneo)
//
//  Es el video en círculo que WhatsApp graba manteniendo el botón de
//  la cámara. Baileys lo soporta de forma nativa — lo verifiqué en
//  node_modules/baileys/lib/Utils/messages.js:377
//
//      else if ('ptv' in message && message.ptv) {
//          const { videoMessage } = await prepareWAMessageMedia(...)
//          m.ptvMessage = videoMessage
//      }
//
//  …y aun así no lo usa prácticamente ningún bot.
//
//  Uso: responde a un video con  .ptv
//
//  Límites REALES de WhatsApp para estos videos (por eso se revisan
//  antes de gastar datos bajando el archivo):
//    · máximo 60 segundos
//    · el video se recorta a un círculo: lo que esté en las esquinas
//      se pierde, así que conviene que el sujeto esté en el centro
// ═══════════════════════════════════════════════════════════════════

import { downloadContentFromMessage } from "baileys";
import { state, footer } from "#lib/theme";

const MAX_SEGUNDOS = 60;
const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Comprueba si un videoMessage puede mandarse como video redondo.
 * Pura y exportada: se prueba sin sesión ni descargas.
 * @returns {{ok:boolean, motivo?:string, segundos?:number}}
 */
export function puedeSerPtv(videoMessage) {
  if (!videoMessage) return { ok: false, motivo: "sin video" };

  const segundos = Number(videoMessage.seconds || 0);
  if (segundos > MAX_SEGUNDOS) return { ok: false, motivo: "largo", segundos };

  const bytes = Number(videoMessage.fileLength || 0);
  if (bytes > MAX_BYTES) return { ok: false, motivo: "pesado", segundos };

  if (videoMessage.gifPlayback) return { ok: false, motivo: "gif", segundos };

  return { ok: true, segundos };
}

/** Descarga el video citado a un Buffer. */
async function bajarVideo(videoMessage) {
  const stream = await downloadContentFromMessage(videoMessage, "video");
  const trozos = [];
  for await (const t of stream) trozos.push(t);
  return Buffer.concat(trozos);
}

export default {
  name: "ptv",
  aliases: ["videoredondo", "redondo", "notavideo"],
  category: "utils",
  description: "Convierte el video que respondes en un video redondo",
  usage: ".ptv  (respondiendo a un video de menos de 60 s)",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx) {
    const video = ctx.replyMsg?.message?.videoMessage;
    if (!video) {
      return state("needQuote", { action: "convertir en redondo" }) +
        "\n> Tiene que ser un *video* de menos de 60 segundos.";
    }

    const revision = puedeSerPtv(video);
    if (!revision.ok) {
      const avisos = {
        largo: `El video dura *${revision.segundos}s* y el máximo son *60s*.\n> Recórtalo y vuelve a intentarlo.`,
        pesado: "El video pesa demasiado (más de 16 MB).",
        gif: "Eso es un GIF, no un video: WhatsApp no lo acepta como video redondo.",
        "sin video": "No encontré el video.",
      };
      return `⭕ *Video redondo*\n> ${avisos[revision.motivo] || "No se puede convertir."}`;
    }

    try {
      const buffer = await bajarVideo(video);
      await sock.sendMessage(ctx.chatId, { video: buffer, ptv: true }, { quoted: ctx.full });
      return null; // ya se envió el video: nada de texto encima
    } catch (e) {
      return state("error", { detail: e?.message }) + "\n" + footer();
    }
  },
};
