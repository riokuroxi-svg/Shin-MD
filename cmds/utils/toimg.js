/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import fetch from 'node-fetch';
import FormData from 'form-data';
import * as cheerio from 'cheerio';

async function webp2mp4(source) {
  const form = new FormData();
  const isUrl = typeof source === 'string' && /https?:\/\//.test(source);
  form.append('new-image-url', isUrl ? source : '');
  form.append('new-image', source, 'image.webp');
  const res = await fetch('https://ezgif.com/webp-to-mp4', { method: 'POST', body: form, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`ezgif HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const form2 = new FormData();
  const obj = {};
  $('form input[name]').each((i, input) => {
    const name = $(input).attr('name');
    const value = $(input).val();
    if (name) {
      obj[name] = value;
      form2.append(name, value ?? '');
    }
  });
  const res2 = await fetch('https://ezgif.com/webp-to-mp4/' + (obj.file || ''), { method: 'POST', body: form2, signal: AbortSignal.timeout(25000) });
  if (!res2.ok) throw new Error(`ezgif convert HTTP ${res2.status}`);
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  const src = $2('div#output > p.outfile > video > source').attr('src');
  if (!src) throw new Error('No se obtuvo video convertido desde ezgif.');
  const videoUrl = new URL(src, res2.url).toString();
  const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(25000) });
  if (!videoRes.ok) throw new Error(`ezgif download HTTP ${videoRes.status}`);
  return Buffer.from(await videoRes.arrayBuffer());
}

async function webp2png(source) {
  const form = new FormData();
  const isUrl = typeof source === 'string' && /https?:\/\//.test(source);
  form.append('new-image-url', isUrl ? source : '');
  form.append('new-image', source, 'image.webp');
  const res = await fetch('https://ezgif.com/webp-to-png', { method: 'POST', body: form, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`ezgif HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const form2 = new FormData();
  const obj = {};
  $('form input[name]').each((i, input) => {
    const name = $(input).attr('name');
    const value = $(input).val();
    if (name) {
      obj[name] = value;
      form2.append(name, value ?? '');
    }
  });
  const res2 = await fetch('https://ezgif.com/webp-to-png/' + (obj.file || ''), { method: 'POST', body: form2, signal: AbortSignal.timeout(25000) });
  if (!res2.ok) throw new Error(`ezgif convert HTTP ${res2.status}`);
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  const src = $2('div#output > p.outfile > img').attr('src');
  if (!src) throw new Error('No se obtuvo imagen convertida desde ezgif.');
  const imgUrl = new URL(src, res2.url).toString();
  const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(25000) });
  if (!imgRes.ok) throw new Error(`ezgif download HTTP ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

export default {
  command: ['toimg', 'toimage'],
  category: 'utils',
  description: 'Convertir un sticker a imagen o GIF.',
  run: async ({ msg, sock }) => {
    if (!msg.quoted) {
      return sock.reply(msg.chat, `《✧》 Debes citar un sticker para convertir.`, msg);
    }
    await msg.react('🕒');
    try {
      const quoted = msg.quoted;
      const buffer = await quoted.download();
      if (!buffer) {
        await msg.react('✖️');
        return sock.reply(msg.chat, `《✧》 No se pudo descargar el sticker.`, msg);
      }
      const isAnimated = Boolean(quoted.isAnimated || quoted.msg?.isAnimated);
      if (isAnimated) {
        const mp4Buffer = await webp2mp4(buffer);
        await sock.sendMessage(msg.chat, { video: mp4Buffer, caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*', gifPlayback: true }, { quoted: msg });
      } else {
        const pngBuffer = await webp2png(buffer);
        await sock.sendMessage(msg.chat, { image: pngBuffer, caption: 'ꕥ *Aquí tienes ฅ^•ﻌ•^ฅ*' }, { quoted: msg });
      }
      await msg.react('✔️');
    } catch (error) {
      await msg.react('✖️');
      await sock.reply(msg.chat, `《✧》 Error al convertir el sticker.\n${error.message}`, msg);
    }
  }
};
