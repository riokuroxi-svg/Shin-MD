/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
export default {
  command: ['qrcode', 'qrgen', 'makeqr'],
  category: 'utils',
  description: 'Generar un código QR a partir de un texto o enlace.',
  run: async ({ msg, sock, usedPrefix, text }) => {
    if (!text) {
      return msg.reply(
        `《✧》 Escribe el *texto* o *enlace* para generar el QR.\n`
        + `> Ejemplo: ${usedPrefix}qr https://github.com/riokuroxi-svg/Shin-MD`
      );
    }
    try {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      await sock.sendMessage(msg.chat, {
        image: buffer,
        caption: `📱 *QR generado*\n\n> Contenido: ${text.slice(0, 200)}`,
      }, { quoted: msg });
    } catch (e) {
      await msg.reply(`《✧》 No pude generar el QR.\n> ${e.message || 'error'}`);
    }
  },
};
