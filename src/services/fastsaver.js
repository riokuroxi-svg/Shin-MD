// FastSaver API — descarga unificada de redes sociales
// Configurable via .env: FASTSAVER_KEY (free tier: api.fastsaver.io)
// Plataformas: instagram, twitter/x, pinterest, tiktok, facebook
// Sin API key: usa fallbacks públicos. Con key: usa FastSaver.

const FS_BASE = "https://api.fastsaver.io/v1";

export async function downloadSocial(platform, url) {
  const key = process.env.FASTSAVER_KEY || "";

  if (key) {
    try {
      return await fastSaverFetch(platform, url, key);
    } catch (e) {
      // fallback
    }
  }

  switch (platform) {
    case "instagram": return fallbackInstagram(url);
    case "twitter":   return fallbackTwitter(url);
    case "pinterest": return fallbackPinterest(url);
    case "tiktok":    return fallbackTikTok(url);
    case "facebook":  return fallbackFacebook(url);
    default: throw new Error("Plataforma no soportada: " + platform);
  }
}

async function fastSaverFetch(platform, url, key) {
  const map = { instagram: "instagram", twitter: "twitter", pinterest: "pinterest", tiktok: "tiktok", facebook: "facebook" };
  const p = map[platform];
  if (!p) throw new Error("Platform not supported");

  const res = await fetch(`${FS_BASE}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify({ url, platform: p }),
  });
  if (!res.ok) throw new Error(`FastSaver HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok || !data.download_url) throw new Error(data.message || "FastSaver: sin URL");
  return { url: data.download_url, type: data.type || "video", title: data.title || null, author: data.author || null };
}

async function fallbackInstagram(url) {
  throw new Error("Instagram requiere FASTSAVER_KEY en .env (gratis en api.fastsaver.io)");
}

async function fallbackTwitter(url) {
  const match = url.match(/status\/(\d+)/);
  if (!match) throw new Error("URL de Twitter no válida");
  const res = await fetch(`https://api.fxtwitter.com/status/${match[1]}`, {
    headers: { "User-Agent": "Shin-MD/1.0" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (!data.tweet?.media?.videos?.length) throw new Error("No se encontró video");
  const video = data.tweet.media.videos[0];
  return { url: video.url, type: "video", title: data.tweet.text?.slice(0, 100) || null, author: data.tweet.author?.screen_name || null };
}

async function fallbackPinterest(url) {
  throw new Error("Pinterest requiere FASTSAVER_KEY en .env (gratis en api.fastsaver.io)");
}

async function fallbackTikTok(url) {
  const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36", "Accept": "application/json" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.msg || "Error TikWM");
  return { url: data.data.play_hd || data.data.play, type: "video", title: data.data.title || null, author: data.data.author?.nickname || null };
}

async function fallbackFacebook(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  const sd = html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/);
  const hd = html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/);
  const videoUrl = hd?.[1] || sd?.[1];
  if (!videoUrl) throw new Error("No se pudo extraer el video");
  return { url: videoUrl.replace(/\\\//g, '/'), type: "video" };
}

export default { downloadSocial };