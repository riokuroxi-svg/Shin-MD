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
const ROOT_DIR = path.resolve(__dirname, "../..");

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
  "economy", "gacha", "games", "fun", "group", "profile", "socket", "nsfw", "owner", "otros",
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

export function getRandomBanner({ useHourly = true } = {}) {
  if (useHourly) {
    try {
      const porHora = pickBanner();
      if (porHora) return fs.readFileSync(porHora);
    } catch {}
  }

  const shuffleDir = path.join(ROOT_DIR, "assets/image/shuffle");
  try {
    if (fs.existsSync(shuffleDir)) {
      const files = fs.readdirSync(shuffleDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length > 0) return fs.readFileSync(path.join(shuffleDir, pickRandom(files)));
    }
  } catch {}

  const fallbackPaths = [
    process.env.MENU_IMAGE,
    path.join(ROOT_DIR, "assets/image/anita-landscape.jpg"),
    path.join(ROOT_DIR, "assets/image/anita.png"),
    path.join(ROOT_DIR, "assets/banner-default.png"),
    path.join(ROOT_DIR, "assets/bocchi-banner.png"),
  ].filter(Boolean);

  for (const p of fallbackPaths) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}

export function getRandomMenuImage() {
  const pools = [
    path.join(ROOT_DIR, "assets/menus"),
    path.join(ROOT_DIR, "assets/image/shuffle"),
    path.join(ROOT_DIR, "assets"),
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

export function getVideoAsset() {
  const videoPaths = [
    process.env.MENU_VIDEO_PATH,
    path.join(ROOT_DIR, "assets/video/anita-mp4.mp4"),
  ].filter(Boolean);

  for (const p of videoPaths) {
    try {
      if (typeof p === "string" && fs.existsSync(p)) return fs.readFileSync(p);
    } catch {}
  }
  return null;
}
