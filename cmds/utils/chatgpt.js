/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import fetch from 'node-fetch';
import FormData from 'form-data';
import { sendAiResponse } from '../../src/lib/aiFormatter.js';

// Memoria por chat: { chatId: [ {role:'user'|'model', text:string} ] }
const memoria = {};
const MEM_MAX = 10;
const URL_GEMINI = (key, model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

async function subirLitterbox(buffer, mime) {
  const ext = (mime || 'image/jpeg').split('/')[1]?.split(';')[0] || 'jpg';
  const filename = `shin_${Date.now()}.${ext}`;
  for (const t of ['1h', '12h', '24h', '72h']) {
    try {
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('time', t);
      form.append('fileToUpload', buffer, { filename, contentType: mime || 'image/jpeg' });
      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body: form,
      });
      const text = await res.text();
      if (text.startsWith('https://')) return text;
    } catch (_) {}
  }
  return null;
}

async function geminiPedir(key, model, contents, sysPrompt) {
  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  ];

  const arr = [];
  if (sysPrompt) {
    arr.push({ role: 'user', parts: [{ text: sysPrompt }] });
    arr.push({ role: 'model', parts: [{ text: 'Entendido. Seguiré esas instrucciones.' }] });
  }
  arr.push(...contents);

  const res = await fetch(URL_GEMINI(key, model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: arr,
      safetySettings,
      generationConfig: { maxOutputTokens: 900, temperature: 0.75 },
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err?.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  const data = await res.json();
  const blocked = data?.promptFeedback?.blockReason
    || data?.candidates?.[0]?.finishReason === 'SAFETY';
  if (blocked) throw new Error('La IA bloqueó esta respuesta por políticas de seguridad.');
  const resp = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resp) throw new Error('Gemini no devolvió respuesta.');
  return resp.trim();
}

export default {
  command: ['ai', 'ia', 'chatgpt', 'gemini', 'chat'],
  category: 'utils',
  description: 'Chatear con la IA con memoria conversacional y formato Meta AI.',
  run: async ({ msg, sock, args, usedPrefix, command, text }) => {
    const key = global.geminiKey || process.env.GEMINI_KEY;
    const model = global.geminiModel || 'gemini-1.5-flash';
    const chatId = msg.chat;

    const comando = (text || '').trim().toLowerCase();

    // Reset de memoria
    if (['reset', 'limpiar', 'clear', 'borrar'].includes(comando)) {
      delete memoria[chatId];
      return msg.reply('🧠 *Memoria conversacional borrada.* Empezamos de cero.');
    }

    let texto = text?.trim() || '';
    let imageUrl = null;
    const q = msg.quoted || null;
    const mimeCitado = q?.mimetype || '';

    if (q && /^image\//.test(mimeCitado)) {
      try {
        const buf = await q.download();
        if (buf) {
          const up = await subirLitterbox(buf, mimeCitado);
          if (up) imageUrl = up;
        }
      } catch (_) {}
    }

    if (!texto && !imageUrl) {
      return msg.reply(
        `╭──〔 🤖 *SHIN-MD AI* 〕──⬣\n` +
        `│ Escribe una pregunta o petición.\n` +
        `│ \n` +
        `│ 💡 *Uso:* \`${usedPrefix}ai <pregunta>\`\n` +
        `│ 🖼️ *Con imagen:* Responde a una foto con \`${usedPrefix}ai ¿qué ves aquí?\`\n` +
        `│ 🗑️ *Borrar:* \`${usedPrefix}ai reset\`\n` +
        `╰─────────────────────────⬣`
      );
    }

    if (!key || key === 'tu_key_aqui') {
      return msg.reply(
        '《✧》 No hay *key de Gemini* configurada.\n'
        + '> Consíguela gratis en aistudio.google.com/apikey\n'
        + '> y configúrala como `GEMINI_KEY` en tu archivo `.env` o `settings.js`.'
      );
    }

    try { await msg.react('💭'); } catch (_) {}
    const startTime = Date.now();

    try {
      const historial = memoria[chatId] || [];
      const systemPrompt =
        'Eres Shin-MD, un asistente inteligente de WhatsApp creado por riokuroxi-svg. '
        + 'Responde siempre en español, de forma clara, educada, concisa y con formato markdown pulido. '
        + 'Si te envían una imagen, descríbela con precisión.';

      const parts = [];
      const reqText = texto || (imageUrl ? 'Describe esta imagen.' : '');
      parts.push({ text: reqText });
      if (imageUrl) parts.push({ file_data: { mime_type: 'image/jpeg', file_uri: imageUrl } });

      const contenido = [];
      contenido.push(...historial);
      contenido.push({ role: 'user', parts });

      const respuesta = await geminiPedir(key, model, contenido, systemPrompt);
      const latencyMs = Date.now() - startTime;

      if (!memoria[chatId]) memoria[chatId] = [];
      memoria[chatId].push({ role: 'user', parts: [{ text: reqText }] });
      memoria[chatId].push({ role: 'model', parts: [{ text: respuesta }] });
      if (memoria[chatId].length > MEM_MAX * 2) {
        memoria[chatId] = memoria[chatId].slice(-MEM_MAX * 2);
      }

      try { await msg.react('✨'); } catch (_) {}

      await sendAiResponse(sock, chatId, {
        model: "Gemini 1.5 Flash",
        query: reqText,
        answer: respuesta,
        latencyMs,
        senderId: msg.sender,
        senderName: msg.pushName || "Usuario",
        quoted: msg,
      });

      return null;
    } catch (e) {
      try { await msg.react('❌'); } catch (_) {}
      return msg.reply(`❌ *Error en la IA:* ${e.message}`);
    }
  },
};
