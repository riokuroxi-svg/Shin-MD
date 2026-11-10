/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// exif.js — Conversor de imágenes/videos a stickers WebP con metadatos EXIF
// Usa sharp + node-webpmux (puro Node.js, rápido y compatible).

import fs from 'node:fs';
import path from 'node:path';
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

export async function attachExifToWebp(webpBuffer, metadata = {}) {
  const buf = Buffer.isBuffer(webpBuffer) ? webpBuffer : Buffer.from(webpBuffer);
  const packname = metadata.packname ?? global.botname ?? 'Shin-MD';
  const author = metadata.author ?? global.ownerName ?? 'riokuroxi-svg';
  const categories = Array.isArray(metadata.categories) && metadata.categories.length ? metadata.categories : ['✨'];

  const img = new webp.Image();
  await img.load(buf);

  const json = {
    'sticker-pack-id': 'https://github.com/riokuroxi-svg/Shin-MD',
    'sticker-pack-name': String(packname),
    'sticker-pack-publisher': String(author),
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

export async function writeExifImg(media, metadata = {}) {
  const wMedia = await imageToWebp(media);
  return attachExifToWebp(wMedia, metadata);
}

export async function writeExifVid(media, metadata = {}) {
  const wMedia = await videoToWebp(media);
  try {
    return await attachExifToWebp(wMedia, metadata);
  } catch {
    return wMedia;
  }
}

/**
 * Compatibilidad con callers estilo `{ mimetype, data }` que esperan una ruta temporal .webp.
 */
export async function writeExif(media, metadata = {}) {
  const raw = media?.data ? media.data : media;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const mime = String(media?.mimetype || '').toLowerCase();
  const wMedia = mime.includes('webp') ? buf : await imageToWebp(buf);
  let out;
  try {
    out = await attachExifToWebp(wMedia, metadata);
  } catch {
    out = wMedia;
  }
  const tmpDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `sticker-exif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`);
  fs.writeFileSync(tmpFile, out);
  return tmpFile;
}

export default {
  imageToWebp,
  videoToWebp,
  attachExifToWebp,
  writeExifImg,
  writeExifVid,
  writeExif,
};
