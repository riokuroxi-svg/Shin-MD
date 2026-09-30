/**
import { state } from '#lib/theme';
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
export default {
  command: ['revoke', 'restablecer'],
  category: 'group',
  description: 'Restablecer el enlace del grupo.',
  botAdmin: true,
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      await sock.groupRevokeInvite(msg.chat);
      const code = await sock.groupInviteCode(msg.chat);
      const link = `https://chat.whatsapp.com/${code}`;
      const teks = `﹒⌗﹒🌿 .ৎ˚₊‧  El enlace del grupo ha sido restablecido:\n\n𐚁 ֹ ִ \`NEW GROUP LINK\` ! ୧ ֹ ִ🔗\n☘️ \`Solicitado por :\` @${msg.sender.split('@')[0]}\n\n🌱 \`Enlace :\` ${link}`;
      await msg.react('🕒');
      await sock.reply(msg.chat, teks, msg, { mentions: [msg.sender] });
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(state('error', { detail: e.message }));
    }
  },
};