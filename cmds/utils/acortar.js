/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * .acortar <url>  →  acorta una URL con TinyURL.
 */
import { runGuarded } from '#lib/apiBreaker';
// Un enlace que hay que seleccionar a mano no sirve de nada en el
// móvil: cta_copy lo copia de un toque y cta_url lo abre.
import { sendInteractive, ctaCopy, ctaUrl } from "#interactive";

export default {
  command: ['acortar', 'shorturl', 'shorten', 'acorta'],
  category: 'utils',
  description: 'Acortar un enlace con TinyURL.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    if (!text) {
      return msg.reply(
        `《✧》 Envía un *enlace* para acortar.\n`
        + `> Ejemplo: ${usedPrefix}acortar https://github.com/riokuroxi-svg/Ginko-MD`
      );
    }
    const url = text.trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(url)) {
      return msg.reply(`《✧》 El texto no parece un enlace válido (debe empezar con http:// o https://).`);
    }
    try {
      const res = await runGuarded('tinyurl', async () => fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`));
      const short = (await res.text()).trim();
      if (!res.ok || !short.startsWith('http')) {
        return msg.reply(`《✧》 No se pudo acortar el enlace. Intenta más tarde.`);
      }
      const cuerpo = `🔗 *Enlace acortado:*\n\n> ${short}\n\n_Original:_ ${url}`;
      await sendInteractive(sock, msg.chat, {
        body: cuerpo,
        footer: "TinyURL · Shin-MD",
        buttons: [ctaCopy("📋 Copiar el corto", short), ctaUrl("🌐 Abrirlo", short)],
        quoted: msg.full || msg,
        fallbackText: cuerpo,
      });
    } catch (e) {
      await msg.reply(`《✧》 Error al acortar.\n> ${e.message || 'error'}`);
    }
  },
};
