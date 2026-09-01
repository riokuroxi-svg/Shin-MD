// ═══════════════════════════════════════════════════════════════════
//  router.js — Router de comandos
//  Pipeline: mensaje → serializar → detectar prefijo/comando → 
//            cooldown/antispam → permisos → ejecutar handler
//  Todo envío pasa por la cola anti-ban del engine.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { loadCommands, reloadCommand } from "#commands";
import { serializeMessage } from "#serialize";
import createCooldown from "#cooldown";
import checkPermissions from "#permissions";
import { parseButtonResponse, isButtonResponse } from "#interactive";

export const BOT_PREFIX = process.env.BOT_PREFIX || ".";

export function createRouter(engine, opts) {
  opts = opts || {};
  const cooldown = createCooldown(opts.cooldown);
  let commands = null;

  async function init() {
    commands = await loadCommands();
    log.success("Router listo — prefijo '" + BOT_PREFIX + "', " + countUnique() + " comandos únicos");
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
   * Punto de entrada para cada mensaje entrante.
   */
  async function handle(sock, msg) {
    try {
      // Respuesta de botón (clic en un botón interactivo)
      const btnId = parseButtonResponse(msg);
      if (btnId) {
        // El botón debe tener formato: "comando:argumento" o solo "comando"
        // Ej: "kuro:1" → ".kuro 1", "menu" → ".menu"
        const [btnCmd, ...btnArgs] = btnId.split(":");
        const btnArg = btnArgs.join(" ");
        const virtualMsg = {
          ...msg,
          message: { conversation: BOT_PREFIX + btnCmd + (btnArg ? " " + btnArg : "") },
        };
        return handle(sock, virtualMsg);
      }

      const ctx = serializeMessage(msg, sock);
      if (!ctx.text || ctx.isBot || ctx.chatId === "status@broadcast") return;
      if (!ctx.text.startsWith(BOT_PREFIX)) return;

      const raw = ctx.text.slice(BOT_PREFIX.length).trim();
      if (!raw) return;

      const [nameRaw, ...rest] = raw.split(/\s+/);
      const name = nameRaw.toLowerCase();
      const cmd = getCommand(name);
      if (!cmd) return; // no es un comando nuestro

      // Cooldown / antispam
      if (cooldown.check({ senderId: ctx.senderId, cmd })) return;

      // Permisos
      const denied = await checkPermissions(sock, ctx, cmd, engine);
      if (denied) {
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(ctx.chatId, { text: denied }, { quoted: msg }),
          { messageLength: denied.length }
        );
        return;
      }

      // Ejecutar
      const start = Date.now();
      const result = await cmd.handler(sock, ctx, engine, commands);
      const ms = Date.now() - start;

      // Log estilo Ginko-MD si hay callback
      if (typeof opts.onCommand === "function") {
        try { opts.onCommand(ctx, cmd.name, ms); } catch {}
      } else if (ms > 1000) {
        log.gray("Comando " + cmd.name + " tardó " + ms + "ms");
      }

      // Si el handler devolvió texto, enviarlo (conveniencia)
      if (typeof result === "string" && result.length > 0) {
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(ctx.chatId, { text: result }, { quoted: msg }),
          { messageLength: result.length }
        );
      }
    } catch (err) {
      log.error("Router: " + (err.message || err), err);
      try {
        await engine.getSendQueue().enqueue(
          () => sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Error interno al procesar el comando." }),
          { messageLength: 40, isPriority: true }
        );
      } catch {}
    }
  }

  return { init, handle, reload, getCommand, commandList, countUnique, PREFIX: BOT_PREFIX };
}

export default createRouter;
