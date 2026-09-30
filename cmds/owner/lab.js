/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lab.js — Laboratorio de interfaz (solo dueño)
//
//  Manda de una en una las piezas de interfaz que WhatsApp entiende
//  pero que ningún bot usa. Que el mensaje se arme y viaje está
//  probado contra el protocolo (test/tanda3.test.js); que TU versión
//  de WhatsApp lo dibuje solo se sabe mirándolo. Eso es esto.
//
//    .lab                 → la lista
//    .lab 1  /  .lab tabla→ manda ese experimento
//    .lab voz             → responde a un audio para vestirlo
//    .lab fuentes 9       → prueba la tipografía número 9
//
//  Nada de esto toca los comandos de diario: lo que salga bien se
//  promueve después, a mano.
// ═══════════════════════════════════════════════════════════════════

import { EXPERIMENTOS, buscarExperimento, listarExperimentos } from "#lib/lab-experiments";
import { boxData, boxNotice, footer, state } from "#lib/theme";

/** Descarga el audio citado, si lo hay. */
async function descargarAudioCitado(ctx) {
  const citado = ctx?.quoted?.quotedMessage;
  const audio = citado?.audioMessage || citado?.documentMessage;
  if (!audio) return null;

  const { downloadContentFromMessage } = await import("baileys");
  const stream = await downloadContentFromMessage(audio, "audio");
  const trozos = [];
  for await (const trozo of stream) trozos.push(trozo);
  return Buffer.concat(trozos);
}

function listado(prefijo) {
  const filas = listarExperimentos().map((e) => [
    `${e.n}. ${e.clave}`,
    e.titulo + (e.necesita ? ` (${e.necesita})` : ""),
  ]);

  return (
    boxData("Laboratorio de interfaz", filas) +
    "\n" +
    boxNotice(
      "Cómo se usa",
      `Manda uno por uno con \`${prefijo}lab <número>\` y dime cuáles se ven bien.\n` +
      "Lo que se vea bien pasa a los comandos de diario; lo demás se queda fuera.",
    ) +
    "\n" + footer()
  );
}

export default {
  name: "lab",
  aliases: ["laboratorio", "uilab"],
  category: "owner",
  description: "Prueba piezas de interfaz que WhatsApp entiende y casi nadie usa",
  usage: ".lab · .lab 1 · .lab voz (respondiendo a un audio)",
  cooldown: 5,
  ownerOnly: true,

  async handler(sock, ctx) {
    const prefijo = ctx.usedPrefix || ".";
    const partes = String(ctx.arg || "").trim().split(/\s+/).filter(Boolean);

    if (!partes.length) return listado(prefijo);

    const experimento = buscarExperimento(partes[0]);
    if (!experimento) {
      return (
        `🧪 No tengo ningún experimento llamado *${partes[0]}*.\n\n` +
        state("usage", {
          usage: `${prefijo}lab <1-${EXPERIMENTOS.length}> o el nombre corto`,
          example: `${prefijo}lab tabla`,
        })
      );
    }

    const extra = partes.slice(1).join(" ");
    const contexto = {
      jid: ctx.chatId,
      quoted: ctx.full,
      autor: ctx.senderId,
      ahora: Date.now(),
      texto: extra || undefined,
      fuente: /^\d+$/.test(extra) ? parseInt(extra, 10) : undefined,
      patron: /^[a-záéíóú]+$/i.test(extra) ? extra : undefined,
      semilla: extra || undefined,
      descargarAudio: () => descargarAudioCitado(ctx).catch(() => null),
    };

    let resultado;
    try {
      resultado = await experimento.ejecutar(sock, contexto);
    } catch (e) {
      resultado = { ok: false, motivo: e?.message || String(e) };
    }

    if (!resultado?.ok) {
      return `🧪 *${experimento.titulo}* no se pudo mandar.\n> ${resultado?.motivo || "error desconocido"}`;
    }

    // El mensaje del experimento ya se envió; este es el "qué mirar".
    return (
      `🧪 *${experimento.titulo}*\n` +
      `> ${experimento.mira}\n\n` +
      `_¿Se ve así? Dime sí o no y sigo con \`${prefijo}lab ${(EXPERIMENTOS.indexOf(experimento) + 2)}\`._`
    );
  },
};
