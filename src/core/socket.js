// ═══════════════════════════════════════════════════════════════════
//  socket.js — Conexión Baileys estilo Ginko-MD
//  Auto-clearing de sesión corrupta + saveCreds forzado
// ═══════════════════════════════════════════════════════════════════

import makeWASocket, {
  Browsers, makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion, jidDecode, DisconnectReason,
} from "baileys";
import { useSQLiteAuthState } from "./auth.js";
import { getCachedMeta, setCachedMeta, deleteCachedMeta } from "./metaCache.js";
import qrcode from "qrcode-terminal";
import pino from "pino";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import NodeCache from "node-cache";
import log from "#logger";

export { getCachedMeta, setCachedMeta, deleteCachedMeta };

export function connectSocket(engine, opts) {
  opts = opts || {};
  const sessionDir = opts.sessionDir || "./Sessions/Owner";
  const pairingNumber = opts.pairingNumber || "";
  const pairingMethod = opts.pairingMethod || "";
  const onMessage = opts.onMessage || null;
  const onReady = opts.onReady || null;
  const watchdog = opts.watchdog || null;
  const health = engine.getHealth();

  let sock = null;
  let retries = 0;
  let isRestarting = false;
  const MAX_RETRIES = 15;
  const msgStore = new Map();
  const msgLimit = 500;
  const SMAX = 1000;
  const SK = "__sent__:";

  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });

  function remove(s) {
    if (!s) return;
    try { s.ev.removeAllListeners(); } catch {}
    try { s.ws?.close(); } catch {}
    try { s.end?.(new Error("replaced")); } catch {}
    try { s.msgRetryCounterCache?.close(); } catch {}
  }

  function clearSession() {
    try {
      if (!fs.existsSync(sessionDir)) return;
      for (const f of fs.readdirSync(sessionDir)) {
        try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
      }
      log.warn("Sesión limpiada");
    } catch (e) { log.error("clearSession: " + (e.message || e)); }
  }

  function backoffDelay() {
    const exp = Math.min(60000, 3000 * Math.pow(1.6, Math.min(retries, 8)));
    return Math.max(1000, exp + (Math.random() * 2000 - 1000));
  }

  async function start() {
    if (isRestarting) return;
    isRestarting = true;

    engine.transit(engine.LIFECYCLE.CONNECT);
    log.gray("Conectando con WhatsApp...");

    const { state, saveCreds: sc } = await useSQLiteAuthState(sessionDir);

    let ver;
    try { const v = await fetchLatestBaileysVersion(); ver = v.version; }
    catch { ver = [2, 3000, 1033105955]; }

    let saveTimer;
    const saveCreds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(sc, 2000); };

    console.info = () => {};
    console.debug = () => {};

    const s = makeWASocket({
      version: ver,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      fireInitQueries: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: (j) => j.endsWith("@broadcast"),
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 20000,
      transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
      emitOwnEvents: false,
      msgRetryCounterCache,
      cachedGroupMetadata: async (jid) => getCachedMeta(jid) ?? undefined,
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        const a = key.remoteJid ? msgStore.get(key.remoteJid + ":" + key.id) : undefined;
        return a ? (a.message || a) : (msgStore.get(SK + key.id) || {}).message;
      },
    });

    sock = s;
    s.msgRetryCounterCache = msgRetryCounterCache;
    s.ev.on("creds.update", saveCreds);
    s.sendText = (j, t, q, o) => s.sendMessage(j, { text: t, ...o }, { quoted: q });

    // Fix "Waiting for message"
    const origSM = s.sendMessage.bind(s);
    s.sendMessage = async (j, c, o) => {
      const r = await origSM(j, c, o);
      try {
        if (r?.key?.id) {
          const st = { key: r.key, message: c };
          msgStore.set(j + ":" + r.key.id, st);
          msgStore.set(SK + r.key.id, st);
          while (msgStore.size > SMAX) msgStore.delete(msgStore.keys().next().value);
        }
      } catch {}
      return r;
    };

    s.decodeJid = (jid) => {
      if (!jid) return jid;
      if (/:\d+@/i.test(jid)) {
        const d = jidDecode(jid) || {};
        if (d.user && d.server) return d.user + "@" + d.server;
      }
      return jid;
    };

    // messages.upsert
    s.ev.on("messages.upsert", async ({ messages, type }) => {
      if (engine.getState() < engine.LIFECYCLE.READY || type !== "notify") return;
      for (const msg of messages) {
        try {
          if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;
          if ((msg.messageTimestamp * 1000) < engine.bootTime - 15000) continue;
          if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;
          if (msg?.key?.id) {
            msgStore.set(msg.key.remoteJid + ":" + msg.key.id, msg.message);
            if (msgStore.size > msgLimit) msgStore.delete(msgStore.keys().next().value);
          }
          if (onMessage) onMessage(s, msg).catch(e => log.error("onMessage: " + (e.message || e)));
        } catch (e) { log.error("msg.upsert: " + (e.message || e)); }
      }
    });

    // connection.update
    s.ev.on("connection.update", async (upd) => {
      const { qr, connection, lastDisconnect, isNewLogin } = upd;

      if (qr != null && !state.creds.registered && pairingMethod !== "code") {
        console.log(chalk.green.bold("[ ✿ ] Escanea este código QR\n"));
        qrcode.generate(qr, { small: true });
        console.log("");
      }

      if (connection === "open") {
        retries = 0;
        isRestarting = false;

        // FORZAR guardado inmediato de credenciales ANTES de que se cierre
        clearTimeout(saveTimer);
        try { await sc(); } catch {}
        saveTimer = null;

        engine.transit(engine.LIFECYCLE.READY);
        engine.emit("connected", s.user);
        log.success("[ ✿ ] Conectado a: " + (s.user?.name || s.user?.id || "?"));
        if (onReady) onReady(s);
        if (engine.getState() < engine.LIFECYCLE.RUNNING) engine.transit(engine.LIFECYCLE.RUNNING);
        if (watchdog) watchdog.tick();
      }

      if (isNewLogin) {
        log.info("Nuevo dispositivo vinculado");
        // Forzar saveCreds inmediato cuando se vincula
        clearTimeout(saveTimer);
        try { await sc(); } catch {}
        saveTimer = null;
      }

      if (connection === "close") {
        remove(s);
        health.recordDisconnect();

        const code = lastDisconnect?.error?.output?.statusCode || 0;

        // DEBUG: mostrar codigo exacto
        const reasonName = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || "unknown";
        log.gray("▸ Desconexion codigo: " + code + " (" + reasonName + ")");

        if ([DisconnectReason.loggedOut, DisconnectReason.forbidden,
             DisconnectReason.multideviceMismatch].includes(code)) {
          log.warn("Desvinculado (" + code + ") — limpiando sesión");
          health.recordError(new Error("logged_out"));
          clearSession();
          process.exit(1);
        }

        if (code === DisconnectReason.connectionReplaced) {
          log.warn("Conexión reemplazada.");
          isRestarting = false;
          return;
        }

        // ── Sesión inválida: limpiar automáticamente como Ginko-MD ──
        if (code === DisconnectReason.badSession) {
          log.warn("Sesión inválida — limpiando y reconectando...");
          clearSession();
          isRestarting = false;
          setTimeout(start, 3000);
          return;
        }

        // ── RestartRequired (515): normal después del pairing, reconectar YA ──
        if (code === DisconnectReason.restartRequired || code === 0) {
          log.gray("Reconectando con credenciales nuevas...");
          isRestarting = false;
          setTimeout(start, 1000);
          return;
        }

        retries++;
        if (retries > MAX_RETRIES) {
          log.fatal("Demasiados reintentos — limpiando sesión");
          clearSession();
          process.exit(1);
        }

        const reasonMessages = {
          [DisconnectReason.connectionLost]: "Se perdió la conexión al servidor, reconectando...",
          [DisconnectReason.connectionClosed]: "Conexión cerrada, reconectando...",
          [DisconnectReason.restartRequired]: "Es necesario reiniciar...",
          [DisconnectReason.timedOut]: "Tiempo agotado, reconectando...",
        };
        const d = backoffDelay();
        log.warn(reasonMessages[code] || `Desconexión (${code}), reconectando en ${Math.round(d / 1000)}s...`);
        isRestarting = false;
        setTimeout(start, d);
      }
    });

    // Pairing code flow
    if (pairingMethod === "code" && pairingNumber && !state.creds.registered) {
      setTimeout(async () => {
        try {
          if (!state.creds.registered) {
            const phone = pairingNumber.replace(/\D/g, "");
            const pair = await s.requestPairingCode(phone);
            const code = pair ? (pair.match(/.{1,4}/g) || [pair]).join("-") : pair;
            console.log(chalk.bold.white(chalk.bgMagenta("Código de emparejamiento:")), chalk.bold.white(code));
          }
        } catch (e) { log.error("Pairing: " + (e.message || e)); }
      }, 3000);
    }

    isRestarting = false;
    return s;
  }

  return { start, getSocket: () => sock };
}