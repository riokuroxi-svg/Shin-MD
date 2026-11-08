/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "node:url";
import log from "#logger";
import { buildCommandContext, downloadMediaFromObject } from "./context.js";

// Re-export: el resto del bot (router, tests) lo importa desde "#commands".
// El original sigue viviendo en context.js, donde no crea ciclos.
export { downloadMediaFromObject };

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

function wrapGinkoCmd(gk) {
  const names = Array.isArray(gk.command) ? gk.command : [gk.command];
  const mainName = names[0] || "cmd";
  return {
    name: mainName,
    aliases: names.slice(1),
    category: gk.category || "utils",
    description: gk.description || "",
    cooldown: 3,
    adminOnly: !!(gk.adminOnly || gk.isAdmin),
    botAdmin: !!(gk.botAdmin || gk.isBotAdmin),
    ownerOnly: !!(gk.ownerOnly || gk.isOwner),
    groupOnly: !!(gk.groupOnly || gk.isGroup),
    priority: !!gk.priority,
    handler: async (sock, ctx, engine) => {
      // Mismo contexto exacto que reciben los hooks `before` (context.js).
      // Antes esta función construía su propia copia, más rica que la de
      // los hooks; esa divergencia ya no puede volver a ocurrir.
      const { msg, groupMetadata, participants, isAdmins, isBotAdmins, isOwner } =
        await buildCommandContext(sock, ctx, engine, { commandName: mainName });

      try {
        await gk.run({
          msg,
          sock,
          usedPrefix: ctx.usedPrefix || ".",
          text: ctx.arg || "",
          command: mainName,
          args: ctx.args || [],
          groupMetadata,
          participants,
          isAdmins,
          isBotAdmins,
          isOwner,
        });
      } catch (err) {
        log.error("Ginko cmd '" + mainName + "': " + (err.message || err));
        try {
          await sock.sendMessage(ctx.chatId, { text: "⚠️ " + (err.message || "Error") }, { quoted: ctx.full });
        } catch {}
      }
    },
  };
}

export async function loadCommands() {
  const commands = new Map();
  const befores = [];
  if (!fs.existsSync(CMDS_DIR)) return commands;

  const files = scanFiles(CMDS_DIR);
  let shinCount = 0, ginkoCount = 0;
  let dupeCount = 0;

  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href + "?t=" + Date.now());
      const cmd = mod.default || mod;

      if (typeof mod.before === "function") {
        befores.push({ name: path.basename(filePath, ".js"), fn: mod.before });
      }

      if (!cmd) continue;

      let shinCmd;
      if (typeof cmd.handler === "function") {
        shinCmd = { ...cmd };
        shinCount++;
      } else if (cmd.command && typeof cmd.run === "function") {
        shinCmd = wrapGinkoCmd(cmd);
        ginkoCount++;
      } else {
        continue;
      }

      const name = shinCmd.name || path.basename(filePath, ".js");
      const prev = commands.get(name);
      if (prev) {
        dupeCount++;
        if (dupeCount <= 10) log.warn("Duplicado: '" + name + "' (" + path.relative(CMDS_DIR, filePath) + ") reemplaza a " + (prev.file || "?"));
      }
      commands.set(name, { ...shinCmd, name, file: path.relative(CMDS_DIR, filePath) });
      if (Array.isArray(shinCmd.aliases)) {
        for (const alias of shinCmd.aliases) commands.set(alias, commands.get(name));
      }
    } catch (err) {
      log.error("Carga: " + path.relative(CMDS_DIR, filePath) + ": " + (err.message || err));
    }
  }

  // El Map lleva los hooks pegados como propiedad. Se tipa explícito
  // porque "un Map con una propiedad extra" no existe en el sistema de
  // tipos; lo limpio sería devolver { commands, befores }.
  /** @type {any} */ (commands).befores = befores;
  const unique = shinCount + ginkoCount - dupeCount;
  log.success(unique + " comandos únicos (" + shinCount + " Shin, " + ginkoCount + " Ginko) · " + commands.size + " entradas con aliases" + (dupeCount ? " · " + dupeCount + " duplicados" : "") + (befores.length ? " · " + befores.length + " hooks before" : ""));
  return commands;
}

export async function reloadCommand(name, commands) {
  const current = commands.get(name);
  if (!current) return false;
  try {
    const mod = await import(pathToFileURL(path.join(CMDS_DIR, current.file)).href + "?t=" + Date.now());
    const cmd = mod.default || mod;
    let shinCmd;
    if (typeof cmd.handler === "function") shinCmd = { ...cmd };
    else if (cmd.command && typeof cmd.run === "function") shinCmd = wrapGinkoCmd(cmd);
    else return false;
    commands.set(name, { ...shinCmd, name, file: current.file });
    log.success("Recargado: " + name);
    return true;
  } catch (err) {
    log.error("Recarga " + name + ": " + (err.message || err));
    return false;
  }
}

export default { loadCommands, reloadCommand, downloadMediaFromObject, CMDS_DIR };
