// ═══════════════════════════════════════════════════════════════════
//  games/engine.js — Motor de juegos interactivos
//  Maneja estados, turnos, y renderizado con Sharp
// ═══════════════════════════════════════════════════════════════════

import sharp from 'sharp';
import { sendInteractive, quickReply } from '#interactive';

const SVG_W = 500;
const SVG_H = 400;

// ─── Estado de juegos por usuario ───
const gameStates = new Map();

/** Obtener o crear estado de juego para un usuario */
export function getGame(userId, gameName) {
  const key = userId + ':' + gameName;
  if (!gameStates.has(key)) return null;
  return gameStates.get(key);
}

/** Setear estado de juego */
export function setGame(userId, gameName, state) {
  const key = userId + ':' + gameName;
  gameStates.set(key, state);
}

/** Eliminar estado de juego */
export function delGame(userId, gameName) {
  const key = userId + ':' + gameName;
  gameStates.delete(key);
}

// ─── Renderizado SVG → PNG con Sharp ───

function esc(s) {
  return String(s || '').replace(/[<>&"']/g, function(c) {
    return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c];
  });
}

/** Dibujar un tablero de mini-juego como PNG */
export async function renderGame(title, elements = [], opts = {}) {
  const bg = opts.bg || '#1a1a2e';
  const textColor = opts.textColor || '#ffffff';
  const accentColor = opts.accent || '#e94560';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bg}" />
        <stop offset="100%" style="stop-color:#16213e" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)" rx="15"/>
    <text x="250" y="40" text-anchor="middle" font-family="monospace" font-size="22" font-weight="bold" fill="${accentColor}">${esc(title)}</text>`;

  let yBase = 80;
  for (const el of elements) {
    if (el.type === 'text') {
      svg += `<text x="${el.x || 250}" y="${el.y || yBase}" text-anchor="${el.anchor || 'middle'}" font-family="monospace" font-size="${el.size || 16}" fill="${el.color || textColor}" font-weight="${el.bold ? 'bold' : 'normal'}">${esc(el.text)}</text>`;
      yBase += (el.size || 16) + 8;
    } else if (el.type === 'rect') {
      svg += `<rect x="${el.x || 20}" y="${el.y || yBase}" width="${el.w || 460}" height="${el.h || 30}" rx="${el.rx || 8}" fill="${el.fill || '#0f3460'}" stroke="${el.stroke || accentColor}" stroke-width="${el.sw || 1}"/>
        <text x="${el.x + (el.w || 460) / 2 || 250}" y="${(el.y || yBase) + (el.h || 30) / 2 + 5}" text-anchor="middle" font-family="monospace" font-size="${el.fontSize || 14}" fill="${el.textColor || textColor}">${esc(el.label || '')}</text>`;
      yBase += (el.h || 30) + 10;
    } else if (el.type === 'line') {
      svg += `<line x1="${el.x1 || 20}" y1="${el.y1 || yBase}" x2="${el.x2 || 480}" y2="${el.y2 || yBase}" stroke="${el.color || '#333'}" stroke-width="${el.sw || 1}"/>`;
      yBase += 10;
    }
  }

  svg += `</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Enviar un juego renderizado con botones */
export async function sendGame(sock, jid, title, elements, buttons, opts = {}) {
  const img = await renderGame(title, elements, opts);
  const btnList = (buttons || []).map(b => quickReply(b.label, b.id));
  return sendInteractive(sock, jid, {
    image: img,
    body: opts.body || '',
    footer: opts.footer || '🎮 Shin-MD Games',
    buttons: btnList,
    quoted: opts.quoted,
  });
}

export default { getGame, setGame, delGame, renderGame, sendGame };