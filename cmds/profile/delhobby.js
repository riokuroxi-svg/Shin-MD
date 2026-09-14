/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';
export default {
  command: ['delpasatiempo', 'removehobby'],
  category: 'profile',
  description: 'Eliminar tu pasatiempo del perfil.',
  run: async ({ msg }) => {
    const user = db.getUser(msg.sender);    
    if (!user.pasatiempo || user.pasatiempo === 'No definido') {
      return msg.reply('《✧》 No tienes ningún pasatiempo establecido.');
    }
    db.setUser(msg.sender, 'pasatiempo', '');
    return msg.reply(`✎ Se ha eliminado tu pasatiempo.`);
  },
};