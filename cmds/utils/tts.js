/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { synthesize } from '#lib/edgeTTS';
import { sendVoiceArt } from '#lib/voice-art';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default {
  command: ['tts', 'voz', 'decirvoz', 'speak'],
  category: 'utils',
  description: 'Convierte texto a nota de voz con voz femenina en español.',
  run: async ({ msg, sock, args, usedPrefix }) => {
    if (!args[0]) {
      return msg.reply(`🎙️ *Texto a nota de voz*\n\nEscribe: *${usedPrefix}tts <texto>*\n\nEjemplo: *${usedPrefix}tts Hola, soy Shin MD*`);
    }

    const raw = args.join(' ').trim();
    if (!raw) return msg.reply('⚠️ Escribe el texto que quieres convertir en nota de voz.');

    await msg.react('🎙️');

    let tmp = null;
    try {
      const mp3Buf = await synthesize(raw);
      if (!mp3Buf || mp3Buf.length < 500) throw new Error('Audio vacío');

      tmp = path.join(os.tmpdir(), `shin_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
      fs.writeFileSync(tmp, mp3Buf);

      const arte = await sendVoiceArt(sock, msg.chat, {
        audio: { url: tmp },
        mimetype: 'audio/mpeg',
        patron: 'firma',
        semilla: raw,
        quoted: msg.full || msg,
      });
      if (!arte.sent) {
        await sock.sendMessage(msg.chat, {
          audio: { url: tmp },
          mimetype: 'audio/mpeg',
          ptt: true
        }, { quoted: msg });
      }

      await msg.react('✅');
    } catch (e) {
      await msg.reply(`❌ No pude generar el audio: ${e.message || e}`);
      await msg.react('❌');
    } finally {
      if (tmp) fs.rmSync(tmp, { force: true });
    }
  }
};
