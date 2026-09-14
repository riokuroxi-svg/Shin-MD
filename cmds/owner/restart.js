/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
export default {
  command: ['restart'],
  category: 'owner',
  description: 'Reiniciar el socket del bot.',
  isOwner: true,
  run: async ({ msg, sock }) => {
    await sock.reply(msg.chat, `✎ Reiniciando el Socket...\n> *Espere un momento...*`, msg);
    setTimeout(() => {
      if (process.send) {
        process.send("restart");
      } else {
        process.exit(0);
      }
    }, 3000);
  },
};