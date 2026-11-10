/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

import { mismaPersona } from '#lib/lid';
import { state } from '#lib/theme';

export default {
  command: ['promote', 'promover'],
  category: 'group',
  description: 'Ascender a un usuario a administrador.',
  groupOnly: true,
  isAdmin: true,
  botAdmin: true,
  run: async ({ msg, sock, participants }) => {
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender;
    if (!who) return msg.reply('《✧》 Menciona al usuario que deseas promover a administrador.');
    try {
      const lista = participants || [];
      const whoBase = who.split('@')[0];
      const participant = lista.find(p => mismaPersona(p.id, who) || mismaPersona(p.lid, who) || p.id?.split('@')[0] === whoBase || p.lid?.split('@')[0] === whoBase);
      if (participant?.admin) {
        return sock.sendMessage(msg.chat, { text: `《✧》 *@${whoBase}* ya es administrador del grupo!`, mentions: [who] }, { quoted: msg });
      }
      const targetJid = participant?.id || who;
      await sock.groupParticipantsUpdate(msg.chat, [targetJid], 'promote');
      await sock.sendMessage(msg.chat, { text: `✿ *@${whoBase}* ha sido promovido a administrador del grupo!`, mentions: [who] }, { quoted: msg });
    } catch (e) {
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};
