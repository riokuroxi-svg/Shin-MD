// Google Drive — descargar archivos de Google Drive mediante scraper
// Sin binarios, puro fetch


export default {
  name: "drive",
  aliases: ["gdrive"],
  category: "downloads",
  description: "Descargar archivos de Google Drive 🗂️",
  usage: ".drive <url>",
  cooldown: 20,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `🗂️ *Google Drive Download*\n\nUso: \`.drive <url>\`\nEj: \`.drive https://drive.google.com/file/d/abc123/view\``;
    }

    const url = ctx.arg.trim();
    if (!/drive\.google\.com\/(file\/d\/|open\?id=|uc\?id=)/i.test(url)) {
      return '❌ Eso no parece un enlace válido de Google Drive.';
    }

    try {
      const result = await gdriveDl(url);
      if (!result?.downloadUrl) return '❌ No se pudo obtener el archivo.';

      const caption = `🗂️ *Google Drive*\n📄 *${result.fileName || 'archivo'}*\n📏 ${result.fileSize || '?'}`;

      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          document: { url: result.downloadUrl },
          mimetype: result.mimetype || 'application/octet-stream',
          fileName: result.fileName || 'archivo',
          caption,
        }, { quoted: ctx.full }),
        { messageLength: caption.length, isNewContact: false }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}. Intenta con otro enlace.`;
    }
  }
};

async function gdriveDl(url) {
  let id = null;
  const matchId = url.match(/\/d\/([^/?#]+)/) || url.match(/[?&]id=([^&]+)/) || url.match(/\/uc\?id=([^&]+)/);
  if (matchId) id = matchId[1];
  if (!id) throw new Error('No se pudo extraer el ID del archivo.');

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  const infoUrl = `https://drive.google.com/uc?id=${id}&authuser=0&export=download`;
  const res = await fetch(infoUrl, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Content-Length': '0',
      'Origin': 'https://drive.google.com',
    }
  });

  const text = await res.text();
  let fileName = null;
  let sizeBytes = null;
  let downloadUrl = null;

  try {
    const jsonStr = text.replace(/^\)\]\}'\s*/, '');
    const json = JSON.parse(jsonStr);
    fileName = json.fileName;
    sizeBytes = json.sizeBytes;
    downloadUrl = json.downloadUrl;
  } catch {
    // Intentar extraer del HTML
    const nameMatch = text.match(/<title>(.*?)<\/title>/);
    if (nameMatch) fileName = nameMatch[1].replace(' - Google Drive','').trim();
    downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`;
  }

  if (!downloadUrl) downloadUrl = `https://drive.google.com/uc?export=download&id=${id}`;

  const fileSize = sizeBytes ? formatSize(sizeBytes) : '?';

  let mime = 'application/octet-stream';
  try {
    const headRes = await fetch(downloadUrl, { method: 'HEAD', headers: { 'User-Agent': ua } });
    if (headres.ok) mime = headRes.headers.get('content-type') || mime;
  } catch {}

  return {
    fileName: fileName || 'archivo',
    fileSize,
    mimetype: mime,
    downloadUrl,
  };
}

function formatSize(b) {
  if (!b) return '?';
  if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFfixed(2) + 'GB';
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + 'MB';
  if (b >= 1024) return (b / 1024).toFixed(2) + 'KB';
  return b + 'B';
}