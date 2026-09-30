/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  cardGenerator.js — Generador vectorial de tarjetas estéticas (Sharp/SVG)
//  Produce tarjetas PNG de alta resolución para .profile, .level y .welcome
// ═══════════════════════════════════════════════════════════════════

import sharp from "sharp";
import axios from "axios";

/**
 * Descarga y recorta una imagen de avatar en círculo PNG con Sharp
 */
async function getCircularAvatar(avatarUrl, size = 140) {
  try {
    let inputBuffer = null;
    if (typeof avatarUrl === "string" && /^https?:\/\//i.test(avatarUrl)) {
      const res = await axios.get(avatarUrl, { responseType: "arraybuffer", timeout: 5000 });
      inputBuffer = Buffer.from(res.data);
    } else if (Buffer.isBuffer(avatarUrl)) {
      inputBuffer = avatarUrl;
    }

    if (!inputBuffer) return null;

    const circleMask = Buffer.from(`
      <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/>
      </svg>
    `);

    return await sharp(inputBuffer)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Escapa caracteres especiales para inserción segura en SVG
 */
function escapeXml(unsafe = "") {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Genera una tarjeta de perfil de usuario ultra moderna
 */
export async function generateProfileCard({
  name = "Usuario",
  rank = "Miembro",
  level = 1,
  exp = 0,
  maxExp = 100,
  coins = 0,
  avatarUrl = null,
}) {
  const width = 800;
  const height = 300;
  const safeName = escapeXml(name.slice(0, 20));
  const safeRank = escapeXml(rank.toUpperCase());
  const progressPercent = Math.min(100, Math.max(0, Math.floor((exp / (maxExp || 1)) * 100)));
  const barWidth = 460;
  const currentBarWidth = Math.floor((barWidth * progressPercent) / 100);

  const circularAvatarBuffer = await getCircularAvatar(avatarUrl, 130);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#141a2e" />
        <stop offset="100%" stop-color="#241238" />
      </linearGradient>
      <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="50%" stop-color="#818cf8" />
        <stop offset="100%" stop-color="#c084fc" />
      </linearGradient>
      <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#ec4899" />
      </linearGradient>
      <filter id="cardGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="10" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Card Background -->
    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="24" fill="url(#bgGrad)" stroke="#4f46e5" stroke-width="2" />

    <!-- Ambient Glowing Orbs -->
    <circle cx="730" cy="40" r="140" fill="#a855f7" opacity="0.12" />
    <circle cx="680" cy="250" r="90" fill="#38bdf8" opacity="0.10" />

    <!-- Avatar Ring -->
    <circle cx="125" cy="150" r="72" fill="none" stroke="url(#ringGrad)" stroke-width="4" />
    <circle cx="125" cy="150" r="66" fill="#1e293b" />
    ${!circularAvatarBuffer ? `<text x="125" y="166" font-family="sans-serif" font-size="44" fill="#94a3b8" text-anchor="middle">👤</text>` : ""}

    <!-- Name & Badges -->
    <text x="235" y="88" font-family="sans-serif" font-weight="900" font-size="32" fill="#ffffff">${safeName}</text>
    
    <rect x="235" y="105" width="130" height="26" rx="6" fill="#4338ca" />
    <text x="300" y="123" font-family="sans-serif" font-weight="bold" font-size="12" fill="#e0e7ff" text-anchor="middle">🛡️ ${safeRank}</text>

    <rect x="375" y="105" width="120" height="26" rx="6" fill="#065f46" />
    <text x="435" y="123" font-family="sans-serif" font-weight="bold" font-size="12" fill="#a7f3d0" text-anchor="middle">🪙 ¥${coins.toLocaleString()}</text>

    <!-- Level Indicator -->
    <text x="730" y="90" font-family="sans-serif" font-weight="bold" font-size="16" fill="#94a3b8" text-anchor="end">NIVEL</text>
    <text x="730" y="132" font-family="sans-serif" font-weight="900" font-size="42" fill="#38bdf8" text-anchor="end">${level}</text>

    <!-- XP Progress Bar Background -->
    <rect x="235" y="165" width="${barWidth}" height="18" rx="9" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <!-- XP Active Bar -->
    <rect x="235" y="165" width="${Math.max(12, currentBarWidth)}" height="18" rx="9" fill="url(#barGrad)" />

    <!-- XP Detail Labels -->
    <text x="235" y="212" font-family="sans-serif" font-size="14" fill="#94a3b8">EXP: <tspan fill="#f8fafc" font-weight="bold">${exp.toLocaleString()}</tspan> / ${maxExp.toLocaleString()}</text>
    <text x="${235 + barWidth}" y="212" font-family="sans-serif" font-size="14" fill="#c084fc" font-weight="bold" text-anchor="end">${progressPercent}%</text>

    <!-- Bottom Watermark -->
    <line x1="235" y1="242" x2="730" y2="242" stroke="#334155" stroke-width="1" opacity="0.6" />
    <text x="730" y="270" font-family="sans-serif" font-weight="bold" font-size="11" fill="#64748b" text-anchor="end">SHIN-MD · AESTHETIC V3</text>
  </svg>
  `;

  const composites = [];
  if (circularAvatarBuffer) {
    composites.push({
      input: circularAvatarBuffer,
      top: 150 - 65,
      left: 125 - 65,
    });
  }

  return await sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * Genera una tarjeta de bienvenida para nuevos integrantes de grupos
 */
export async function generateWelcomeCard({
  groupName = "Grupo WhatsApp",
  memberName = "Nuevo Usuario",
  memberCount = 1,
  avatarUrl = null,
}) {
  const width = 800;
  const height = 300;
  const safeGroup = escapeXml(groupName.slice(0, 24));
  const safeMember = escapeXml(memberName.slice(0, 20));

  const circularAvatarBuffer = await getCircularAvatar(avatarUrl, 130);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgWelcome" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#022c22" />
        <stop offset="50%" stop-color="#064e3b" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#34d399" />
        <stop offset="100%" stop-color="#38bdf8" />
      </linearGradient>
    </defs>

    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="24" fill="url(#bgWelcome)" stroke="#10b981" stroke-width="2" />
    <circle cx="720" cy="50" r="140" fill="#10b981" opacity="0.15" />
    <circle cx="680" cy="240" r="90" fill="#38bdf8" opacity="0.10" />

    <circle cx="125" cy="150" r="72" fill="none" stroke="url(#accentGrad)" stroke-width="4" />
    <circle cx="125" cy="150" r="66" fill="#064e3b" />
    ${!circularAvatarBuffer ? `<text x="125" y="166" font-family="sans-serif" font-size="44" fill="#6ee7b7" text-anchor="middle">✨</text>` : ""}

    <text x="235" y="82" font-family="sans-serif" font-weight="900" font-size="22" fill="#34d399">¡BIENVENIDO(A) AL GRUPO!</text>
    <text x="235" y="125" font-family="sans-serif" font-weight="900" font-size="32" fill="#ffffff">${safeMember}</text>
    
    <text x="235" y="170" font-family="sans-serif" font-size="18" fill="#a7f3d0">Grupo: <tspan font-weight="bold" fill="#ffffff">${safeGroup}</tspan></text>
    <text x="235" y="205" font-family="sans-serif" font-size="15" fill="#6ee7b7">Miembro número: <tspan font-weight="bold" fill="#34d399">#${memberCount}</tspan></text>

    <line x1="235" y1="235" x2="730" y2="235" stroke="#047857" stroke-width="1" />
    <text x="730" y="265" font-family="sans-serif" font-size="12" fill="#34d399" text-anchor="end">SHIN-MD · SISTEMA DE BIENVENIDA</text>
  </svg>
  `;

  const composites = [];
  if (circularAvatarBuffer) {
    composites.push({ input: circularAvatarBuffer, top: 150 - 65, left: 125 - 65 });
  }

  return await sharp(Buffer.from(svg))
    .composite(composites)
    .png()
    .toBuffer();
}

export default {
  generateProfileCard,
  generateWelcomeCard,
};
