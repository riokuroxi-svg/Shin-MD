/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import cp, { exec as _exec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(_exec).bind(cp);

export default {
  command: ['r'],
  category: 'owner',
  description: 'Ejecutar comandos del sistema.',
  isOwner: true,
  run: async ({ msg, sock, text }) => {
    if (!text?.trim()) {
      return sock.reply(msg.chat, '《✧》 Debes escribir un comando a ejecutar.', msg);
    }
    let o;
    try {
      await msg.react('🕒');
      o = await exec(text.trim(), { timeout: 60000, maxBuffer: 1024 * 1024 });
      await msg.react('✔️');
    } catch (e) {
      o = e;
      await msg.react('✖️');
    } finally {
      const stdout = o?.stdout;
      const stderr = o?.stderr || (!o?.stdout && o?.message ? o.message : '');
      if (stdout?.trim()) await sock.reply(msg.chat, stdout.slice(0, 65000), msg);
      if (stderr?.trim()) await sock.reply(msg.chat, stderr.slice(0, 65000), msg);
    }
  }
};
