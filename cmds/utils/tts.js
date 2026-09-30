/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// TTS (Texto a nota de voz) con voz femenina Dalia (Microsoft Edge, GRATIS, sin key).
// Uso: .tts <texto>
import { synthesize } from '#lib/edgeTTS';
// Onda propia: WhatsApp dibuja la rayita plana cuando el audio no
// trae waveform. Aquí se firma la onda a partir del propio texto, así
// que cada nota de voz sale con un dibujo distinto y reconocible.
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
      return msg.reply(`🎙️ *Texto a nota de voz*\n\nEscribe: *${usedPrefix}tts <texto>*\n\nEjemplo: *${usedPrefix}tts Hola, soy Ginko MD*`);
    }

    const raw = args.join(' ').trim();
    if (!raw) return msg.reply('⚠️ Escribe el texto que quieres convertir en nota de voz.');

    await msg.react('🎙️');

    try {
      const mp3Buf = await synthesize(raw);
      if (!mp3Buf || mp3Buf.length < 500) throw new Error('Audio vacío');

      const tmp = path.join(os.tmpdir(), `ginko_tts_${Date.now()}.mp3`);
      fs.writeFileSync(tmp, mp3Buf);

      const arte = await sendVoiceArt(sock, msg.chat, {
        audio: { url: tmp },
        mimetype: 'audio/mpeg',
        patron: 'firma',
        semilla: raw,
        quoted: msg.full || msg,
      });
      if (!arte.sent) {
        // Si la onda no sale, la nota de voz se manda igual.
        await sock.sendMessage(msg.chat, {
          audio: { url: tmp },
          mimetype: 'audio/mpeg',
          ptt: true
        }, { quoted: msg });
      }

      fs.unlinkSync(tmp);
      await msg.react('✅');
    } catch (e) {
      await msg.reply(`❌ No pude generar el audio: ${e.message || e}`);
      await msg.react('❌');
    }
  }
};
