// Deezer — busca canciones y envía preview de 30s + info
// Usa la API oficial de Deezer

export default {
  name: "deezer",
  aliases: ["dzr"],
  category: "downloads",
  description: "Buscar música en Deezer (preview 30s) 🎧",
  usage: ".deezer <canción>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `🎧 *Deezer*\n\nUso: \`.deezer <nombre de canción>\`\nEj: \`.deezer Bad Bunny Diles\``;
    }

    try {
      // Buscar en Deezer
      const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(ctx.arg)}&limit=1`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const track = data?.data?.[0];
      if (!track) return "❌ No encontré esa canción en Deezer.";

      const info = [
        `🎧 *Deezer*`,
        `• *Título:* ${track.title}`,
        `• *Artista:* ${track.artist?.name || '—'}`,
        `• *Álbum:* ${track.album?.title || '—'}`,
        `• *Duración:* ${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}`,
        `• *Link:* ${track.link}`,
        '',
        '_Preview de 30s (Deezer no da canciones completas gratis)._',
      ].join('\n');

      // Enviar portada si existe
      const hasCover = track.album?.cover_medium || track.album?.cover;
      if (hasCover) {
        const coverUrl = track.album.cover_medium || track.album.cover;
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(ctx.chatId, { image: { url: coverUrl }, caption: info }, { quoted: ctx.full }),
          { messageLength: info.length, isNewContact: false }
        );
      }

      // Enviar preview de audio si existe
      if (track.preview) {
        const audioRes = await fetch(track.preview);
        if (audioRes.ok) {
          const fileName = `${track.artist.name} - ${track.title}.mp3`.replace(/[/\\?*:<>|"]/g, '');
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, {
              audio: { url: track.preview },
              mimetype: 'audio/mpeg',
              fileName,
            }, { quoted: ctx.full }),
            { messageLength: 20, isNewContact: false }
          );
        }
      } else if (!hasCover) {
        return info + '\n\n⚠️ Esta canción no tiene preview disponible.';
      }

      return null;
    } catch (err) {
      return `❌ Error en Deezer: ${err.message}`;
    }
  }
};