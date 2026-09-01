// ═══════════════════════════════════════════════════════════════════
//  loader.js — Cargador de comandos desde ./cmds/
//  Escanea los .js de cmds/, cada uno exporta { default } con metadata.
//  Soporta recarga (reload) sin reiniciar el proceso.
// ═══════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import log from "#logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMDS_DIR = path.resolve(__dirname, "../../cmds");

/**
 * Carga todos los comandos de cmds/ en un Map name -> command.
 * @returns {Map<string, object>} comando por su nombre
 */
export async function loadCommands() {
  const commands = new Map();
  if (!fs.existsSync(CMDS_DIR)) {
    log.warn("cmds/ no existe, creando directorio vacío");
    fs.mkdirSync(CMDS_DIR, { recursive: true });
    return commands;
  }

  const files = fs.readdirSync(CMDS_DIR).filter(f => f.endsWith(".js") && !f.startsWith("_"));
  for (const file of files) {
    try {
      const filePath = path.join(CMDS_DIR, file);
      const mod = await import(pathToFileURL(filePath).href + "?t=" + Date.now());
      const cmd = mod.default || mod;
      if (!cmd || typeof cmd.handler !== "function") {
        log.warn("Comando ignorado (sin handler): " + file);
        continue;
      }
      const name = cmd.name || file.replace(/\.js$/, "");
      commands.set(name, { ...cmd, name, file });
      if (Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) commands.set(alias, commands.get(name));
      }
      log.gray("Comando cargado: " + name);
    } catch (err) {
      log.error("Fallo al cargar comando " + file + ": " + (err.message || err));
    }
  }

  log.success(commands.size + " comandos listos (con aliases)");
  return commands;
}

/**
 * Recarga un comando concreto (hot-reload).
 */
export async function reloadCommand(name, commands) {
  const current = commands.get(name);
  if (!current) return false;
  const filePath = path.join(CMDS_DIR, current.file);
  try {
    const mod = await import(pathToFileURL(filePath).href + "?t=" + Date.now());
    const cmd = mod.default || mod;
    commands.set(name, { ...cmd, name, file: current.file });
    log.success("Comando recargado: " + name);
    return true;
  } catch (err) {
    log.error("Recarga de " + name + " falló: " + (err.message || err));
    return false;
  }
}

export default { loadCommands, reloadCommand, CMDS_DIR };
