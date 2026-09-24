/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
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
  let restartStreak = 0;
  let lastRestartAt = 0;
  let patientWarned = false;
  const MAX_RETRIES = 15;
  const msgStore = new Map();
  // Tope ÚNICO del msgStore: envíos y recibidos comparten el mismo Map.
  // (Antes: 500 en el lado recibido y 1000 en el enviado — el tamaño
  // real dependía de qué lado truncara antes.)
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
    // Fallback verificado en vivo (2026-09): 1044802095 conecta y da QR.
    catch { ver = [2, 3000, 1044802095]; }

    let saveTimer;
    const saveCreds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(sc, 2000); };

    console.info = () => {};
    console.debug = () => {};

    const s = makeWASocket({
      version: ver,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
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

    // ═══ Punto único de envío (anti-ban) ═══════════════════════════
    // TODO lo que sale por esta conexión (comandos Ginko, msg.reply,
    // router, envíos internos) pasa por la cola serial del engine con
    // shinJitter + warm-up: se envía la función RAW de Baileys
    // (origSM) a la cola, NO este wrapper, para evitar recursión
    // (la cola processa una tarea a la vez; encolar desde dentro
    // deadlockearía). El router ya no encola explícitamente:
    // sock.sendMessage lo hace solo.
    // (También conserva el fix "Waiting for message" del msgStore.)
    const origSM = s.sendMessage.bind(s);
    const sendQueue = engine.getSendQueue();
    s.sendMessage = async (j, c, o) => {
      const qo = {
        messageLength: c?.text?.length || 0,
        // B1.4: prioridad por flag explícito (_priority) o por ventana de
        // prioridad activa (comandos priority: .menu/.ping/.owner).
        isPriority: !!(o && o._priority) || sendQueue.inPriority(),
      };
      if (o) { delete o._priority; } // no fugarse a Baileys
      const r = await sendQueue.enqueue(() => origSM(j, c, o), qo);
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

    // relayMessage (tarjetas interactivas: menú con botones, templates)
    // TAMBIÉN por la cola; sin esto los interactivos se saltarían el
    // anti-ban. Seguro: el sendMessage interno de Baileys usa su propia
    // closure relayMessage, no esta propiedad, así no hay recursión.
    const origRelay = s.relayMessage.bind(s);
    s.relayMessage = async (j, m, o) => {
      const text = m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || "";
      return sendQueue.enqueue(() => origRelay(j, m, o), {
        messageLength: String(text).length,
        isPriority: sendQueue.inPriority(), // B1.4: tarjetas interactivas de comandos priority
      });
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
      // Señal de vida para el watchdog (la conexión fluye de verdad)
      if (watchdog) watchdog.tick();
      if (engine.getState() < engine.LIFECYCLE.READY || type !== "notify") return;
      for (const msg of messages) {
        try {
          if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;
          if ((msg.messageTimestamp * 1000) < engine.bootTime - 15000) continue;
          if (msg.message.ephemeralMessage) msg.message = msg.message.ephemeralMessage.message;
          if (msg?.key?.id) {
            msgStore.set(msg.key.remoteJid + ":" + msg.key.id, msg.message);
            if (msgStore.size > SMAX) msgStore.delete(msgStore.keys().next().value);
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
        patientWarned = false;
        if (Date.now() - lastRestartAt > 60000) restartStreak = 0;

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

        const code = lastDisconnect?.error?.output?.statusCode || 0;
        const registered = !!state.creds.registered;

        // B1.2: el riesgo solo cuenta con sesión YA válida. Durante el
        // pairing las desconexiones son normales (bloqueo de pantalla en
        // Android, datos móviles) y NO son señal de ban.
        if (registered) health.recordDisconnect();

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

        // ── RestartRequired (515): normal después del pairing ──
        // Backoff escalonado si se encadena. Antes este bloque hacía
        // return ANTES de retries++ con delay fijo de 1s: si el c0 se
        // repetía (sesión corrupta) → bucle infinito de reconnects cada
        // segundo, que es el patrón exacto que el servidor marca como
        // anómalo. Ahora: 1s, 1s, 15s, 60s, 5min; 6+ seguidos en <1min
        // cada uno → sesión corrupta, limpiar (como Ginko-MD).
        if (code === DisconnectReason.restartRequired || code === 0) {
          const now = Date.now();
          restartStreak = (now - lastRestartAt < 60000) ? restartStreak + 1 : 1;
          lastRestartAt = now;
          if (restartStreak >= 6) {
            if (registered) {
              // B1.1: NUNCA borrar una sesión válida. Tormenta de c0 =
              // sesión corrupta o problema del servidor; se sale con el
              // auth.db intacto. Si el fallo sigue al re-arrancar, el
              // usuario borra Sessions/Owner a mano para re-vincular.
              log.fatal("Demasiados restarts seguidos (c0) — saliendo SIN borrar la sesión");
              log.warn("Si el fallo persiste al reiniciar, borra la carpeta Sessions/Owner para vincular de nuevo.");
              process.exit(1);
            }
            log.fatal("Demasiados restarts seguidos (c0) — limpiando sesión");
            clearSession();
            process.exit(1);
          }
          const rDelays = [1000, 1000, 15000, 60000, 300000];
          const rDelay = rDelays[Math.min(restartStreak - 1, rDelays.length - 1)];
          log.gray(`Reconectando con credenciales nuevas (streak ${restartStreak}) en ${Math.round(rDelay / 1000)}s...`);
          isRestarting = false;
          setTimeout(start, rDelay);
          return;
        }

        if (!registered) {
          // B1.2: pairing paciente — aquí los reintentos NO cuentan.
          // No hay sesión válida que proteger y el usuario necesita tiempo
          // para teclear el código: reconexión con backoff sin límite,
          // como Ginko-MD. (Antes: 15 cortes de red durante el pairing
          // borraban auth.db y había que empezar de cero.)
          const pd = backoffDelay();
          log.gray(`Pairing: desconexión (${code}), reintentando en ${Math.round(pd / 1000)}s...`);
          isRestarting = false;
          setTimeout(start, pd);
          return;
        }

        retries++;
        if (retries > MAX_RETRIES) {
          // B1.1 (FIX CRÍTICO): antes esto borraba auth.db tras 15
          // desconexiones de CUALQUIER tipo — incluidos cortes de red
          // 408/428, fatales en Termux con datos móviles (15 cortes se
          // alcanzan en ~2 min y perdías la vinculación). Una sesión
          // válida NUNCA se borra por cortes de red: se pasa a modo
          // paciente (reintento cada ~5 min) hasta que vuelva la señal.
          if (!patientWarned) {
            log.warn("Muchos reintentos seguidos — modo paciente: reintento cada ~5 min, sesión intacta");
            patientWarned = true;
          }
          const pd = 300000 + Math.floor(Math.random() * 30000);
          isRestarting = false;
          setTimeout(start, pd);
          return;
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