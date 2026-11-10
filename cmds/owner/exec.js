/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import syntaxerror from 'syntax-error';
import { format } from 'util';
import { createRequire } from 'module';

export default {
  command: ['ex', 'e'],
  category: 'owner',
  description: 'Ejecutar código JavaScript en el bot.',
  isOwner: true,
  run: async ({ msg, sock, args, command, text }) => {
    const require = createRequire(import.meta.url);
    if (!text.trim()) {
      return sock.reply(msg.chat, '《✧》 Debes escribir un comando a ejecutar.', msg);
    }
    const _text = (command === 'e' ? 'return ' : '') + text;
    let _return, _syntax = '';
    try {
      await msg.react('🕒');
      let i = 15;
      const f = { exports: {} };
      const exec = new (async () => {}).constructor('print', 'msg', 'sock', 'require', 'Array', 'process', 'args', 'module', 'exports', 'argument', _text);
      _return = await exec.call(sock, (...printArgs) => {
        if (--i < 1) return;
        return sock.reply(msg.chat, format(...printArgs), msg);
      }, msg, sock, require, Array, process, args, f, f.exports, [sock]);
      await msg.react('✔️');
    } catch (e) {
      const err = syntaxerror(_text, 'Execution Function', { allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, sourceType: 'module' });
      if (err) _syntax = '```' + err + '```\n\n';
      _return = e;
      await msg.react('✖️');
    } finally {
      await sock.reply(msg.chat, _syntax + format(_return), msg);
    }
  }
};
