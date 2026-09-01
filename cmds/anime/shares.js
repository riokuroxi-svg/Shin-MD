// Shares — reacciones anime animadas (hug, kiss, slap, pat, etc.)
const REACTIONS = {
  hug: '🤗', kiss: '💋', slap: '👋', pat: '🖐️', cuddle: '🤗', waifu: '🎴', neko: '🐱',
  smile: '😊', bonk: '🔨', bully: '👊', cry: '😢', dance: '💃', handhold: '🤝',
  happy: '😄', highfive: '✋', kill: '🔪', blush: '😳', wink: '😉', wave: '👋',
  poke: '👉', kisscheek: '😘', bored: '😐', sleep: '😴', laugh: '😂', angry: '😠',
  sad: '😢', stare: '👀', think: '🤔', pout: '😤', shy: '😊', run: '🏃', walk: '🚶',
  punch: '👊', nom: '🍔', bite: '😬', tickle: '🤣', kick: '🦵', glomp: '🤗',
};
const ALIASES = {
  enojado: 'angry', enojada: 'angry', aburrido: 'bored', aburrida: 'bored',
  feliz: 'happy', triste: 'sad', llorar: 'cry', reir: 'laugh', besar: 'kiss',
  abrazar: 'hug', caminar: 'walk', correr: 'run', golpear: 'punch',
  matar: 'kill', acariciar: 'pat', saludar: 'wave', guinar: 'wink',
  bailar: 'dance', pensar: 'think', sonreir: 'smile',
};
const allCmds = Object.keys(REACTIONS);
for (const [alias] of Object.entries(ALIASES)) { allCmds.push(alias); }

export default {
  name: "shares", aliases: allCmds, category: "anime", description: "Reacciones anime 💗", cooldown: 4,
  async handler(sock, ctx, engine) {
    const raw = ctx.text.replace(/^[.!]/, '').split(/\s+/)[0].toLowerCase();
    const cmd = ALIASES[raw] || raw;
    if (!REACTIONS[cmd]) return '❌ Reacción no válida.\nUsa: hug, kiss, slap, pat, cuddle, cry, dance, blush, wink, happy, sad, laugh, angry...';
    try {
      const r = await fetch(`https://api.waifu.pics/sfw/${cmd}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (!d?.url) return '❌ No se pudo obtener imagen.';
      const target = ctx.mentions?.[0] ? `@${ctx.mentions[0].split('@')[0]}` : ctx.arg || '';
      const caption = `@${ctx.senderId.split('@')[0]} ${REACTIONS[cmd]} ${cmd} ${target}`;
      await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: { url: d.url }, caption, mentions: [ctx.senderId, ...(ctx.mentions || [])] }, { quoted: ctx.full }), { messageLength: 30 });
      return null;
    } catch (e) { return `❌ ${e.message}`; }
  }
};