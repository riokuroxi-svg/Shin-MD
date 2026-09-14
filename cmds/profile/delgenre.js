/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';
export default {
  command: ['delgenre'],
  category: 'profile',
  description: 'Eliminar tu género del perfil.',
  run: async ({ msg }) => {
    const user = db.getUser(msg.sender);
    if (!user.genre) {
      return msg.reply(`《✧》 No tienes un género asignado.`);
    }    
    db.setUser(msg.sender, 'genre', '');
    return msg.reply(`✎ Tu género ha sido eliminado.`);
  },
};