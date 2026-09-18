/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// exif.js — Conversor de imágenes/videos a stickers WebP con metadatos EXIF
// Usa sharp + node-webpmux (puro Node.js, ultra-rápido, sin depender de binarios ffmpeg).

import sharp from 'sharp';
import webp from 'node-webpmux';

export async function imageToWebp(media) {
  if (!Buffer.isBuffer(media)) media = Buffer.from(media);
  return sharp(media)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function videoToWebp(media) {
  // Para videos/gifs: convertir frame a webp si no hay ffmpeg
  if (!Buffer.isBuffer(media)) media = Buffer.from(media);
  try {
    return await sharp(media, { animated: true })
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 65 })
      .toBuffer();
  } catch {
    return imageToWebp(media);
  }
}

export async function writeExifImg(media, metadata = {}) {
  const wMedia = await imageToWebp(media);
  const packname = metadata.packname || global.botname || 'Shin-MD';
  const author = metadata.author || global.ownerName || 'riokuroxi-svg';
  const categories = metadata.categories || ['✨'];

  const img = new webp.Image();
  await img.load(wMedia);

  const json = {
    'sticker-pack-id': 'https://github.com/riokuroxi-svg/Shin-MD',
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    emojis: categories,
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([exifAttr, jsonBuff]);
  exif.writeUIntLE(jsonBuff.length, 14, 4);

  img.exif = exif;
  return img.save(null);
}

export async function writeExifVid(media, metadata = {}) {
  const wMedia = await videoToWebp(media);
  const packname = metadata.packname || global.botname || 'Shin-MD';
  const author = metadata.author || global.ownerName || 'riokuroxi-svg';
  const categories = metadata.categories || ['✨'];

  try {
    const img = new webp.Image();
    await img.load(wMedia);

    const json = {
      'sticker-pack-id': 'https://github.com/riokuroxi-svg/Shin-MD',
      'sticker-pack-name': packname,
      'sticker-pack-publisher': author,
      emojis: categories,
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    img.exif = exif;
    return img.save(null);
  } catch {
    return wMedia;
  }
}

export default {
  imageToWebp,
  videoToWebp,
  writeExifImg,
  writeExifVid,
};
