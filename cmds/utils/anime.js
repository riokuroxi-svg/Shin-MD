// Anime — buscar información de anime con Anilist GraphQL
const QUERY = `query ($search:String){Media(search:$search,type:ANIME){title{romaji english native}description(startingAt{s}startDate{year month day}episodes duration status genres averageScore studios{nodes{name}}siteUrl coverImage{large}}}`;
export default {
  name: "anime", aliases: ["animeinfo"], category: "utility",
  description: "Buscar información de anime 📺",
  usage: ".anime <nombre>", cooldown: 8,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "📺 *Anime*\n\nUso: `.anime <nombre>`\nEj: `.anime Naruto`";
    try {
      const res = await fetch('https://graphql.anilist.co',{
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({query:QUERY,variables:{search:ctx.arg.trim()}})
      });
      if (!res.ok) return '❌ Anime no encontrado.';
      const d = await res.json();
      const m = d.data?.Media; if (!m) return '❌ No encontré ese anime.';
      const title = m.title.romaji||m.title.english||m.title.native;
      const desc = (m.description||'').replace(/<[^>]*>/g,'').slice(0,200);
      let txt = `📺 *${title}*\n📝 ${desc}${desc.length>=200?'...':''}\n`;
      if (m.episodes) txt += `📺 ${m.episodes} episodios`;
      if (m.duration) txt += ` · ${m.duration}min`;
      txt += `\n⭐ ${m.averageScore||'?'}/100\n📅 ${m.startDate?.year||'?'}`;
      if (m.genres?.length) txt += `\n🏷️ ${m.genres.join(', ')}`;
      if (m.status) txt += `\n📌 ${m.status}`;
      if (m.siteUrl) txt += `\n🔗 ${m.siteUrl}`;
      if (m.coverImage?.large) {
        await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{image:{url:m.coverImage.large},caption:txt},{quoted:ctx.full}),{messageLength:txt.length});
        return null;
      }
      return txt;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};