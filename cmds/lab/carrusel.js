/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Carrusel de tarjetas con imagen (vitrina del gacha) — solo dueño.
// Antes: `.lab carrusel`. Nombre propio para que no choque con nadie.

import fs from "node:fs";
import { portadasDisponibles } from "#lib/lab-experiments";
import { buildTarjeta, prepararImagen, sendCarousel } from "#lib/carousel";

export default {
  name: "carrusel",
  category: "owner",
  description: "Manda un carrusel de tarjetas deslizables con foto y botones",
  usage: ".carrusel",
  cooldown: 15,
  ownerOnly: true,

  async handler(sock, ctx) {
    const fotos = portadasDisponibles(3);
    const demos = [
      { titulo: "Zero Two ★5", cuerpo: "Darling in the FranXX · 480 🪙" },
      { titulo: "Mikasa ★4", cuerpo: "Shingeki no Kyojin · 260 🪙" },
      { titulo: "Nezuko ★4", cuerpo: "Kimetsu no Yaiba · 300 🪙" },
    ];

    const tarjetas = [];
    for (const [i, d] of demos.entries()) {
      // Si la subida de la foto falla, la tarjeta sale sin ella; no se pierde.
      const imagen = fotos[i] ? await prepararImagen(sock, fs.readFileSync(fotos[i])) : null;
      tarjetas.push(buildTarjeta({
        ...d,
        pie: "反魂 · gacha",
        imagen,
        botones: [
          { texto: "💖 Reclamar", id: ".claim" },
          { texto: "⭐ Favorita", id: ".setfavourite" },
        ],
      }));
    }

    const r = await sendCarousel(sock, ctx.chatId, {
      texto: `🎴 *RollWaifu* · te salieron ${tarjetas.length} cartas — desliza →`,
      respaldo: demos.map((d, i) => `${i + 1}. ${d.titulo} — ${d.cuerpo}`).join("\n"),
      quoted: ctx.full,
      tarjetas,
    });

    if (!r.sent) return `🧪 No se pudo mandar el carrusel.\n> ${r.error?.message || r.error}`;
    return "🎠 Carrusel enviado: pásalo con el dedo. Si tu WhatsApp no lo dibuja, dime y lo archivamos.";
  },
};
