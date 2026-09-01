// MediaFire — descargar archivos de MediaFire mediante scraper
// Sin binarios, puro cheerio + fetch

import * as cheerio from 'cheerio';

export default {
  name: "mediafire",
  aliases: ["mf"],
  category: "downloads",
  description: "Descargar archivos de MediaFire 📦",
  usage: ".mediafire <url>",
  cooldown: 20,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📦 *MediaFire Download*\n\nUso: \`.mediafire <url>\`\nEj: \`.mediafire https://www.mediafire.com/file/abc123/archivo.zip\``;
    }

    const url = ctx.arg.trim();
    if (!/^https?:\/\/(www\.)?mediafire\.com\//i.test(url)) {
      return '❌ Eso no parece un enlace válido de MediaFire.';
    }

    try {
      const scraped = await mediafireDl(url);
      if (!scraped?.downloadLink) return '❌ No se pudo obtener el archivo.';

      const title = (scraped.filename || 'archivo').trim();
      const tipo = scraped.mimetype || 'application/octet-stream';

      let info = `📦 *MediaFire*\n📄 *${title}*\n`;
      if (scraped.size) info += `📏 ${scraped.size}\n`;
      info += `\n_Enviando archivo..._`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          document: { url: scraped.downloadLink },
          mimetype: tipo,
          fileName: title,
          caption: info,
        }, { quoted: ctx.full }),
        { messageLength: info.length, isNewContact: false }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}. Intenta con otro enlace.`;
    }
  }
};

async function mediafireDl(url) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Upgrade-Insecure-Requests': '1',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const filename = cleanText($('.filename').text()) ||
    cleanText($('meta[property="og:title"]').attr('content')) ||
    cleanText($('title').text()) || null;

  let downloadLink = $('a#downloadButton').attr('href') ||
    $('a.btn.btn-primary').attr('href') ||
    $('a[aria-label="Download"]').attr('href') || null;

  // Fallback: buscar en scripts
  if (!downloadLink) {
    const scripts = $('script').map((i, el) => $(el).html()).get();
    for (const script of scripts) {
      if (!script) continue;
      const match = script.match(/"([^"]+)"[^}]*?download/i);
      if (match) { downloadLink = match[1]; break; }
    }
  }

  const sizeText = cleanText($('.file_info .size').text()) ||
    cleanText($('.details li').filter((i, el) => $(el).text().toLowerCase().includes('size')).text().replace(/size\s*:?\s*/i, '')) || null;

  const uploaded = cleanText($('.file_info .uploaded').text()) ||
    cleanText($('.details li').filter((i, el) => $(el).text().toLowerCase().includes('uploaded')).text().replace(/uploaded\s*:?\s*/i, '')) || null;

  const typeText = cleanText($('.file_type').text()) ||
    cleanText($('meta[property="og:description"]').attr('content')) || null;

  return {
    filename,
    downloadLink,
    size: sizeText,
    uploaded,
    type: typeText,
    mimetype: 'application/octet-stream',
  };
}

function cleanText(str) {
  if (!str || typeof str !== 'string') return null;
  return str.replace(/\s+/g, ' ').trim() || null;
}