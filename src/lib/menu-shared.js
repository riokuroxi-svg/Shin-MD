/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Utilidades compartidas para .menu, .allmenu, .menucat y .setmenu.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickRandom } from "#lib/random";
import { pickBanner } from "#lib/theme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "../..");

/** La carpeta del arte del menú: pósters y el video de la cabecera. */
export const MENU_ASSETS = path.join(ROOT_DIR, "assets/menus");

/** Rutas de los pósters del menú (ordenadas), sin lanzar nunca. */
export function listMenuPosters() {
  try {
    return fs.readdirSync(MENU_ASSETS)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map(f => path.join(MENU_ASSETS, f));
  } catch {
    return [];
  }
}

export const CAT_LABELS = {
  info: "INFORMACIÓN",
  main: "PRINCIPAL",
  utils: "UTILIDADES",
  utility: "HERRAMIENTAS",
  downloads: "DESCARGAS",
  anime: "ANIME",
  stickers: "STICKERS",
  economy: "ECONOMÍA",
  games: "JUEGOS",
  fun: "DIVERSIÓN",
  religi: "RELIGIÓN",
  gacha: "GACHA & RPG",
  group: "GRUPOS & ADMIN",
  profile: "PERFIL",
  socket: "SOCKETS & BOTS",
  nsfw: "NSFW +18",
  owner: "CREADOR / OWNER",
  otros: "OTROS",
};

export const CAT_ICONS = {
  info: "ℹ️",
  main: "⭐",
  utils: "🔧",
  utility: "🛠️",
  downloads: "📥",
  anime: "🎌",
  stickers: "🎨",
  economy: "💰",
  games: "🎮",
  fun: "🎉",
  religi: "☪️",
  gacha: "🎰",
  group: "👥",
  profile: "👤",
  socket: "🔌",
  nsfw: "🔞",
  owner: "👑",
  otros: "📁",
};

export const CAT_ORDER = [
  "info", "main", "downloads", "stickers", "anime", "utils", "utility",
  "economy", "gacha", "games", "fun", "religi", "group", "profile", "socket", "nsfw", "owner", "otros",
];

let _cachedVersion = null;
export function localVersion() {
  if (_cachedVersion) return _cachedVersion;
  try {
    _cachedVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")).version || "3.7.9";
  } catch {
    _cachedVersion = "3.7.9";
  }
  return _cachedVersion;
}

export function collectCategories(commands, { exclude = ["menu"] } = {}) {
  const skip = new Set(exclude);
  const cats = new Map();
  const seenNames = new Set();
  let pluginCount = 0;
  let caseCount = 0;

  for (const [, cmd] of commands || []) {
    if (!cmd || seenNames.has(cmd.name) || skip.has(cmd.name)) continue;
    seenNames.add(cmd.name);
    const c = (cmd.category || "otros").toLowerCase();
    if (!cats.has(c)) cats.set(c, []);
    cats.get(c).push(cmd);
    if (typeof cmd.handler === "function") pluginCount++;
    else caseCount++;
  }

  return { cats, seenNames, pluginCount, caseCount, totalCommands: pluginCount + caseCount };
}

/**
 * Póster del menú: la imagen que va como cabecera de las variantes que no
 * son video. Sale de assets/menus (arte propio del proyecto) y, si no hay
 * nada, de MENU_IMAGE. Devuelve null sin quejarse: el menú siempre puede
 * caer a texto.
 */
export function getRandomBanner({ useHourly = false } = {}) {
  // El menú ya NO usa los banners por hora (media/banners): su estética la
  // forman el video de la cabecera y los pósters de assets/menus. Quien
  // quiera el banner por hora lo pide explícitamente con `useHourly: true`.
  if (useHourly) {
    try {
      const porHora = pickBanner();
      if (porHora) return fs.readFileSync(porHora);
    } catch {}
  }

  const posters = listMenuPosters();
  if (posters.length) {
    try {
      return fs.readFileSync(pickRandom(posters));
    } catch {}
  }

  try {
    if (process.env.MENU_IMAGE && fs.existsSync(process.env.MENU_IMAGE)) {
      return fs.readFileSync(process.env.MENU_IMAGE);
    }
  } catch {}
  return null;
}

export function getRandomMenuImage() {
  const pools = [
    path.join(ROOT_DIR, "assets/menus"),
  ];
  const candidates = [];
  for (const dir of pools) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (/\.(jpe?g|png|webp)$/i.test(f)) candidates.push(path.join(dir, f));
      }
    } catch {}
  }
  if (!candidates.length) return null;
  try {
    return fs.readFileSync(pickRandom(candidates));
  } catch {
    return null;
  }
}

/** Ruta del video del menú (para el enviador con caché), o null. */
export function getVideoPath() {
  const candidatos = [
    process.env.MENU_VIDEO_PATH,
    path.join(ROOT_DIR, "assets/video/menu.mp4"),
  ].filter(Boolean);
  for (const p of candidatos) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

export function getVideoAsset() {
  const videoPaths = [
    process.env.MENU_VIDEO_PATH,
    path.join(ROOT_DIR, "assets/video/menu.mp4"),
  ].filter(Boolean);

  for (const p of videoPaths) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}
