/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  router.js — Router de comandos
//  Pipeline: mensaje → serializar → hooks before → prefijo/permisos →
//            cooldown → handler
//  Todo envío pasa por la cola anti-ban del engine.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { loadCommands, reloadCommand } from "#commands";
import { botJid, isAdmin, serializeMessage } from "#serialize";
import { buildCommandContext } from "./context.js";
import createCooldown from "#cooldown";
import checkPermissions from "#permissions";
import { parseButtonResponse } from "#interactive";
import { mismaPersona } from "#lib/lid";
import db from "../services/ginko-db.js";

export const BOT_PREFIXES = process.env.BOT_PREFIX
  ? (process.env.BOT_PREFIX.includes(",") ? process.env.BOT_PREFIX.split(",").map(p => p.trim()) : [process.env.BOT_PREFIX.trim()])
  : [".", "/", "#", "!"];

export const BOT_PREFIX = BOT_PREFIXES[0] || ".";

const selfModeCache = new Map();
function isSelfMode(sock) {
  const botId = botJid(sock);
  if (!botId) return false;
  const now = Date.now();
  const cached = selfModeCache.get(botId);
  if (cached && now - cached.ts < 30000) return cached.value;
  let value = false;
  try {
    const settings = db.getSettings(botId) || {};
    value = !!settings.self;
  } catch {}
  if (selfModeCache.size > 100) selfModeCache.clear();
  selfModeCache.set(botId, { value, ts: now });
  return value;
}

export function createRouter(engine, opts) {
  opts = opts || {};
  const cooldown = createCooldown(opts.cooldown);
  let commands = null;

  async function init() {
    commands = await loadCommands();
    log.success("Router listo — prefijos [" + BOT_PREFIXES.join(" ") + "], " + countUnique() + " comandos únicos");
  }

  function countUnique() {
    if (!commands) return 0;
    const seen = new Set();
    for (const [, cmd] of commands) seen.add(cmd.name);
    return seen.size;
  }

  function getCommand(name) {
    if (!commands) return null;
    return commands.get(name) || null;
  }

  function commandList() {
    if (!commands) return [];
    const seen = new Set();
    const out = [];
    for (const [, cmd] of commands) {
      if (!seen.has(cmd.name)) { seen.add(cmd.name); out.push(cmd); }
    }
    return out;
  }

  async function reload(name) {
    if (!name) {
      commands = await loadCommands();
      return true;
    }
    return reloadCommand(name, commands);
  }

  /**
   * Ejecuta hooks before() registrados (antilink, antistatus, afk...)
   */
  async function runBefores(sock, ctx) {
    if (!commands?.befores?.length) return;
    const { msg, groupMetadata, participants, isAdmins, isBotAdmins, isOwner } =
      await buildCommandContext(sock, ctx, engine, {
        commandName: ctx.commandName,
        isCommands: !!ctx.isCommands,
      });

    for (const hook of commands.befores) {
      try {
        await hook.fn({ msg, sock, groupMetadata, participants, isAdmins, isBotAdmins, isOwner });
      } catch (err) {
        log.error(`Hook before (${hook.name}): ` + (err.message || err));
      }
    }
  }

  /**
   * Punto de entrada para cada mensaje entrante.
   */
  async function handle(sock, msg) {
    try {
      // Respuesta de botón (clic en un botón interactivo)
      const btnId = parseButtonResponse(msg);
      if (btnId) {
        const m = String(btnId).trim().match(/^([^\s:]+)(?:[:\s]+([\s\S]*))?$/);
        if (m) {
          const [, btnCmd, btnArg = ""] = m;
          const virtualMsg = {
            ...msg,
            message: { conversation: BOT_PREFIX + btnCmd + (btnArg ? " " + btnArg : "") },
          };
          return handle(sock, virtualMsg);
        }
      }

      const ctx = serializeMessage(msg, sock);
      if (!ctx.text || ctx.chatId === "status@broadcast") return;

      if (!ctx.fromMe && ctx.chatId) {
        engine?.getRitmo?.()?.anotarEntrante?.(ctx.chatId);
      }

      // Detectar prefijo
      let usedPrefix = "";
      for (const p of BOT_PREFIXES) {
        if (ctx.text.startsWith(p)) {
          usedPrefix = p;
          break;
        }
      }

      ctx.usedPrefix = usedPrefix;

      const typed = usedPrefix
        ? (ctx.text.slice(usedPrefix.length).trim().split(/\s+/)[0] || "")
        : "";
      ctx.commandName = typed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const cmd = usedPrefix && ctx.commandName ? getCommand(ctx.commandName) : null;
      ctx.isCommands = !!cmd;

      if (typeof opts.onMessage === "function") {
        try { opts.onMessage(ctx, usedPrefix); } catch {}
      }

      // Ejecutar middlewares 'before' (anti-link, anti-status, afk...)
      await runBefores(sock, ctx);

      // Si está en self mode (solo dueño), rechazar a cualquiera que no sea el owner
      const ownerJid = engine?.getOwnerJid?.();
      const isOwnerUser = ctx.isOwner ? ctx.isOwner(ownerJid) : false;
      if (isSelfMode(sock) && !isOwnerUser && !ctx.fromMe) return;

      // Registrar actividad pasiva (nombre, XP, stats diarios del grupo)
      const botId = botJid(sock);
      if (!ctx.fromMe && !ctx.isBot && ctx.senderId && !usedPrefix) {
        db.recordActivity({
          chatId: ctx.chatId,
          senderId: ctx.senderId,
          botId,
          pushName: ctx.pushName,
          isGroup: ctx.isGroup,
          isCommand: false,
        });
      }

      // Si no tiene prefijo, no procesar como comando
      if (!usedPrefix) return;

      // Evitar responder a mensajes propios enviados por el bot que NO son del owner
      if (ctx.fromMe && !isSelfMode(sock) && !isOwnerUser) return;

      const raw = ctx.text.slice(usedPrefix.length).trim();
      if (!raw || !cmd) return;

      // Reglas de grupo (primaryBot, bot off / isBanned, adminonly)
      if (ctx.isGroup) {
        let chat = null;
        try { chat = db.getChat(ctx.chatId); } catch {}
        if (chat) {
          if (chat.primaryBot && botId && !mismaPersona(chat.primaryBot, botId) && cmd.name !== "setprimary") {
            return;
          }
          if (chat.isBanned && cmd.name !== "bot" && !isOwnerUser) {
            return;
          }
          if (chat.adminonly && !isOwnerUser && !(await isAdmin(sock, ctx.chatId, ctx.senderId))) {
            return;
          }
        }
      }

      // Cooldown / antispam
      if (cooldown.check({ senderId: ctx.senderId, cmd, text: ctx.text })) return;

      // Permisos
      const denied = await checkPermissions(sock, ctx, cmd, engine);
      if (denied) {
        await sock.sendMessage(ctx.chatId, { text: denied }, { quoted: msg });
        return;
      }

      const sendQueue = engine?.getSendQueue?.();

      // Doble palomita azul: solo en comandos autorizados cuando la cola está activa
      if (
        !ctx.fromMe &&
        msg?.key?.id &&
        process.env.READ_RECEIPTS !== "0" &&
        typeof sock.readMessages === "function" &&
        !sendQueue?.isPaused?.()
      ) {
        try { Promise.resolve(sock.readMessages([msg.key])).catch(() => {}); } catch {}
      }

      // Registrar ejecución del comando en DB (XP, stats, lastCmd, commandsejecut)
      if (!ctx.fromMe && !ctx.isBot && ctx.senderId) {
        db.recordActivity({
          chatId: ctx.chatId,
          senderId: ctx.senderId,
          botId,
          pushName: ctx.pushName,
          isGroup: ctx.isGroup,
          isCommand: true,
        });
      }

      // Ejecutar
      const start = Date.now();
      const usePriority = !!(cmd.priority && sendQueue && typeof sendQueue.enterPriority === "function");
      if (usePriority) sendQueue.enterPriority();
      try {
        const result = await cmd.handler(sock, ctx, engine, commands);
        const ms = Date.now() - start;

        if (typeof opts.onCommand === "function") {
          try { opts.onCommand(ctx, cmd.name, ms); } catch {}
        } else if (ms > 1000) {
          log.gray("Comando " + cmd.name + " tardó " + ms + "ms");
        }

        if (typeof result === "string" && result.length > 0) {
          await sock.sendMessage(ctx.chatId, { text: result }, { quoted: msg });
        }
      } finally {
        if (usePriority) sendQueue.exitPriority();
      }
    } catch (err) {
      log.error("Router: " + (err.message || err), err);
      try {
        await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Error interno al procesar el comando." }, { _priority: true });
      } catch {}
    }
  }

  const router = { init, handle, reload, getCommand, commandList, countUnique, PREFIX: BOT_PREFIX, PREFIXES: BOT_PREFIXES };
  globalThis.__shinRouter = router;
  return router;
}

export default createRouter;
