// ═══════════════════════════════════════════════════════════════════
//  loader.js — Cargador de comandos recursivo
//  Escanea cmds/ y subdirectorios. Cada .js exporta { default }.
// ═══════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import log from "#logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CMDS_DIR = path.resolve(__dirname, "../../cmds");

function scanFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith("_")) results.push(...scanFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.startsWith("_")) {
      results.push(full);
    }
  }
  return results;
}

export async function loadCommands() {
  const commands = new Map();
  if (!fs.existsSync(CMDS_DIR)) {
    log.warn("cmds/ no existe, creando directorio vacío");
    fs.mkdirSync(CMDS_DIR, { recursive: true });
    return commands;
  }

  const files = scanFiles(CMDS_DIR);
  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href + "?t=" + Date.now());
      const cmd = mod.default || mod;
      if (!cmd || typeof cmd.handler !== "function") {
        log.warn("Comando ignorado (sin handler): " + path.relative(CMDS_DIR, filePath));
        continue;
      }
      const name = cmd.name || path.basename(filePath, ".js");
      commands.set(name, { ...cmd, name, file: path.relative(CMDS_DIR, filePath) });
      if (Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) commands.set(alias, commands.get(name));
      }
      // Ginko-MD no imprime cada comando cargado, solo muestra errores y un resumen
    } catch (err) {
      log.error("Fallo al cargar comando " + path.relative(CMDS_DIR, filePath) + ": " + (err.message || err));
    }
  }

  log.success(commands.size + " comandos listos (con aliases)");
  return commands;
}

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