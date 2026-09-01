// Kuro Slash — juego de reacción tipo KURO SLASH con botones y canvas
// El usuario debe presionar el botón correcto lo más rápido posible

import sharp from 'sharp';
import { quickReply, sendInteractive } from '#interactive';

const COLORS = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠'];
const COLOR_NAMES = ['Rojo', 'Azul', 'Verde', 'Amarillo', 'Morado', 'Naranja'];
const COLOR_HEX = ['#ff4444', '#4488ff', '#44dd44', '#ffdd44', '#bb44ff', '#ff8844'];

const games = new Map();

function rand(max) { return Math.floor(Math.random() * max); }

function newRound() {
  const targetIdx = rand(COLORS.length);
  const opts = new Set();
  opts.add(targetIdx);
  while (opts.size < 4) opts.add(rand(COLORS.length));
  const mixed = [...opts].sort(() => Math.random() - 0.5);
  return { targetIdx, options: mixed };
}

async function renderBoard(state) {
  const { round, total, lives, score, current } = state;
  const { targetIdx, options } = current;
  const targetName = COLOR_NAMES[targetIdx].toUpperCase();

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="420">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#16213e"/>
    </linearGradient></defs>
    <rect width="500" height="420" fill="url(#g)" rx="15"/>
    <text x="250" y="35" text-anchor="middle" font-family="monospace" font-size="20" font-weight="bold" fill="#e94560">⚔️ KURO SLASH</text>
    <text x="250" y="60" text-anchor="middle" font-family="monospace" font-size="14" fill="#888">Ronda ${round}/${total}</text>
    <text x="250" y="100" text-anchor="middle" font-family="monospace" font-size="28" font-weight="bold" fill="#fff">✂️ CORTA: ${targetName}</text>
    <text x="250" y="125" text-anchor="middle" font-family="monospace" font-size="18" fill="#aaa">${COLORS[targetIdx]} ${targetName}</text>
    <line x1="20" y1="140" x2="480" y2="140" stroke="#333" stroke-width="1"/>
    <text x="30" y="168" font-family="monospace" font-size="14" fill="#ff6b6b">${'❤️'.repeat(Math.max(0,lives))}${'🖤'.repeat(Math.max(0,3-lives))}</text>
    <text x="470" y="168" text-anchor="end" font-family="monospace" font-size="14" fill="#ffd93d">🏆 ${score}</text>`;

  for (let i = 0; i < options.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const ox = 25 + col * 235;
    const oy = 185 + row * 55;
    const ci = options[i];
    const hex = COLOR_HEX[ci] || '#555';
    svg += `<rect x="${ox}" y="${oy}" width="225" height="45" rx="10" fill="${hex}44" stroke="${hex}" stroke-width="2"/>
      <text x="${ox + 112}" y="${oy + 28}" text-anchor="middle" font-family="monospace" font-size="15" font-weight="bold" fill="#fff">${i+1}. ${COLORS[ci]} ${COLOR_NAMES[ci]}</text>`;
  }

  svg += `</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export default {
  name: "kuro",
  aliases: ["slash", "kuroslash", "reaccion"],
  category: "games",
  description: "Juego de reacción tipo KURO SLASH ⚔️",
  usage: ".kuro",
  cooldown: 5,

  async handler(sock, ctx, engine) {
    const userId = ctx.senderId || ctx.sender;
    let state = games.get(userId);

    if (ctx.arg === 'stop' || ctx.arg === 'salir') {
      games.delete(userId);
      return '🚪 Juego terminado.';
    }

    if (!state) {
      // Iniciar juego nuevo
      state = {
        round: 1,
        score: 0,
        lives: 3,
        total: 10,
        current: newRound(),
        startTime: Date.now(),
      };
      games.set(userId, state);
      return doRound(sock, ctx, state);
    }

    // Procesar respuesta
    const choice = parseInt(ctx.arg);
    if (isNaN(choice) || choice < 1 || choice > 4) {
      return `Usa [1-4] para elegir, o 'stop' para salir.\n❤️ ${state.lives} | 🏆 ${state.score}`;
    }

    const picked = state.current.options[choice - 1];
    const correct = picked === state.current.targetIdx;

    if (correct) {
      const bonus = Math.max(10, 50 - Math.floor((Date.now() - state.startTime) / 500));
      state.score += 50 + bonus;
    } else {
      state.lives--;
    }

    state.round++;
    state.startTime = Date.now();

    if (state.lives <= 0 || state.round > state.total) {
      games.delete(userId);
      const pct = Math.round(state.score / (state.total * 100) * 100);
      let rank = '⚪ Novato';
      if (pct > 80) rank = '🟣 Leyenda';
      else if (pct > 60) rank = '🟡 Guerrero';
      else if (pct > 40) rank = '🟠 Samurai';
      else if (pct > 20) rank = '🔵 Aprendiz';

      return `⚔️ *KURO SLASH* - Finalizado!\n\n🏆 Puntaje: ${state.score} pts\n📊 Precisión: ${pct}%\n🥇 Rango: ${rank}\n${state.lives <= 0 ? '💀 Te quedaste sin vidas!' : '🎉 Completaste!'}`;
    }

    state.current = newRound();
    games.set(userId, state);
    return doRound(sock, ctx, state);
  }
};

async function doRound(sock, ctx, state) {
  const img = await renderBoard(state);
  const buttons = state.current.options.map((_, i) =>
    quickReply(`[${i+1}]`, `kuro:${i+1}`)
  );
  buttons.push(quickReply('❌', 'kuro:stop'));

  await sendInteractive(sock, ctx.chatId, {
    image: img,
    body: `⚔️ Ronda ${state.round}/${state.total}\n❤️ ${state.lives} | 🏆 ${state.score}`,
    footer: '🎮 Kuro Slash · Shin-MD',
    buttons,
    quoted: ctx.full,
  });
  return null;
}