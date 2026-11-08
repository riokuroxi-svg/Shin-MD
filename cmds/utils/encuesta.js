/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  encuesta.js — Encuestas, quizzes y votaciones múltiples
//
//  Antes esto mandaba siempre la misma encuesta simple. WhatsApp tiene
//  dos cosas más que casi ningún bot usa:
//
//   · QUIZ (pollType 1 + correctAnswer): al votar, la app marca en
//     verde la respuesta buena y en rojo la mala. Lo corrige WhatsApp,
//     no el bot, así que funciona aunque el bot esté caído.
//     Se activa solo: marca la opción correcta con un asterisco.
//
//   · VOTO MÚLTIPLE (selectableOptionsCount > 1): deja elegir varias.
//     Se activa escribiendo "multi" delante de la pregunta.
//
//  Uso:
//    .encuesta ¿Qué pizza?|Pepperoni|Hawaiana|4 Quesos
//    .encuesta ¿Capital de Japón?|Kioto|*Tokio|Osaka      ← quiz
//    .encuesta multi ¿Qué días?|Lunes|Martes|Viernes      ← varias
//
//  Si el quiz no sale (servidor raro, versión vieja), cae solo a la
//  encuesta normal: el usuario nunca se queda sin su votación.
// ═══════════════════════════════════════════════════════════════════

import { parseQuiz, sendQuiz, MIN_OPCIONES, MAX_OPCIONES } from "#lib/poll-plus";

/**
 * Interpreta la línea entera del usuario. Pura, para poder probarla.
 *
 * @returns {{ok:boolean, error?:string, tipo?:"quiz"|"encuesta",
 *            pregunta?:string, opciones?:string[], correcta?:number,
 *            selectableCount?:number}}
 */
export function parsePeticionEncuesta(texto = "") {
  let t = String(texto || "").trim();
  if (!t) return { ok: false, error: "vacio" };

  // "multi" / "multiple" / "varias" al principio → voto múltiple
  let multiple = false;
  const m = t.match(/^(multi|múlti|multiple|múltiple|varias|varios)\s+/i);
  if (m) { multiple = true; t = t.slice(m[0].length).trim(); }

  if (!t.includes("|")) return { ok: false, error: "sin-plecas" };

  const partes = t.split("|").map((s) => s.trim()).filter(Boolean);
  const pregunta = partes.shift();
  const crudas = partes;

  if (!pregunta) return { ok: false, error: "sin-pregunta" };
  if (crudas.length < MIN_OPCIONES) return { ok: false, error: "pocas" };
  if (crudas.length > MAX_OPCIONES) return { ok: false, error: "muchas" };

  // ¿Hay alguna opción marcada con asterisco? Entonces es un quiz y de
  // la validación fina se encarga parseQuiz (una sola correcta, etc.).
  const hayMarca = crudas.some((o) => o.startsWith("*") || o.endsWith("*"));
  if (hayMarca) {
    const quiz = parseQuiz([pregunta, ...crudas].join(" | "));
    if (!quiz.ok) return { ok: false, error: quiz.error };
    // Un quiz siempre es de respuesta única: WhatsApp no admite otra cosa.
    return { ok: true, tipo: "quiz", ...quiz, selectableCount: 1 };
  }

  return {
    ok: true,
    tipo: "encuesta",
    pregunta,
    opciones: crudas,
    selectableCount: multiple ? crudas.length : 1,
  };
}

/** Mensajes de error en cristiano, sin jerga. */
export function explicarError(error, prefijo = ".") {
  const ayuda = `\n> Ejemplo: \`${prefijo}encuesta ¿Qué pizza?|Pepperoni|Hawaiana\``
    + `\n> Quiz: \`${prefijo}encuesta ¿Capital de Japón?|Kioto|*Tokio|Osaka\` (el asterisco marca la correcta)`;
  const textos = {
    vacio: "Falta la pregunta.",
    "sin-plecas": "Separa la pregunta y las opciones con una pleca `|`.",
    "sin-pregunta": "Falta la pregunta antes de la primera pleca.",
    "faltan datos": "Alguna opción se quedó vacía.",
    pocas: `Hacen falta al menos ${MIN_OPCIONES} opciones.`,
    muchas: `WhatsApp admite como mucho ${MAX_OPCIONES} opciones.`,
    "sin correcta": "Marca la respuesta correcta con un asterisco.",
    "varias correctas": "Solo puede haber *una* respuesta correcta en un quiz.",
  };
  return `《✧》 ${textos[error] || "No entendí la encuesta."}${ayuda}`;
}

export default {
  command: ["encuesta", "poll", "votacion", "quiz"],
  category: "utils",
  description: "Crea una encuesta, un quiz con respuesta correcta o una votación de varias opciones.",

  run: async ({ msg, sock, usedPrefix, text }) => {
    const pref = usedPrefix || ".";
    const pet = parsePeticionEncuesta(text);
    if (!pet.ok) return msg.reply(explicarError(pet.error, pref));

    try {
      if (pet.tipo === "quiz") {
        const r = await sendQuiz(
          sock,
          msg.chat,
          { pregunta: pet.pregunta, opciones: pet.opciones, correcta: pet.correcta },
          { quoted: msg.full || msg },
        );
        if (r.sent) return;
        // Respaldo: encuesta normal, avisando de cuál era la buena.
        await msg.reply({
          poll: { name: pet.pregunta, values: pet.opciones, selectableCount: 1 },
        });
        return msg.reply(
          `《✧》 Tu WhatsApp no admitió el quiz, así que lo mandé como encuesta normal.\n`
          + `> La respuesta correcta era: *${pet.opciones[pet.correcta]}*`,
        );
      }

      await msg.reply({
        poll: {
          name: pet.pregunta,
          values: pet.opciones,
          selectableCount: pet.selectableCount,
        },
      });
    } catch (e) {
      return msg.reply(`《✧》 No pude crear la encuesta.\n> ${e?.message || e}`);
    }
  },
};
