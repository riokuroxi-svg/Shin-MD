// APK / Aptoide — buscar y descargar aplicaciones Android desde Aptoide
// Usa la API pública de Aptoide (sin key)


export default {
  name: "apk",
  aliases: ["aptoide", "apkdl"],
  category: "downloads",
  description: "Buscar y descargar APKs desde Aptoide 📱",
  usage: ".apk <nombre de app>",
  cooldown: 15,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx, engine) {
    if (!ctx.arg) {
      return `📱 *Aptoide Download*\n\nUso: \`.apk <nombre de app>\`\nEj: \`.apk whatsapp\``;
    }

    try {
      // Buscar en Aptoide
      const searchUrl = `https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(ctx.arg)}&limit=3`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const apps = data?.datalist?.list;
      if (!apps || !apps.length) return '❌ No encontré aplicaciones con ese nombre.';

      const app = apps[0];
      const name = app.name || app.title || ctx.arg;
      const icon = app.icon || app.thumbnail;
      const size = app.size || app.filesize || '?';
      const downloadUrl = app.file?.path || app.downloads?.path || app?.file?.path;
      const pkg = app.package || app.id;
      const updated = app.updated || app.modified || app.lastup;

      if (!downloadUrl) return '❌ No se pudo obtener el enlace de descarga.';

      const info = `📱 *Aptoide*\n📦 *${name}*\n🆔 ${pkg || ''}\n📏 ${formatSize(size)}\n${updated ? `📅 ${updated}\n` : ''}\n⚠️ *No soy responsable del uso que le des a esta app.*`;

      // Verificar tamaño máximo (~100MB para evitar timeouts)
      const sizeBytes = parseSizeBytes(size);
      if (sizeBytes > 100 * 1024 * 1024) {
        return `${info}\n\n📥 *Descarga directa:* ${downloadUrl}\n(El archivo es muy grande para enviarlo por WhatsApp, usa el enlace directo.)`;
      }

      // Enviar APK como documento
      await engine.getSendQueue().enqueue(
        () => sock.sendMessage(ctx.chatId, {
          document: { url: downloadUrl },
          mimetype: 'application/vnd.android.package-archive',
          fileName: `${name.replace(/[/\\?*:<>|"]/g, '_')}.apk`,
          caption: info,
        }, { quoted: ctx.full }),
        { messageLength: info.length, isNewContact: false }
      );

      return null;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  }
};

function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return bytes || '?';
  const b = Number(bytes);
  if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function parseSizeBytes(size) {
  if (!size || typeof size === 'number') return Number(size) || 0;
  const str = String(size).toUpperCase();
  const num = parseFloat(str);
  if (str.includes('GB')) return num * 1024 * 1024 * 1024;
  if (str.includes('MB')) return num * 1024 * 1024;
  if (str.includes('KB')) return num * 1024;
  return num;
}