// Adivina el número — juego con botones interactivos

import sharp from 'sharp';
import { quickReply, sendInteractive } from '#interactive';

const games = new Map();

async function renderGuess(clue, attempts, max) {
  const bars = Math.max(1, max - attempts);
  const color = bars > 5 ? '#44dd44' : bars > 2 ? '#ffdd44' : '#ff4444';
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0f3460"/>
    </linearGradient></defs>
    <rect width="500" height="300" fill="url(#g)" rx="15"/>
    <text x="250" y="40" text-anchor="middle" font-family="monospace" font-size="20" font-weight="bold" fill="#e94560">🎯 ADIVINA EL NÚMERO</text>
    <text x="250" y="70" text-anchor="middle" font-family="monospace" font-size="13" fill="#888">Intentos restantes: ${max - attempts}/${max}</text>
    <line x1="20" y1="85" x2="480" y2="85" stroke="#333" stroke-width="1"/>
    <text x="250" y="130" text-anchor="middle" font-family="monospace" font-size="22" fill="#fff">${clue}</text>
    <rect x="150" y="155" width="200" height="20" rx="10" fill="#333"/>
    <rect x="150" y="155" width="${bars * 20}" height="20" rx="10" fill="${color}"/>
    <text x="250" y="220" text-anchor="middle" font-family="monospace" font-size="14" fill="#aaa">Presiona un número del 1 al 100</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export default {
  name: "adivina",
  aliases: ["guess", "adivinar", "numero"],
  category: "games",
  description: "Adivina el número del 1 al 100 🎯",
  usage: ".adivina",
  cooldown: 5,

  async handler(sock, ctx, engine) {
    const userId = ctx.senderId || ctx.sender;
    let state = games.get(userId);

    if (ctx.arg === 'stop' || ctx.arg === 'salir') {
      if (state) games.delete(userId);
      return '🚪 Juego terminado.';
    }

    if (!state) {
      state = { target: Math.floor(Math.random() * 100) + 1, attempts: 0, max: 7 };
      games.set(userId, state);
      return showClue(sock, ctx, state, '🎯 Piensa en un número del 1 al 100');
    }

    const guess = parseInt(ctx.arg);
    if (isNaN(guess) || guess < 1 || guess > 100) {
      return 'Ingresa un número del 1 al 100, o "stop" para salir.';
    }

    state.attempts++;
    let clue;
    if (guess === state.target) {
      games.delete(userId);
      return `🎯 *CORRECTO!* El número era *${state.target}*\n\n🏆 Lo adivinaste en *${state.attempts}* intentos!\n${state.attempts === 1 ? '🤯 ¡INCREÍBLE!' : state.attempts <= 3 ? '🌟 Excelente!' : state.attempts <= 5 ? '👍 Bien hecho!' : '🤔 Lo lograste!'}`;
    } else if (state.attempts >= state.max) {
      games.delete(userId);
      return `😞 *Se acabaron los intentos!*\n\nEl número era *${state.target}*\n\nIntenta de nuevo con .adivina`;
    } else if (guess < state.target) {
      clue = `⬆️ El número es MAYOR que ${guess}`;
    } else {
      clue = `⬇️ El número es MENOR que ${guess}`;
    }

    games.set(userId, state);
    return showClue(sock, ctx, state, clue);
  }
};

async function showClue(sock, ctx, state, clue) {
  const img = await renderGuess(clue, state.attempts, state.max);

  // Botones rápidos: sugerencias
  const buttons = [
    quickReply('⬆️ +10', `adivina:${Math.min(100, (state.target + 10))}`),
    quickReply('⬇️ -10', `adivina:${Math.max(1, (state.target - 10))}`),
    quickReply('🎲 Aleatorio', `adivina:${Math.floor(Math.random() * 100) + 1}`),
    quickReply('❌ Salir', 'adivina:stop'),
  ];

  await sendInteractive(sock, ctx.chatId, {
    image: img,
    body: clue,
    footer: `🎯 Intento ${state.attempts + 1}/${state.max}`,
    buttons,
    quoted: ctx.full,
  });
  return null;
}