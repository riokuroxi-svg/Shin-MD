// Diversión — chistes, datos, consejos, 8ball, amor, dados
const chistes = [
  '¿Qué le dice un jaguar a otro jaguar? Jaguar you! 🐆',
  '¿Por qué el libro de matemáticas está triste? Porque tiene demasiados problemas. 📚',
  '¿Qué hace una abeja en el gimnasio? ¡Zum-ba! 🐝',
  '¿Cómo se dice pez en inglés? Fish. ¿Y pez que viaja? Fishcamino. 🐟',
  '¿Qué le dice un techo a otro? Te echo de menos. 🏠',
  '¿Por qué los pájaros no usan Facebook? Porque ya tienen Twitter. 🐦',
  '¿Qué hace una vaca con los ojos cerrados? Leche condensada. 🐄',
  '¿Qué hace un perro con un taladro? ¡Ta-ladrando! 🐶',
  '¿Por qué los fantasmas son malos para mentir? Porque se les ve a través. 👻',
  '¿Cuál es el colmo de un calvo? Tener ideas descabelladas. 🧑‍🦲',
];
const datos = [
  '🐙 Los pulpos tienen 3 corazones y sangre azul.',
  '🍌 Las bananas son ligeramente radiactivas.',
  '🐜 Las hormigas levantan hasta 50x su peso.',
  '🧠 Tu cerebro usa ~20% de la energía del cuerpo.',
  '💧 El agua caliente se congela más rápido que la fría.',
  '🦉 Las lechuzas giran la cabeza hasta 270°.',
  '🐳 La ballena azul pesa como 30 elefantes.',
  '🌱 Los árboles se comunican por hongos subterráneos.',
  '👃 Tu nariz recuerda más de 50,000 olores.',
  '🦒 Las jirafas no tienen cuerdas vocales.',
];
const consejos = [
  '💧 Toma agua antes de tener sed.',
  '😴 Dormir 7-8 horas mejora memoria y ánimo.',
  '📱 Toma descansos de pantalla cada 20 min.',
  '🏃 Caminar 30 min al día hace gran diferencia.',
  '🙏 Agradece algo cada día: mejora el ánimo.',
  '🥦 Come más vegetales y menos procesado.',
  '🧘 Respira profundo cuando estés estresado.',
  '📚 Lee 10 páginas al día: 20+ libros al año.',
];
const piropos = [
  'Si la belleza fuera crimen, cadena perpetua 😍',
  '¿Tienes mapa? Me pierdo en tus ojos 🗺️',
  '¿Eres azúcar? Endulzas mi vida 🍬',
  '¿Crees en amor a primera vista o vuelvo a pasar? 💕',
  '¿Tienes fuego? Me encendiste el corazón 🔥',
];
const respuestas8 = [
  'Es cierto ✅', 'Definitivamente sí 💯', 'Sin duda 🌟',
  'Sí, definitivamente 👍', 'Puedes confiar 🔮', 'Probablemente 🤔',
  'No cuentes con eso ❌', 'Mi respuesta es no 🙅', 'Muy dudoso 🤨',
  'Pregunta más tarde ⏳', 'Mejor no te digo 🤫',
];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export default {
  name: "diversion", aliases: ["chiste","dato","consejo","piropo","8ball","8bola","love","ship","dado","moneda","coin"],
  category: "fun", description: "Chistes, datos, 8ball, amor, dados 🎲", cooldown: 3,
  async handler(sock, ctx) {
    const cmd = ctx.text.replace(/^[.!]/, '').split(/\s+/)[0].toLowerCase();
    switch (cmd) {
      case 'chiste': return `🤣 ${pick(chistes)}`;
      case 'dato': return `🧠 *Dato curioso:*\n${pick(datos)}`;
      case 'consejo': return `💡 *Consejo:*\n${pick(consejos)}`;
      case 'piropo': return pick(piropos);
      case '8ball':
      case '8bola':
        if (!ctx.arg) return '🔮 *8Ball*\n\nHaz una pregunta: .8ball ¿Hoy es mi día?';
        return `🔮 *Pregunta:* ${ctx.arg}\n\n*Respuesta:* ${pick(respuestas8)}`;
      case 'love':
      case 'ship': {
        const target = ctx.mentions?.[0] || ctx.arg?.trim();
        if (!target) return '💕 *Love*\n\nMenciona alguien: .love @user';
        const pct = Math.floor(Math.random() * 101);
        const em = pct >= 80 ? '💞' : pct >= 50 ? '💗' : pct >= 25 ? '💔' : '💀';
        const msg = pct >= 80 ? 'Almas gemelas!' : pct >= 50 ? 'Hay quimica' : pct >= 25 ? 'Tal vez en otra vida...' : 'Ni lo intentes';
        return `💕 *Compatibilidad*\n@${ctx.senderId.split('@')[0]} x @${target.split('@')[0]}\n${em} ${pct}%\n_${msg}_`;
      }
      case 'dado': {
        const caras = parseInt(ctx.arg) || 6;
        return `🎲 Dado ${caras}\nResultado: ${Math.floor(Math.random() * caras) + 1}`;
      }
      case 'moneda':
      case 'coin':
        const res = Math.random() < 0.5 ? 'Cara' : 'Cruz';
        return `🪙 Moneda: ${res}`;
      default:
        return '🎲 Diversion: .chiste .dato .consejo .piropo .8ball .love .dado .moneda';
    }
  }
};