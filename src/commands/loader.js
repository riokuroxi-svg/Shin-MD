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
import { isAdmin, userPart, getCachedMeta } from "#serialize";

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
    handler: async (sock, ctx, engine) => {
      const full = ctx.full || {};
      // ── Permisos REALES (antes: isAdmins/isBotAdmins/isOwner duros
      //    en false → promote/demote/kick nunca funcionaban) ──
      let isAdmins = false, isBotAdmins = false, isOwner = false, groupMetadata = null;
      if (ctx.isGroup) {
        isAdmins = await isAdmin(sock, ctx.chatId, ctx.senderId);
        const botJid = sock?.user?.id;
        if (botJid) isBotAdmins = await isAdmin(sock, ctx.chatId, botJid);
        const ownerJid = engine?.getOwnerJid?.();
        if (ownerJid) isOwner = userPart(ctx.senderId) === userPart(ownerJid);
      }
      if (ctx.isGroup) {
        groupMetadata = getCachedMeta(ctx.chatId)
          || (await sock?.groupMetadata?.(ctx.chatId).catch(() => null))
          || null;
      }
      const msg = {
        chat: ctx.chatId,
        sender: ctx.senderId,
        isGroup: ctx.isGroup,
        text: ctx.text,
        pushName: ctx.pushName || full.pushName || "",
        key: full.key || {},
        id: full.key?.id,
        fromMe: full.key?.fromMe,
        message: full.message || {},
        mentionedJid: full.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
        quoted: null,
        reply: async (content) => {
          if (typeof content === "string")
            return sock.sendMessage(ctx.chatId, { text: content }, { quoted: full });
          return sock.sendMessage(ctx.chatId, content, { quoted: full });
        },
        react: (emoji) => sock.sendMessage(ctx.chatId, { react: { text: emoji, key: full.key } }),
      };
      if (full.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const ci = full.message.extendedTextMessage.contextInfo;
        msg.quoted = {
          id: ci.stanzaId,
          sender: ci.participant || "",
          text: ci.quotedMessage?.conversation || ci.quotedMessage?.extendedTextMessage?.text || "",
        };
      }
      try {
        await gk.run({
          msg, sock,
          usedPrefix: ".",
          text: ctx.arg || "",
          command: mainName,
          args: ctx.args || [],
          groupMetadata,
          participants: (groupMetadata?.participants || []),
          isAdmins, isBotAdmins, isOwner,
        });
      } catch (err) {
        log.error("Ginko cmd '" + mainName + "': " + (err.message || err));
        try { await sock.sendMessage(ctx.chatId, { text: "⚠️ " + (err.message || "Error") }, { quoted: full }); } catch {}
      }
    },
  };
}

export async function loadCommands() {
  const commands = new Map();
  if (!fs.existsSync(CMDS_DIR)) return commands;

  const files = scanFiles(CMDS_DIR);
  let shinCount = 0, ginkoCount = 0;
  let dupeCount = 0;

  for (const filePath of files) {
    try {
      // ?t= fuerza el re-import de ESM. LIMITACIÓN DOCUMENTADA: Node no
      // expone API para borrar módulos del cache, así que cada recarga
      // completa deja la copia anterior huérfina en memoria. loadCommands
      // está pensada para el ARRANQUE (y para /reloadall, que es raro);
      // para cambios de un archivo usa /reload <cmd> (reloadCommand).
      const mod = await import(pathToFileURL(filePath).href + "?t=" + Date.now());
      const cmd = mod.default || mod;
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
      // (Antes: el set cegaba silenciosamente cualquier comando con el
      // mismo nombre/alias — ahora al menos se deja rastro en el log.)
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

  // B2.3: el Map guarda cada comando + todos sus aliases como entradas,
  // así que commands.size NO es el número de comandos (195 únicos vs 667
  // entradas con aliases). El log viejo mostraba el tamaño del Map y
  // parecía que hubiera cientos de comandos duplicados.
  const unique = shinCount + ginkoCount - dupeCount;
  log.success(unique + " comandos únicos (" + shinCount + " Shin, " + ginkoCount + " Ginko) · " + commands.size + " entradas con aliases" + (dupeCount ? " · " + dupeCount + " duplicados" : ""));
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

export default { loadCommands, reloadCommand, CMDS_DIR };