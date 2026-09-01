// Trivia — juego de preguntas con botones interactivos

import sharp from 'sharp';
import { quickReply, sendInteractive } from '#interactive';

const QUESTIONS = [
  { q: '¿Cuál es el planeta más grande del sistema solar?', opts: ['Marte', 'Júpiter', 'Saturno', 'Neptuno'], ans: 1 },
  { q: '¿Quién escribió "Cien años de soledad"?', opts: ['Pablo Neruda', 'Gabriel García Márquez', 'Mario Vargas Llosa', 'Julio Cortázar'], ans: 2 },
  { q: '¿En qué año llegó el hombre a la luna?', opts: ['1965', '1969', '1972', '1967'], ans: 1 },
  { q: '¿Cuál es el río más largo del mundo?', opts: ['Amazonas', 'Nilo', 'Misisipi', 'Yangtsé'], ans: 0 },
  { q: '¿Qué país tiene forma de bota?', opts: ['España', 'Francia', 'Italia', 'Grecia'], ans: 2 },
  { q: '¿Cuántos huesos tiene el cuerpo humano adulto?', opts: ['106', '206', '306', '406'], ans: 1 },
  { q: '¿Qué idioma tiene más hablantes nativos?', opts: ['Inglés', 'Español', 'Mandarín', 'Hindi'], ans: 2 },
  { q: '¿En qué país se inventó el sushi?', opts: ['China', 'Corea', 'Japón', 'Tailandia'], ans: 2 },
  { q: '¿Cuál es el océano más grande?', opts: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'], ans: 2 },
  { q: '¿Qué vitamina produce el sol?', opts: ['Vitamina A', 'Vitamina B', 'Vitamina C', 'Vitamina D'], ans: 3 },
  { q: '¿Cuál es el animal más rápido del mundo?', opts: ['Guepardo', 'Halcón peregrino', 'León', 'Pez vela'], ans: 1 },
  { q: '¿Qué año empezó la Segunda Guerra Mundial?', opts: ['1939', '1941', '1937', '1945'], ans: 0 },
  { q: '¿Cuál es la montaña más alta del mundo?', opts: ['K2', 'Everest', 'Kangchenjunga', 'Lhotse'], ans: 1 },
  { q: '¿En qué país está la Torre Eiffel?', opts: ['Italia', 'Reino Unido', 'Francia', 'Alemania'], ans: 2 },
  { q: '¿Cuántos días tiene un año bisiesto?', opts: ['364', '365', '366', '367'], ans: 2 },
];

const games = new Map();

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

async function renderTrivia(question, opts, score, qNum, total) {
  const colors = ['#ff4444', '#4488ff', '#44dd44', '#ff8844'];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${420 + opts.length * 10}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f0c29"/><stop offset="100%" stop-color="#24243e"/>
    </linearGradient></defs>
    <rect width="500" height="${420 + opts.length * 10}" fill="url(#g)" rx="15"/>
    <text x="250" y="35" text-anchor="middle" font-family="monospace" font-size="18" font-weight="bold" fill="#00d2ff">🧠 TRIVIA</text>
    <text x="250" y="60" text-anchor="middle" font-family="monospace" font-size="13" fill="#888">${qNum}/${total} | 🏆 ${score}</text>
    <line x1="20" y1="72" x2="480" y2="72" stroke="#333" stroke-width="1"/>
    <text x="20" y="110" font-family="monospace" font-size="16" fill="#fff">${question}</text>`;

  for (let i = 0; i < opts.length; i++) {
    const oy = 130 + i * 48;
    svg += `<rect x="20" y="${oy}" width="460" height="38" rx="8" fill="${colors[i]}33" stroke="${colors[i]}" stroke-width="1.5"/>
      <text x="40" y="${oy + 25}" font-family="monospace" font-size="14" fill="#fff">${String.fromCharCode(65 + i)}) ${opts[i]}</text>`;
  }

  svg += `</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export default {
  name: "trivia",
  aliases: ["quiz", "preguntas"],
  category: "games",
  description: "Juego de preguntas y respuestas 🧠",
  usage: ".trivia",
  cooldown: 5,

  async handler(sock, ctx, engine) {
    const userId = ctx.senderId || ctx.sender;
    let state = games.get(userId);

    if (ctx.arg === 'stop' || ctx.arg === 'salir') {
      games.delete(userId);
      return '🚪 Trivia terminada.';
    }

    if (!state) {
      const pool = shuffle(QUESTIONS).slice(0, 10);
      state = { questions: pool, current: 0, score: 0 };
      games.set(userId, state);
      return showQuestion(sock, ctx, state);
    }

    if (ctx.arg === '') return showQuestion(sock, ctx, state);

    const choice = parseInt(ctx.arg);
    if (isNaN(choice) || choice < 0 || choice > 3) {
      return `Responde con [0-3] o 'stop' para salir. 🏆 ${state.score}`;
    }

    const q = state.questions[state.current];
    if (choice === q.ans) state.score += 10;

    state.current++;
    if (state.current >= state.questions.length) {
      const total = state.questions.length;
      const pct = Math.round(state.score / (total * 10) * 100);
      let rank = '🧠 Genio';
      if (pct < 40) rank = '📖 Estudiante';
      else if (pct < 70) rank = '🎓 Sabio';

      games.delete(userId);
      return `🧠 *Trivia* - Finalizada!\n\n🏆 Puntaje: ${state.score}/${total * 10}\n📊 Precisión: ${pct}%\n🥇 Rango: ${rank}`;
    }

    games.set(userId, state);
    return showQuestion(sock, ctx, state);
  }
};

async function showQuestion(sock, ctx, state) {
  const q = state.questions[state.current];
  const img = await renderTrivia(q.q, q.opts, state.score, state.current + 1, state.questions.length);

  const buttons = q.opts.map((_, i) =>
    quickReply(String.fromCharCode(65 + i), `trivia:${i}`)
  );
  buttons.push(quickReply('❌ Salir', 'trivia:stop'));

  await sendInteractive(sock, ctx.chatId, {
    image: img,
    body: `🧠 Pregunta ${state.current + 1}/${state.questions.length}`,
    footer: '🎮 Trivia · Shin-MD',
    buttons,
    quoted: ctx.full,
  });
  return null;
}