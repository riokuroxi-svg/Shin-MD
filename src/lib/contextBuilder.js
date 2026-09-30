/**
 * Shin-MD Context & Fake Quoted Builder
 * Genera metadatos avanzados para Baileys: canales oficiales, vCards y widget meteorológico.
 */

import axios from "axios";

let _weatherCache = null;
let _weatherCacheTime = 0;
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10 minutos de caché

const WEATHER_CODE_MAP = {
  0: "☀️ Despejado",
  1: "🌤️ Mayormente despejado",
  2: "⛅ Parcialmente nublado",
  3: "☁️ Nublado",
  45: "🌫️ Niebla",
  48: "🌫️ Niebla densa",
  51: "🌦️ Llovizna",
  61: "🌧️ Lluvia ligera",
  63: "🌧️ Lluvia moderada",
  65: "⛈️ Lluvia fuerte",
  80: "🌦️ Chubascos",
  95: "⛈️ Tormenta eléctrica",
};

/**
 * Consulta el clima actual para una ciudad con caché ultrarrápida.
 * @param {string} city
 * @returns {Promise<string>}
 */
export async function getWeatherSummary(city = "Mexico City") {
  const now = Date.now();
  if (_weatherCache && (now - _weatherCacheTime < WEATHER_CACHE_TTL)) {
    return _weatherCache;
  }

  try {
    const geo = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      { timeout: 3000 }
    );
    const loc = geo.data?.results?.[0];
    if (!loc) return "☀️ Soleado | 22°C";

    const res = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code`,
      { timeout: 3000 }
    );
    const current = res.data?.current;
    if (!current) return "☀️ Soleado | 22°C";

    const cond = WEATHER_CODE_MAP[current.weather_code] || "🌤️ Despejado";
    const temp = Math.round(current.temperature_2m);
    _weatherCache = `${cond} | 🌡️ ${temp}°C`;
    _weatherCacheTime = now;
    return _weatherCache;
  } catch {
    return "☀️ Soleado | 22°C";
  }
}

/**
 * Genera el contextInfo con reenvío de canal oficial verificado.
 * @param {Object} options
 * @returns {Object}
 */
export function getChannelContext(options = {}) {
  const {
    mentionedJid = [],
    channelJid = "120363412350560864@newsletter",
    channelName = "Shin-MD Official Channel",
    serverMessageId = 127,
  } = options;

  return {
    mentionedJid,
    isForwarded: true,
    forwardingScore: 999,
    forwardedNewsletterMessageInfo: {
      newsletterJid: channelJid,
      newsletterName: channelName,
      serverMessageId,
    },
  };
}

/**
 * Genera una tarjeta de contacto citada falsa (Fake Quoted) para dar verificación oficial.
 * @param {Object} options
 * @returns {Object}
 */
export function getVerifiedQuoted(options = {}) {
  const {
    botName = "Shin-MD Official",
    sender = "0@s.whatsapp.net",
    senderNum = "13135550002",
    weather = null,
  } = options;

  const displayName = weather ? `🪸 ${botName} • ${weather}` : `🪸 ${botName}`;

  return {
    key: {
      fromMe: false,
      participant: sender,
      remoteJid: "status@broadcast",
    },
    message: {
      contactMessage: {
        displayName,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;type=CELL;type=VOICE;waid=${senderNum}:+${senderNum}\nEND:VCARD`,
      },
    },
  };
}
