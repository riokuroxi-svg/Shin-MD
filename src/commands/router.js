/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  router.js — Router de comandos
//  Pipeline: mensaje → middlewares before → serializar → 
//            detectar prefijo/comando → cooldown → permisos → handler
//  Todo envío pasa por la cola anti-ban del engine.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { loadCommands, reloadCommand, downloadMediaFromObject } from "#commands";
import { serializeMessage, isAdmin, userPart, getCachedMeta } from "#serialize";
import createCooldown from "#cooldown";
import checkPermissions from "#permissions";
import { parseButtonResponse } from "#interactive";
import db from "../services/ginko-db.js";

export const BOT_PREFIXES = process.env.BOT_PREFIX
  ? (process.env.BOT_PREFIX.includes(",") ? process.env.BOT_PREFIX.split(",").map(p => p.trim()) : [process.env.BOT_PREFIX.trim()])
  : [".", "/", "#", "!"];

export const BOT_PREFIX = BOT_PREFIXES[0] || ".";

let selfMode = { value: false, ts: 0 };
function isSelfMode(sock) {
  const now = Date.now();
  if (now - selfMode.ts < 30000) return selfMode.value;
  selfMode.ts = now;
  try {
    const botJid = sock?.user?.id;
    if (!botJid) { selfMode.value = false; return false; }
    const settings = db.getSettings(botJid) || {};
    selfMode.value = !!settings.self;
  } catch {
    selfMode.value = false;
  }
  return selfMode.value;
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
    for (const [name, cmd] of commands) seen.add(cmd.name);
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
  async function runBefores(sock, ctx, rawMsg) {
    if (!commands?.befores?.length) return;
    const full = rawMsg;
    let isAdmins = false, isBotAdmins = false, isOwner = false, groupMetadata = null;
    if (ctx.isGroup) {
      isAdmins = await isAdmin(sock, ctx.chatId, ctx.senderId);
      const botJid = sock?.user?.id;
      if (botJid) isBotAdmins = await isAdmin(sock, ctx.chatId, botJid);
      const ownerJid = engine?.getOwnerJid?.();
      if (ownerJid) isOwner = userPart(ctx.senderId) === userPart(ownerJid);
      groupMetadata = getCachedMeta(ctx.chatId)
        || (await sock?.groupMetadata?.(ctx.chatId).catch(() => null))
        || null;
    }

    if (!sock.reply) {
      sock.reply = (jid, text, quoted, o) => {
        const content = typeof text === "string" ? { text } : (text || {});
        const quote = quoted?.key ? quoted : (quoted?.full || quoted);
        return sock.sendMessage(jid, { ...content, ...(o || {}) }, { quoted: quote });
      };
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
      msg: full.message || {},
      mentionedJid: full.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
      quoted: null,
      download: () => downloadMediaFromObject(full.message),
      reply: async (content) => {
        if (typeof content === "string")
          return sock.sendMessage(ctx.chatId, { text: content }, { quoted: full });
        return sock.sendMessage(ctx.chatId, content, { quoted: full });
      },
    };

    if (full.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const ci = full.message.extendedTextMessage.contextInfo;
      const qMsg = ci.quotedMessage;
      msg.quoted = {
        id: ci.stanzaId,
        sender: ci.participant || "",
        text: qMsg?.conversation || qMsg?.extendedTextMessage?.text || "",
        key: {
          remoteJid: ctx.chatId,
          fromMe: ci.participant ? ci.participant === sock?.user?.id : false,
          id: ci.stanzaId || "",
          participant: ci.participant || "",
        },
        message: qMsg,
        download: () => downloadMediaFromObject(qMsg),
      };
    }

    for (const hook of commands.befores) {
      try {
        await hook.fn({
          msg, sock,
          groupMetadata,
          participants: groupMetadata?.participants || [],
          isAdmins, isBotAdmins, isOwner,
        });
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
        const [btnCmd, ...btnArgs] = btnId.split(":");
        const btnArg = btnArgs.join(" ");
        const virtualMsg = {
          ...msg,
          message: { conversation: BOT_PREFIX + btnCmd + (btnArg ? " " + btnArg : "") },
        };
        return handle(sock, virtualMsg);
      }

      const ctx = serializeMessage(msg, sock);
      if (!ctx.text || ctx.chatId === "status@broadcast") return;

      // Detectar prefijo
      let usedPrefix = "";
      for (const p of BOT_PREFIXES) {
        if (ctx.text.startsWith(p)) {
          usedPrefix = p;
          break;
        }
      }

      ctx.usedPrefix = usedPrefix;

      // Log visual en terminal para todo mensaje recibido (estilo Ginko-MD)
      if (typeof opts.onMessage === "function") {
        try { opts.onMessage(ctx, usedPrefix); } catch {}
      }

      // ── Ejecutar middlewares 'before' (anti-link, anti-status, afk...) ──
      await runBefores(sock, ctx, msg);

      // Si está en self mode (solo dueño), rechazar a cualquiera que no sea el owner
      const ownerJid = engine?.getOwnerJid?.();
      const isOwnerUser = ctx.isOwner ? ctx.isOwner(ownerJid) : false;
      if (isSelfMode(sock) && !isOwnerUser && !ctx.fromMe) return;

      // Si no tiene prefijo, no procesar como comando
      if (!usedPrefix) return;

      // Evitar responder a mensajes propios enviados por el bot que NO son del owner
      if (ctx.fromMe && !isSelfMode(sock) && !isOwnerUser) return;

      const raw = ctx.text.slice(usedPrefix.length).trim();
      if (!raw) return;

      const [nameRaw] = raw.split(/\s+/);
      const name = nameRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cmd = getCommand(name);
      if (!cmd) return;

      // Cooldown / antispam
      if (cooldown.check({ senderId: ctx.senderId, cmd })) return;

      // Permisos
      const denied = await checkPermissions(sock, ctx, cmd, engine);
      if (denied) {
        await sock.sendMessage(ctx.chatId, { text: denied }, { quoted: msg });
        return;
      }

      // Simular estado de escritura en tiempo real ("composing")
      try {
        if (typeof sock.sendPresenceUpdate === "function") {
          sock.sendPresenceUpdate("composing", ctx.chatId).catch(() => {});
        }
      } catch {}

      // Ejecutar
      const start = Date.now();
      const sendQueue = engine?.getSendQueue?.();
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
        try {
          if (typeof sock.sendPresenceUpdate === "function") {
            sock.sendPresenceUpdate("paused", ctx.chatId).catch(() => {});
          }
        } catch {}
      }
    } catch (err) {
      log.error("Router: " + (err.message || err), err);
      try {
        await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Error interno al procesar el comando." }, { _priority: true });
      } catch {}
    }
  }

  return { init, handle, reload, getCommand, commandList, countUnique, PREFIX: BOT_PREFIX, PREFIXES: BOT_PREFIXES };
}

export default createRouter;
