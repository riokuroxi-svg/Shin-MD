// Demo — muestra la capacidad de carrusel: tabla + imágenes + botones
// en un SOLO mensaje (lo que los bots avanzados hacen, tipo reels/insta).
// Usa sendCarousel del helper interactivo.

import { sendCarousel, quickReply } from "#interactive";

const DEMO_IMAGES = [
  "https://picsum.photos/seed/shin1/400/400",
  "https://picsum.photos/seed/shin2/400/400",
  "https://picsum.photos/seed/shin3/400/400",
];

export default {
  name: "demo",
  aliases: ["showcase", "carousel", "reels"],
  category: "info",
  description: "Muestra carrusel con imagen, texto y botones 🎠",
  usage: ".demo",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    const cards = [
      {
        image: DEMO_IMAGES[0],
        title: "反魂 Shin-MD",
        body: "Tabla + imagen + botones\nen un solo mensaje ✨",
        footer: "Hecho desde cero · AGPL-3.0",
        buttons: [quickReply("🎮 Juegos", "menu games"), quickReply("📋 Info", "menu info")],
      },
      {
        image: DEMO_IMAGES[1],
        title: "Botones interactivos",
        body: "Toca una opción y el bot responde\nsin que escribas nada.",
        footer: "Anti-ban nativo",
        buttons: [quickReply("🛠️ Utilidad", "menu utility"), quickReply("👑 Owner", "owner")],
      },
      {
        image: DEMO_IMAGES[2],
        title: "Descarga sin binarios",
        body: "Play/descargas vía API HTTP.\nCero ffmpeg en el servidor.",
        footer: "Ideal para BoxMine",
        buttons: [quickReply("🎵 Play", "play")],
      },
    ];

    try {
      await sendCarousel(sock, ctx.chatId, {
        title: "反魂 Shin-MD",
        body: "✨ *Carrusel de demostración*\nDesliza entre tarjetas →",
        footer: "反魂 · AGPL-3.0",
        cards,
        quoted: ctx.full,
      });
      return null;
    } catch {
      // Fallback: lista simple en texto
      return "✨ *Carrusel no disponible en este dispositivo.*\n\n" +
        cards.map((c, i) => (i + 1) + ". *" + c.title + "*\n   " + c.body.replace(/\n/g, " ")).join("\n\n");
    }
  },
};
