// ═══════════════════════════════════════════════════════════════════
//  settings.js — Configuración global de Shin-MD
//  Se ejecuta al inicio, carga variables de entorno y defaults.
// ═══════════════════════════════════════════════════════════════════

import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Dueño del bot (desde .env o fallback)
global.owner = [process.env.OWNER_NUMBER || ""];

// Identidad
global.dev = "反魂 Shin-MD";
global.botname = "Shin-MD";

// Marca para stickers
global.stickerBrand = "反魂 Shin-MD";

// Links oficiales
global.links = {
  channel: "",
  channelCode: "",
  channelName: "Shin-MD · Canal oficial",
  instagram: "",
  github: "https://github.com/riokuroxi-svg/Shin-MD",
  gmail: "",
};
global.channelJid = { id: "", name: global.links.channelName, resolved: false };

// APIs externas
global.APIs = {};

// Mensajes predefinidos
global.mess = {
  owner: "⚠️ Este comando solo puede ser ejecutado por el creador del bot.",
  admin: "🔒 Este comando solo puede ser ejecutado por los Administradores del Grupo.",
  botAdmin: "⚠️ Necesito ser Administrador del Grupo para ejecutar este comando.",
  premium: "⭐ Este comando es exclusivo para usuarios premium.",
  grupo: "👥 Este comando solo funciona en grupos.",
  privado: "📩 Este comando solo funciona en chat privado.",
};

// Auto-recarga del settings si se modifica
const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  import(`${file}?update=${Date.now()}`);
});