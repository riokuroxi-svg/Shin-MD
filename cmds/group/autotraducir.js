/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  autotraducir.js — Traducción automática del grupo
//
//  Esto es lo que WhatsApp NO hace: su traducción es para ti solo, en
//  tu móvil, y en Android únicamente entre seis idiomas. Aquí el bot
//  traduce para TODO el grupo, en el chat, y se ve desde el
//  ordenador igual que desde el teléfono.
//
//  Uso (solo admins):
//    .autotraducir es      → traduce al español lo que llegue en otro idioma
//    .autotraducir off     → lo apaga
//    .autotraducir         → dice cómo está ahora
//
//  Frenos, porque esto podría duplicar el tráfico del grupo y con el
//  warm-up anti-ban eso es justo lo que no queremos:
//    · si el mensaje ya está en el idioma del grupo, no se llama al
//      traductor ni se envía nada (lo decide el detector local),
//    · nada de mensajes cortos, enlaces sueltos, emojis ni comandos,
//    · un hueco mínimo de 8 s entre traducciones y tope de 30 por
//      hora y grupo,
//    · y si hay varios bots en el grupo, solo responde el principal.
// ═══════════════════════════════════════════════════════════════════

import db from "../../src/services/ginko-db.js";
import {
  resolverIdioma, nombreIdioma, banderaIdioma, debeTraducir,
  traducir, sendTraduccion, crearFreno,
} from "#lib/translate";
import { state, boxNotice } from "#lib/theme";

/** Frenos en memoria: se reinician con el bot, y está bien así. */
const freno = crearFreno({ huecoMs: 8000, porHora: 30 });

/** Devuelve el idioma configurado del chat, o "" si está apagado. */
export function idiomaDelChat(chat) {
  const valor = String(chat?.autotr ?? "").trim().toLowerCase();
  if (!valor || valor === "off" || valor === "0") return "";
  return resolverIdioma(valor) || "";
}

/**
 * Todo lo que hay que decidir antes de tocar la red, en una función
 * pura para poder probarla sin sesión ni grupo.
 */
export function decidir({ texto, idioma, esBot = false, esGrupo = true, esPrincipal = true } = {}) {
  if (!esGrupo) return { si: false, motivo: "no-es-grupo" };
  if (esBot) return { si: false, motivo: "es-del-bot" };
  if (!esPrincipal) return { si: false, motivo: "otro-bot-manda" };
  if (!idioma) return { si: false, motivo: "apagado" };
  return debeTraducir(texto, { destino: idioma });
}

export async function before({ msg, sock }) {
  try {
    if (!msg?.isGroup || msg.isBot) return;

    const chat = db.getChat(msg.chat);
    const idioma = idiomaDelChat(chat);
    if (!idioma) return;

    const botId = (sock?.user?.id || "").split(":")[0] + "@s.whatsapp.net";
    const principal = !chat?.primaryBot || chat.primaryBot === botId;

    const texto = msg.text || msg.body || "";
    const veredicto = decidir({ texto, idioma, esBot: msg.isBot, esGrupo: true, esPrincipal: principal });
    if (!veredicto.si) return;

    if (!freno.permite(msg.chat)) return;

    const r = await traducir(texto, idioma);
    if (!r.ok || !r.texto) return;

    // Segundo filtro, ahora con lo que diga el proveedor: si resulta
    // que ya venía en ese idioma, no ensuciamos el grupo.
    if (r.de && r.de === idioma) return;
    if (r.texto.trim().toLowerCase() === texto.trim().toLowerCase()) return;

    await sendTraduccion(
      sock,
      msg.chat,
      { original: texto, traduccion: r.texto, de: r.de, a: r.a, fuente: r.fuente, conBotones: false },
      { quoted: msg },
    );
  } catch {
    // Un hook nunca puede tumbar el flujo de mensajes del grupo.
  }
}

export default {
  command: ["autotraducir", "autotrad", "autotr"],
  category: "group",
  description: "Traduce automáticamente al idioma que elijas lo que llegue en otro.",
  group: true,
  admin: true,

  run: async ({ msg, args }) => {
    const chat = db.getChat(msg.chat) || {};
    const actual = idiomaDelChat(chat);
    const pedido = String(args?.[0] ?? "").trim().toLowerCase();

    if (!pedido) {
      return msg.reply(boxNotice("🌐", actual
        ? [
            `La traducción automática está *encendida* en ${banderaIdioma(actual)} *${nombreIdioma(actual)}*.`,
            "Para apagarla: `.autotraducir off`",
          ]
        : [
            "La traducción automática está *apagada*.",
            "Para encenderla: `.autotraducir es` (o el idioma que quieras).",
          ]));
    }

    if (["off", "no", "apagar", "0"].includes(pedido)) {
      db.setChat(msg.chat, "autotr", "");
      freno.olvidar(msg.chat);
      return msg.reply(state("success", { text: "Traducción automática apagada." }));
    }

    const idioma = resolverIdioma(pedido);
    if (!idioma) {
      return msg.reply(state("notfound", {
        what: `el idioma "${pedido}"`,
        hint: "Prueba con `es`, `en`, `pt`, `ja`… o con el nombre: `inglés`, `japonés`.",
      }));
    }

    db.setChat(msg.chat, "autotr", idioma);
    freno.olvidar(msg.chat);
    return msg.reply(boxNotice("🌐", [
      `Traducción automática *encendida* en ${banderaIdioma(idioma)} *${nombreIdioma(idioma)}*.`,
      "Traduzco lo que llegue en otro idioma, sin tocar lo que ya esté en este.",
      "_Máximo 30 por hora para no cansar al grupo._",
    ]));
  },
};
