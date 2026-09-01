// GitHub Stalk — info de usuario de GitHub con API pública
export default {
  name: "githubstalk", aliases: ["ghstalk", "gh"], category: "utility",
  description: "Ver perfil de GitHub 👤",
  usage: ".ghstalk <usuario>", cooldown: 8,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "👤 *GitHub Stalk*\n\nUso: `.ghstalk <usuario>`\nEj: `.ghstalk riokuroxi-svg`";
    const user = ctx.arg.trim().split(/\s+/)[0].replace(/@/g,'');
    try {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`, {
        headers: {'User-Agent':'Shin-MD/1.0','Accept':'application/vnd.github.v3+json'}
      });
      if (!res.ok) return '❌ Usuario no encontrado.';
      const d = await res.json();
      const txt = `👤 *${d.login}*\n\n📌 *Nombre:* ${d.name || '—'}\n📝 *Bio:* ${d.bio || '—'}\n📍 *Ubicación:* ${d.location || '—'}\n🏢 *Compañía:* ${d.company || '—'}\n📦 *Repos:* ${d.public_repos}\n⭐ *Seguidores:* ${d.followers} · Siguiendo: ${d.following}\n🔗 ${d.html_url}\n📅 ${new Date(d.created_at).toLocaleDateString()}`;
      if (d.avatar_url) {
        await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{image:{url:d.avatar_url},caption:txt},{quoted:ctx.full}),{messageLength:txt.length});
        return null;
      }
      return txt;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};