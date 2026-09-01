// Letra — busca letras de canciones con lyrics.ovh
let cache = {};
export default {
  name: "letra", aliases: ["lyrics", "lyric"], category: "utility",
  description: "Buscar la letra de una canción 🎵",
  usage: ".letra artista/canción", cooldown: 8,
  async handler(sock, ctx) {
    if (!ctx.arg) return "🎵 *Letras*\n\nUso: `.letra artista/canción`\nEj: `.letra Bad Bunny/Diles`";
    let artista, cancion;
    if (ctx.arg.includes('/')) {
      const p = ctx.arg.split('/').map(s => s.trim());
      artista = p[0]; cancion = p.slice(1).join('/');
    } else {
      const parts = ctx.arg.trim().split(/\s+/);
      if (parts.length < 2) return "❌ Usa formato: artista/canción";
      artista = parts[0]; cancion = parts.slice(1).join(' ');
    }
    try {
      const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artista)}/${encodeURIComponent(cancion)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.lyrics) return `❌ No encontré la letra de *${cancion}* de *${artista}*.`;
      const cabecera = `🎵 *${cancion}* — ${artista}\n\n`;
      const maxLen = 3500 - cabecera.length;
      return cabecera + data.lyrics.trim().slice(0, maxLen) + (data.lyrics.length > maxLen ? '\n\n_...letra truncada, muy larga_': '');
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};