/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  translate.js — Traducir, con la cara de WhatsApp
//
//  WhatsApp tiene traducción desde 2025, pero se hace entera en el
//  móvil: en Android solo entre seis idiomas, en WhatsApp Web no
//  existe y no hay forma de dispararla desde fuera (lo comprobé: cero
//  campos de traducción en los 2113 del protocolo). Así que aquí sí
//  hace falta el bot.
//
//  Lo que cambia respecto a la versión anterior:
//    · la respuesta es una tarjeta nativa con las dos banderas, botón
//      de copiar y aviso de traducción automática, no un texto suelto;
//    · dos proveedores encadenados, así que si uno se cae sigue
//      funcionando (Google devuelve 429 más a menudo de lo que la
//      gente cree);
//    · detector de idioma propio, sin red;
//    · acepta ".tr inglés", ".tr ingles", ".tr en" o ".tr english";
//    · y los errores están en español, como el resto del bot.
// ═══════════════════════════════════════════════════════════════════

import {
  parsePeticion, traducir, sendTraduccion, detectarIdioma,
  nombreIdioma, banderaIdioma, resolverIdioma, IDIOMAS,
} from "#lib/translate";
import { state } from "#lib/theme";

const AYUDA =
  "Escribe el idioma y el texto, o responde a un mensaje.\n\n" +
  "› .tr inglés hola qué tal\n" +
  "› .tr en   (respondiendo a un mensaje)\n" +
  "› .tr      (responde y lo pasa al español)\n\n" +
  "Idiomas: " + Object.keys(IDIOMAS).slice(0, 14).map((c) => `${banderaIdioma(c)} ${c}`).join("  ");

export default {
  command: ["translate", "trad", "traducir", "tr"],
  category: "utils",
  description: "Traduce un texto o el mensaje al que respondas.",

  run: async ({ msg, sock, args }) => {
    const citado = msg.quoted?.text || msg.quoted?.caption || msg.quoted?.body || "";
    const peticion = parsePeticion(args, citado);

    if (!peticion.ok) return msg.reply(AYUDA);

    // Si pide traducir al idioma en el que ya está, lo pasamos al
    // inglés: es lo que la persona quería decir el 99 % de las veces.
    let destino = peticion.idioma;
    const antes = detectarIdioma(peticion.texto);
    if (antes.codigo && antes.codigo === destino && antes.confianza >= 0.3) {
      destino = destino === "en" ? "es" : "en";
    }

    await msg.react("🌐").catch(() => {});

    const r = await traducir(peticion.texto, destino);

    if (!r.ok) {
      await msg.react("✖️").catch(() => {});
      const motivos = {
        "idioma-desconocido": "No conozco ese idioma. Prueba con el código de dos letras, por ejemplo *en* o *ja*.",
        "tiempo-agotado": "El traductor tardó demasiado. Inténtalo otra vez en un momento.",
        "sin-texto": "No hay nada que traducir.",
        "sin-red": "Me quedé sin conexión para traducir.",
      };
      return msg.reply(state("error", { detail: motivos[r.motivo] || "Los dos traductores fallaron. Vuelve a intentarlo en un rato." }));
    }

    const salida = await sendTraduccion(
      sock,
      msg.chat,
      {
        original: peticion.texto,
        traduccion: r.texto,
        de: r.de,
        a: r.a,
        fuente: r.fuente,
      },
      { quoted: msg },
    );

    await msg.react(salida.sent ? "✅" : "✖️").catch(() => {});
    if (!salida.sent) return msg.reply(state("error", { detail: "No pude enviar la traducción." }));
    return undefined;
  },
};

export { nombreIdioma, resolverIdioma };
