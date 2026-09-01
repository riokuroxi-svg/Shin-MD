// Imagen — busca imágenes usando la API pública de Unsplash (sin key)
// Fallback a mensaje si no funciona


export default {
  name: "imagen",
  aliases: ["img", "image"],
  category: "downloads",
  description: "Buscar imágenes 📷",
  usage: ".imagen <término>",
  cooldown: 10,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📷 *Image Search*\n\nUso: \`.imagen <término>\`\nEj: \`.imagen paisajes\``;
    }

    try {
      // Intentar Unsplash API (pública, sin key necesaria para search limitado)
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(ctx.arg)}&per_page=5&client_id=public`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Shin-MD/1.0' }
      });

      let images = [];
      
      if (res.ok) {
        const data = await res.json();
        if (data.results?.length) {
          images = data.results.map(r => ({
            url: r.urls?.regular || r.urls?.small,
            desc: r.alt_description || r.description || '',
            author: r.user?.name || ''
          }));
        }
      }

      // Si Unsplash no funciona, intentar alternativa
      if (!images.length) {
        const fallbackRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(ctx.arg)}&per_page=5`, {
          headers: { 'Authorization': 'public-test-key', 'User-Agent': 'Shin-MD/1.0' }
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          if (data.photos?.length) {
            images = data.photos.map(p => ({
              url: p.src?.large || p.src?.medium,
              desc: p.alt || '',
              author: p.photographer || ''
            }));
          }
        }
      }

      if (!images.length) {
        return '❌ No encontré imágenes. Intenta con otro término.';
      }

      for (const img of images) {
        const cap = `📷 *${ctx.arg}*${img.author ? `\n📸 Foto por: ${img.author}` : ''}`;
        try {
          await engine.getSendQueue().enqueue(
            () => sock.sendMessage(ctx.chatId, {
              image: { url: img.url },
              caption: cap
            }, { quoted: ctx.full }),
            { messageLength: 30 }
          );
        } catch {}
      }

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  }
};