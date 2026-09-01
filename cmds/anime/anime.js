// Anime — buscar información con Anilist
const QUERY = `query ($search:String) { Media(search:$search,type:ANIME) { title { romaji english native } description episodes duration status genres averageScore siteUrl coverImage { large } } }`;
export default {
  name: "anime", aliases: ["animeinfo"], category: "anime", description: "Buscar info de anime 📺", cooldown: 8,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "📺 Uso: .anime <nombre>\nEj: .anime Naruto";
    try {
      const r = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { search: ctx.arg.trim() } })
      });
      if (!r.ok) return '❌ Anime no encontrado.';
      const d = await r.json(); const m = d.data?.Media;
      if (!m) return '❌ No encontré ese anime.';
      const title = m.title.romaji || m.title.english || m.title.native;
      const desc = (m.description || '').replace(/<[^>]*>/g, '').slice(0, 200);
      let txt = `📺 *${title}*\n📝 ${desc}${desc.length >= 200 ? '...' : ''}\n`;
      if (m.episodes) txt += `📺 ${m.episodes} episodios`;
      if (m.duration) txt += ` · ${m.duration}min`;
      txt += `\n⭐ ${m.averageScore || '?'}/100\n📌 ${m.status || ''}`;
      if (m.genres?.length) txt += `\n🏷️ ${m.genres.join(', ')}`;
      txt += `\n🔗 ${m.siteUrl || ''}`;
      if (m.coverImage?.large) {
        await engine.getSendQueue().enqueue(() => sock.sendMessage(ctx.chatId, { image: { url: m.coverImage.large }, caption: txt }, { quoted: ctx.full }), { messageLength: txt.length });
        return null;
      }
      return txt;
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};