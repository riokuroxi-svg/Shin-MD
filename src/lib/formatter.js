/**
 * Shin-MD Aesthetic Formatter
 * Utilidades tipográficas Unicode, cajas decorativas e insignias para WhatsApp.
 */

export const CHARS = {
  cornerTopLeft: "╭",
  cornerTopRight: "╮",
  cornerBottomLeft: "╰",
  cornerBottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  verticalDotted: "┆",
  arrow: "➣",
  arrowRight: "╰➤",
  bullet: "◈",
  star: "✦",
  diamond: "◇",
  dot: "•",
  line: "━",
};

export const CATEGORY_EMOJIS = {
  owner: "👑",
  main: "🏠",
  utility: "🔧",
  tools: "🛠️",
  fun: "🎮",
  game: "🎯",
  download: "📥",
  downloader: "📥",
  search: "🔍",
  sticker: "🖼️",
  media: "🎬",
  ai: "🤖",
  group: "👥",
  religi: "☪️",
  islamic: "🕌",
  info: "ℹ️",
  cek: "📋",
  user: "📊",
  canvas: "🎨",
  random: "🎲",
  ephoto: "🖌️",
  anime: "🍥",
  audio: "🎵",
  economy: "💰",
  rpg: "🗡️",
};

/**
 * Convierte texto a Small Caps (minúsculas estilizadas).
 * @param {string} text
 * @returns {string}
 */
export function toSmallCaps(text) {
  if (!text) return "";
  const map = {
    a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ",
    i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ",
    q: "ǫ", r: "ʀ", s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x",
    y: "ʏ", z: "ᴢ",
  };
  return String(text)
    .toLowerCase()
    .split("")
    .map((c) => map[c] || c)
    .join("");
}

/**
 * Convierte texto a Math Sans Bold (negritas estilizadas).
 * @param {string} text
 * @returns {string}
 */
export function toMathSansBold(text) {
  if (!text) return "";
  const map = {
    A: "𝗔", B: "𝗕", C: "𝗖", D: "𝗗", E: "𝗘", F: "𝗙", G: "𝗚", H: "𝗛",
    I: "𝗜", J: "𝗝", K: "𝗞", L: "𝗟", M: "𝗠", N: "𝗡", O: "𝗢", P: "𝗣",
    Q: "𝗤", R: "𝗥", S: "𝗦", T: "𝗧", U: "𝗨", V: "𝗩", W: "𝗪", X: "𝗫",
    Y: "𝗬", Z: "𝗭",
    a: "𝗮", b: "𝗯", c: "𝗰", d: "𝗱", e: "𝗲", f: "𝗳", g: "𝗴", h: "𝗵",
    i: "𝗶", j: "𝗷", k: "𝗸", l: "𝗹", m: "𝗺", n: "𝗻", o: "𝗼", p: "𝗽",
    q: "𝗾", r: "𝗿", s: "𝘀", t: "𝘁", u: "𝘂", v: "𝘃", w: "𝘄", x: "𝘅",
    y: "𝘆", z: "𝘇",
    0: "𝟬", 1: "𝟭", 2: "𝟮", 3: "𝟯", 4: "𝟰", 5: "𝟱", 6: "𝟲", 7: "𝟳",
    8: "𝟴", 9: "𝟵",
  };
  return String(text)
    .split("")
    .map((c) => map[c] || c)
    .join("");
}

/**
 * Separador invisible nativo de WhatsApp (colapsa el texto bajo "Leer más").
 */
export const readMore = String.fromCharCode(8206).repeat(4001);

/**
 * Genera una caja estética para agrupar comandos o información.
 * @param {string} title
 * @param {string[]} lines
 * @param {string} emoji
 * @returns {string}
 */
export function createBracketBox(title, lines = [], emoji = "📁") {
  let text = `╭──〔 ${emoji} *${title}* 〕──⬣\n`;
  for (const line of lines) {
    text += `│  • ${line}\n`;
  }
  text += `╰──────────────⬣\n\n`;
  return text;
}

/**
 * Genera una caja de información con bordes punteados.
 * @param {string} title
 * @param {Array<{label: string, value: string}>} items
 * @returns {string}
 */
export function createInfoBox(title, items = []) {
  let text = `    ᯓ ${toMathSansBold(title)}\n`;
  if (items.length === 0) return text;
  text += `╭   • ${items[0].label} : ${items[0].value}\n`;
  for (let i = 1; i < items.length; i++) {
    text += `┆   • ${items[i].label} : ${items[i].value}\n`;
  }
  text += `╰➤------------------------------\n`;
  return text;
}

/**
 * Obtiene las insignias de permisos de un comando.
 * @param {Object} cmdConfig
 * @returns {string}
 */
export function getCommandBadges(cmdConfig = {}) {
  const badges = [];
  if (cmdConfig.ownerOnly || cmdConfig.isOwner) badges.push("🅞");
  if (cmdConfig.isPremium) badges.push("🅟");
  if (cmdConfig.adminOnly || cmdConfig.isAdmin) badges.push("🅐");
  if (cmdConfig.groupOnly || cmdConfig.isGroup) badges.push("🅖");
  if (cmdConfig.privateOnly || cmdConfig.isPrivate) badges.push("🅟🅡");
  if (cmdConfig.limit && cmdConfig.limit > 0) badges.push("🅛");
  return badges.length > 0 ? " " + badges.join("") : "";
}

/**
 * Formatea un tiempo en milisegundos a una cadena legible (días, horas, minutos, segundos).
 * @param {number} ms
 * @returns {string}
 */
export function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Obtiene el saludo correspondiente según la hora actual en español.
 * @returns {string}
 */
export function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "¡Buenos Días! 🌅";
  if (hour >= 12 && hour < 19) return "¡Buenas Tardes! ☀️";
  return "¡Buenas Noches! 🌙";
}
