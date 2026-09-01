// GitClone — descargar repositorio de GitHub como ZIP
export default {
  name: "gitclone", aliases: ["git"], category: "utility",
  description: "Descargar repositorio de GitHub 📦",
  usage: ".gitclone <usuario/repo>", cooldown: 20,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "📦 *Git Clone*\n\nUso: `.gitclone <usuario/repo>`\nEj: `.gitclone riokuroxi-svg/Shin-MD`";
    const text = ctx.arg.trim();
    let user, repo;
    if (text.includes('/')) { const p = text.split('/'); user = p[0]; repo = p[1]; }
    else return "❌ Formato: usuario/repo";
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${user}/${repo}`,{headers:{'User-Agent':'Shin-MD'}});
      if (!repoRes.ok) return '❌ Repositorio no encontrado.';
      const info = await repoRes.json();
      const zipRes = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`,{headers:{'User-Agent':'Shin-MD'}});
      if (!zipRes.ok) return '❌ Error al descargar.';
      const buf = Buffer.from(await zipRes.arrayBuffer());
      const caption = `📦 *${info.full_name}*\n⭐ ${info.stargazers_count} · 🍴 ${info.forks_count}\n📝 ${info.description||''}\n📏 ${(buf.length/1024/1024).toFixed(1)} MB`;
      if (buf.length > 50*1024*1024) return `${caption}\n\n⚠️ Archivo muy grande para WhatsApp. Descarga directa:\n${info.html_url}/archive/master.zip`;
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{document:buf,mimetype:'application/zip',fileName:`${repo}-main.zip`,caption},{quoted:ctx.full}),{messageLength:caption.length});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};