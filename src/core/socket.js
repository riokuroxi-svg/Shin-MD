// ═══════════════════════════════════════════════════════════════════
//  socket.js — Conexión Baileys con anti-ban integrado
//  Usa engine, health monitor y watchdog para auto-healing.
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
  const MAX_RETRIES = 15;
  const RETRY_BASE_MS = 3000;
  const msgStore = new Map();
  const msgLimit = 500;
  const SMAX = 1000;
  const SK = "__sent__:";

  function remove(s) {
    if (!s) return;
    try { s.ev.removeAllListeners(); } catch {}
    try { s.ws.close(); } catch {}
    try { s.end(new Error("replaced")); } catch {}
  }

  function clearSession() {
    try {
      if (!fs.existsSync(sessionDir)) return;
      for (const f of fs.readdirSync(sessionDir)) {
        try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
      }
      log.warn("Session cleared");
    } catch (e) { log.error("clearSession: " + (e.message || e)); }
  }

  function backoffDelay() {
    const exp = Math.min(60000, RETRY_BASE_MS * Math.pow(1.6, Math.min(retries, 8)));
    return Math.max(1000, exp + (Math.random() * 2000 - 1000));
  }

  async function start() {
    engine.transit(engine.LIFECYCLE.CONNECT);
    console.log(chalk.gray("\n     ⏳ Conectando con WhatsApp...\n"));

    const { state, saveCreds: sc } = await useSQLiteAuthState(sessionDir);

    let ver;
    try { const v = await fetchLatestBaileysVersion(); ver = v.version; }
    catch { ver = [2, 3000, 1033105955]; }

    let saveTimer;
    const saveCreds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(sc, 2000); };

    console.info = function() {};
    console.debug = function() {};

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
      shouldIgnoreJid: (j) => j.endsWith("@broadcast"),
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 20000,
      emitOwnEvents: false,
      getMessage: async (key) => {
        if (!key || !key.id) return undefined;
        const a = key.remoteJid ? msgStore.get(key.remoteJid + ":" + key.id) : undefined;
        return a ? (a.message || a) : (msgStore.get(SK + key.id) || {}).message;
      },
    });

    sock = s;
    s.ev.on("creds.update", saveCreds);
    s.sendText = (j, t, q, o) => s.sendMessage(j, { text: t, ...o }, { quoted: q });

    // Fix "Waiting for message" by capturing sent messages
    const origSM = s.sendMessage.bind(s);
    s.sendMessage = async (j, c, o) => {
      const r = await origSM(j, c, o);
      try {
        if (r && r.key && r.key.id) {
          const st = { key: r.key, message: c };
          msgStore.set(j + ":" + r.key.id, st);
          msgStore.set(SK + r.key.id, st);
          while (msgStore.size > SMAX) msgStore.delete(msgStore.keys().next().value);
        }
      } catch {}
      return r;
    };

    s.decodeJid = (j) => {
      if (!j) return j;
      if (/:\d+@/i.test(j)) {
        const d = jidDecode(j) || {};
        if (d.user && d.server) return d.user + "@" + d.server;
      }
      return j;
    };

    // messages.upsert
    s.ev.on("messages.upsert", async ({ messages, type }) => {
      if (engine.getState() < engine.LIFECYCLE.READY || type !== "notify") return;

      for (const msg of messages) {
        try {
          if (!msg || !msg.message || msg.key.remoteJid === "status@broadcast") continue;
          if ((msg.messageTimestamp * 1000) < engine.bootTime - 15000) continue;
          if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;

          if (msg && msg.message && msg.key && msg.key.id) {
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

      // Solo mostrar QR si el usuario eligió QR (no pairing code)
      if (qr != null && !state.creds.registered && pairingMethod !== "code") {
        console.log("");
        console.log(chalk.green("╔═══════════════════════════════════════════════╗"));
        console.log(chalk.green("║") + chalk.white("         📱 ESCANEA EL CÓDIGO QR            ") + chalk.green("║"));
        console.log(chalk.green("╚═══════════════════════════════════════════════╝"));
        console.log("");
        qrcode.generate(qr, { small: true });
        console.log("");
        console.log(chalk.gray("   🔗 Enlaza tu dispositivo WhatsApp con el código QR"));
        console.log(chalk.gray("   ⏳ Esperando confirmación..."));
        console.log("");
      }

      if (connection === "open") {
        engine.transit(engine.LIFECYCLE.READY);
        engine.emit("connected", s.user);
        log.success("Connected: " + (s.user ? s.user.name || s.user.id : "?"));
        if (onReady) onReady(s);
        if (engine.getState() < engine.LIFECYCLE.RUNNING) engine.transit(engine.LIFECYCLE.RUNNING);
        if (watchdog) watchdog.tick();
      }

      if (isNewLogin) log.info("New login detected");

      if (connection === "close") {
        remove(s);
        health.recordDisconnect();

        const code = (lastDisconnect && lastDisconnect.error)
          ? lastDisconnect.error.output.statusCode : 0;

        if ([DisconnectReason.loggedOut, DisconnectReason.forbidden,
             DisconnectReason.multideviceMismatch].includes(code)) {
          log.warn("Unlinked (" + code + ")");
          health.recordError(new Error("logged_out"));
          clearSession();
          process.exit(1);
        }

        if (code === DisconnectReason.connectionReplaced) {
          log.warn("Connection replaced.");
          return;
        }

        retries++;
        if (retries > MAX_RETRIES) {
          log.fatal("Max retries (" + MAX_RETRIES + ") reached");
          clearSession();
          process.exit(1);
        }

        const d = backoffDelay();
        log.warn("Disconnected, retry " + retries + "/" + MAX_RETRIES + " in " + Math.round(d / 1000) + "s");
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
            console.log("");
            console.log(chalk.green("╔═══════════════════════════════════════════════╗"));
            console.log(chalk.green("║") + chalk.white("        📲 CÓDIGO DE VINCULACIÓN           ") + chalk.green("║"));
            console.log(chalk.green("╚═══════════════════════════════════════════════╝"));
            console.log("");
            console.log(chalk.cyan("    ┌─────────────────────────────────────┐"));
            console.log(chalk.cyan("    │") + chalk.bold.yellow("       ") + code + chalk.bold.yellow("        ") + chalk.cyan("│"));
            console.log(chalk.cyan("    └─────────────────────────────────────┘"));
            console.log("");
            console.log(chalk.gray("   📱 Ve a WhatsApp > Dispositivos vinculados"));
            console.log(chalk.gray("   🔗 Toca \"Vincular un dispositivo\""));
            console.log(chalk.gray("   ⏳ Esperando confirmación..."));
            console.log("");
          }
        } catch (e) { log.error("Pairing: " + (e.message || e)); }
      }, 3000);
    }

    return s;
  }

  return { start, getSocket: () => sock };
}