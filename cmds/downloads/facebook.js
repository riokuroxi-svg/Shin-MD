// Facebook — descargar videos de Facebook mediante scraping
// Sin binarios, puro fetch + extracción de URLs de la página


export default {
  name: "facebook",
  aliases: ["fb"],
  category: "downloads",
  description: "Descargar video de Facebook 📹",
  usage: ".facebook <url>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📹 *Facebook Download*\n\nUso: \`.facebook <url>\`\nEj: \`.facebook https://www.facebook.com/watch?v=12345\``;
    }

    const url = ctx.arg.trim();
    if (!/(facebook\.com|fb\.watch)/i.test(url)) {
      return '❌ Eso no parece un enlace válido de Facebook.';
    }

    try {
      const result = await facebookDl(url);
      if (!result?.url) return '❌ No se pudo obtener el video.';

      const caption = `📹 *Facebook Download*${result.title ? `\n📌 *${result.title}*` : ''}${result.resolution ? `\n📐 *${result.resolution}*` : ''}`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          video: { url: result.url },
          caption,
          mimetype: 'video/mp4'
        }, { quoted: ctx.full }),
        { messageLength: 50, isNewContact: false }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}. Intenta con otro enlace.`;
    }
  }
};

async function facebookDl(url) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  let videoUrl = null;
  let title = null;

  // Buscar título
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (titleMatch) {
    title = titleMatch[1].replace(/ at Facebook| on Facebook| \| Facebook/gi, '').trim();
  }

  // Método 1: buscar en JSON incrustado (Facebook mete datos en scripts)
  const sdMatch = html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/);
  const hdMatch = html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/);
  videoUrl = hdMatch?.[1] || sdMatch?.[1];

  // Método 2: playable_url
  if (!videoUrl) {
    const puMatch = html.match(/"playable_url"\s*:\s*"([^"]+)"/);
    if (puMatch) videoUrl = puMatch[1];
  }

  // Método 3: src="https://...mp4"
  if (!videoUrl) {
    const srcMatch = html.match(/src=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
    if (srcMatch) videoUrl = srcMatch[1];
  }

  // Método 4: cualquier URL mp4 en el HTML
  if (!videoUrl) {
    const mp4Matches = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/g);
    if (mp4Matches && mp4Matches.length) {
      videoUrl = mp4Matches[0];
    }
  }

  // Limpiar escapes
  if (videoUrl) {
    videoUrl = videoUrl.replace(/\\\//g, '/').replace(/\\"/g, '').replace(/\\/g, '');
  }

  if (!videoUrl) throw new Error('No se pudo extraer el video de la página.');

  return {
    url: videoUrl,
    title,
    resolution: videoUrl && videoUrl.includes('hd') ? 'HD' : 'SD',
  };
}