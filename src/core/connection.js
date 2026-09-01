import makeWASocket, {
  Browsers, makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion, jidDecode, DisconnectReason,
} from "baileys";
import { useSQLiteAuthState } from "#lib/sqliteAuth";
import NodeCache from "node-cache";
import qrcode from "qrcode-terminal";
import pino from "pino";
import fs from "fs";
import path from "path";
import log from "#lib/logger";

function backoff(a, b, m, j) {
  a = a || 0; b = b || 3000; m = m || 60000; j = j || 2000;
  const e = b * Math.pow(1.6, Math.min(a, 8));
  return Math.max(1000, Math.min(m, e) + (Math.random() * j * 2 - j));
}

function normPhone(input) {
  let s = String(input).replace(/\D/g, "");
  if (!s) return "";
  s = s.replace(/^0+/, "");
  if (s.length === 10 && s.startsWith("3")) s = "57" + s;
  if (s.startsWith("52") && !s.startsWith("521") && s.length >= 12) s = "521" + s.slice(2);
  if (s.startsWith("54") && !s.startsWith("549") && s.length >= 11) s = "549" + s.slice(2);
  return s;
}

const groupMetaCache = new Map();
const META_TTL = 300000;
setInterval(() => {
  const n = Date.now();
  for (const [k, v] of groupMetaCache) if (n - v.ts > META_TTL) groupMetaCache.delete(k);
}, 600000);

export function getCachedMeta(j) { const c = groupMetaCache.get(j); return c && Date.now() - c.ts <= META_TTL ? c.metadata : null; }
export function setCachedMeta(j, m) { groupMetaCache.set(j, { metadata: m, ts: Date.now() }); }
export function deleteCachedMeta(j) { groupMetaCache.delete(j); }

export function createConnectionManager(opts) {
  opts = opts || {};
  const sessionDir = opts.sessionDir || "./Sessions/Owner";
  const pairingNumber = opts.pairingNumber || "";
  const pairingMethod = opts.pairingMethod || "";
  const onReady = opts.onReady || null;
  const onMessage = opts.onMessage || null;

  let sock = null, bootTime = Date.now(), recon = 0, botReady = false, restarting = false, saveTimer = null;
  const RETRIES = 15;
  const msgStore = new Map();
  const MLIM = 500, SMAX = 1000, SK = "__sent__:";
  const vCache = { value: null, expiresAt: 0 };
  const retryCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });

  function clean(s) {
    if (!s) return;
    try { s.ev.removeAllListeners(); } catch {}
    try { s.ws.close(); } catch {}
    try { s.end(new Error("replaced")); } catch {}
    try { s.msgRetryCounterCache.close(); } catch {}
  }

  function clearSes() {
    try {
      if (!fs.existsSync(sessionDir)) return;
      for (const f of fs.readdirSync(sessionDir)) try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
      log.warn("Sesion eliminada");
    } catch (e) { log.error("clearSes: " + (e.message || e)); }
  }

  async function getVer() {
    if (vCache.value && Date.now() < vCache.expiresAt) return vCache.value;
    try {
      const v = await fetchLatestBaileysVersion();
      vCache.value = v.version;
      vCache.expiresAt = Date.now() + 3600000;
    } catch { if (!vCache.value) vCache.value = [2, 3000, 1033105955]; }
    return vCache.value;
  }

  async function warmup(s) {
    try {
      let ids = [];
      try {
        const { getChat } = await import("#system/database");
        ids = getChat().map(c => c.id).filter(i => typeof i === "string" && i.endsWith("@g.us")).slice(0, 50);
      } catch {}
      if (!ids.length) return;
      log.gray("Warmup " + ids.length + " grupos...");
      const t = Date.now();
      for (let i = 0; i < ids.length; i += 10) {
        await Promise.allSettled(ids.slice(i, i + 10).map(id =>
          s.groupMetadata(id).then(m => { if (m) setCachedMeta(id, m); }).catch(() => {})
        ));
      }
      log.gray("Warmup en " + (Date.now() - t) + "ms");
    } catch (e) { log.gray("warmup: " + (e.message || e)); }
  }

  async function start() {
    if (restarting) return;
    restarting = true;
    bootTime = Date.now();
    log.gray("Iniciando conexion...");

    const { state, saveCreds: sc } = await useSQLiteAuthState(sessionDir);
    const ver = await getVer();
    const saveCreds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(sc, 2000); };

    console.info = function() {};
    console.debug = function() {};

    const s = makeWASocket({
      version: ver,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Chrome"),
      printQRInTerminal: false,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      fireInitQueries: false,
      shouldIgnoreJid: (j) => j.endsWith("@broadcast"),
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 20000,
      emitOwnEvents: false,
      msgRetryCounterCache: retryCache,
      getMessage: async (key) => {
        if (!key || !key.id) return undefined;
        const a = key.remoteJid ? msgStore.get(key.remoteJid + ":" + key.id) : undefined;
        return a ? (a.message || a) : (msgStore.get(SK + key.id) || {}).message;
      },
    });

    sock = s;
    s.msgRetryCounterCache = retryCache;
    s.ev.on("creds.update", saveCreds);
    s.sendText = (j, t, q, o) => s.sendMessage(j, { text: t, ...o }, { quoted: q });

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
      if (!botReady || type !== "notify") return;
      for (const msg of messages) {
        if (msg && msg.message && msg.key && msg.key.id) {
          msgStore.set(msg.key.remoteJid + ":" + msg.key.id, msg.message);
          if (msgStore.size > MLIM) msgStore.delete(msgStore.keys().next().value);
        }
        try {
          if (!msg || !msg.message || msg.key.remoteJid === "status@broadcast") continue;
          if ((msg.messageTimestamp * 1000) < bootTime - 15000) continue;
          if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;
          if (onMessage) onMessage(s, msg).catch(e => log.error("onMessage: " + (e.message || e)));
        } catch (e) { log.error("msg.upsert: " + (e.message || e)); }
      }
    });

    // connection.update
    s.ev.on("connection.update", async (upd) => {
      const { qr, connection, lastDisconnect, isNewLogin } = upd;
      if (qr && !state.creds.registered) {
        log.info("Escanea el QR para vincular");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        bootTime = Date.now();
        recon = 0;
        restarting = false;
        log.success("Conectado: " + (s.user ? s.user.name || s.user.id : "?"));
        if (!botReady) {
          botReady = true;
          warmup(s);
          if (onReady) onReady(s);
        }
      }
      if (isNewLogin) log.info("Nuevo login");
      if (connection === "close") {
        clean(s);
        const code = lastDisconnect && lastDisconnect.error ? lastDisconnect.error.output.statusCode : 0;
        if ([DisconnectReason.loggedOut, DisconnectReason.forbidden, DisconnectReason.multideviceMismatch].includes(code)) {
          log.warn("Desvinculado (" + code + ")");
          botReady = false; restarting = false;
          clearSes();
          process.exit(1);
        }
        if (code === DisconnectReason.connectionReplaced) {
          log.warn("Reemplazado"); restarting = false;
          return;
        }
        recon++;
        if (recon > RETRIES) {
          log.error("Demasiados reintentos (" + RETRIES + ")");
          botReady = false; restarting = false;
          clearSes();
          process.exit(1);
        }
        const d = backoff(recon);
        log.warn("Desconexion, reconectando en " + Math.round(d / 1000) + "s");
        restarting = false;
        setTimeout(start, d);
      }
    });

    // Pairing code
    if (pairingMethod === "code" && pairingNumber && !state.creds.registered) {
      setTimeout(async () => {
        try {
          if (!state.creds.registered) {
            const phone = normPhone(pairingNumber);
            const pair = await s.requestPairingCode(phone);
            const code = pair ? (pair.match(/.{1,4}/g) || [pair]).join("-") : pair;
            log.info("Codigo: " + code);
          }
        } catch (e) { log.error("Pairing: " + (e.message || e)); }
      }, 3000);
    }

    return s;
  }

  return {
    start,
    getSocket: () => sock,
    isReady: () => botReady,
    restart: () => {
      if (sock) clean(sock);
      botReady = false; restarting = false;
      return start();
    },
  };
}
