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
import { patchGroupMetadata } from "#serialize";
import * as lid from "../lib/lid.js";
import { panelCodigo } from "../services/consola.js";
import { esLid as esJidLid } from "../lib/jid.js";
import { resolveChannel } from "../lib/channel.js";
import { analizarCortes, podarCortes } from "../lib/cortes.js";
import db from "../services/ginko-db.js";
import pino from "pino";
import fs from "fs";
import path from "path";
import NodeCache from "node-cache";
import log from "#logger";
import { estilizar } from "#lib/theme";

export { getCachedMeta, setCachedMeta, deleteCachedMeta };

/**
 * B2.2 — ¿Este envío es "ligero"?
 * Reacciones, borrados y ediciones no crean un mensaje nuevo en el chat
 * (no notifican al destinatario), así que no deben gastar la cuota diaria
 * del warm-up. Sí pasan por la cola y respetan el delay anti-ban.
 * Exportada aparte para poder probarla sin abrir una sesión real.
 */
export function esEnvioLigero(content) {
  return !!(content && (content.react || content.delete || content.edit));
}

/**
 * Lo mismo, pero para lo que va por relayMessage (tarjetas nativas).
 * Un relay puede ser una edición o un borrado disfrazados de
 * protocolMessage; esos tampoco crean mensaje nuevo, así que no deben
 * gastar cuota del warm-up. Tipos del proto:
 *   REVOKE = 0 · MESSAGE_EDIT = 14
 */
export function esRelayLigero(message) {
  if (!message) return false;
  if (message.reactionMessage) return true;
  const tipo = message.protocolMessage?.type;
  return tipo === 0 || tipo === 14;
}

/**
 * Da al código de vinculación el formato que se teclea en el teléfono:
 * "ABCD1234" → "ABCD-1234". Si WhatsApp no devuelve nada, devuelve lo
 * mismo que recibió (null/undefined) para que quien llame decida.
 * @param {string|null} pair
 * @returns {string|null}
 */
export function formatearCodigoDeVinculacion(pair) {
  if (!pair) return pair;
  return (pair.match(/.{1,4}/g) || [pair]).join("-");
}

export function connectSocket(engine, opts) {
  opts = opts || {};
  const sessionDir = opts.sessionDir || "./Sessions/Owner";
  const pairingNumber = opts.pairingNumber || "";
  const pairingMethod = opts.pairingMethod || "";

  // Costuras para pruebas: permiten sustituir la fábrica de socket y la
  // consulta de versión (que sale a internet). En producción no se pasan
  // y todo usa Baileys de verdad. Sin esto, probar la vinculación exigía
  // una cuenta real y una red.
  const deps = opts.deps || {};
  const crearSocket = deps.makeSocket || makeWASocket;
  const obtenerVersion = deps.fetchVersion || fetchLatestBaileysVersion;
  // WhatsApp necesita un momento antes de aceptar la petición del código.
  // Configurable para que los tests no esperen 3 segundos reales.
  const pairingDelayMs = opts.pairingDelayMs ?? 3000;
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
  let avisoSinNumero = false;
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

  // Cortes de conexión recientes, para poder explicar una seguidilla en
  // vez de dejarla en «reconectando...» para siempre.
  const marcasDeCorte = [];
  let pistaDeCortesDada = false;
  let conectadoDesde = 0;

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
    try { const v = await obtenerVersion(); ver = v.version; }
    // Fallback verificado en vivo (2026-09): 1044802095 conecta y da QR.
    catch { ver = [2, 3000, 1044802095]; }

    let saveTimer;
    const saveCreds = () => { clearTimeout(saveTimer); saveTimer = setTimeout(sc, 2000); };

    console.info = () => {};
    console.debug = () => {};

    const s = crearSocket({
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
      emitOwnEvents: true,
      msgRetryCounterCache,
      cachedGroupMetadata: async (jid) => getCachedMeta(jid) ?? undefined,
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        const a = key.remoteJid ? msgStore.get(key.remoteJid + ":" + key.id) : undefined;
        return a ? (a.message || a) : (msgStore.get(SK + key.id) || {}).message;
      },
    });

    sock = s;
    patchGroupMetadata(s);
    // El conector guarda las parejas LID ↔ teléfono en el auth state: desde
    // aquí la capa LID puede preguntárselas (local, sin red) en vez de
    // esperar a que aparezcan en un mensaje.
    lid.conectarSesion(s);
    s.msgRetryCounterCache = msgRetryCounterCache;
    s.ev.on("creds.update", saveCreds);
    s.ev.on("group-participants.update", ({ id }) => { deleteCachedMeta(id); });
    // La 7.x emite cada pareja que descubre (mensaje, app-state, usync).
    // Se guarda en nuestra tabla para que sobreviva incluso a un cambio de
    // conector, y para unificar la economía en el acto.
    s.ev.on("lid-mapping.update", ({ lid: lidJid, pn: pnJid } = {}) => {
      if (!lidJid || !pnJid) return;
      lid.aprender(lidJid, pnJid);
    });
    s.ev.on("groups.update", (updates) => { for (const u of (updates || [])) deleteCachedMeta(u.id); });
    s.sendText = (j, t, q, o) => s.sendMessage(j, { text: t, ...o }, { quoted: q });
    s.reply = (j, t, q, o) => {
      const content = typeof t === "string" ? { text: t } : (t || {});
      const quote = q?.key ? q : (q?.full || q);
      return s.sendMessage(j, { ...content, ...(o || {}) }, { quoted: quote });
    };

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
      // Baileys hace `me.lid.split(...)` al enviar a un JID @lid. Si
      // la sesión es anterior al despliegue de LID y nunca guardó ese dato,
      // esa línea lanza TypeError y el envío se pierde (el usuario ve
      // "error interno" en cualquier comando). El teléfono es la misma
      // persona: se envía por ahí.
      if (esJidLid(j) && !s.user?.lid) {
        const pn = lid.pnDeLid(j);
        if (pn) {
          if (process.env.LOG_LEVEL === "debug") {
            log.gray(`[lid] la sesión no tiene me.lid: se envía a ${pn} en vez de ${j}`);
          }
          j = pn;
        }
      }
      // B2.2: reacciones, borrados y ediciones NO son mensajes nuevos para
      // WhatsApp (no generan notificación ni cuentan como "envío masivo"),
      // así que NO deben gastar la cuota diaria del warm-up. Siguen pasando
      // por la cola con su delay (el ritmo anti-ban se conserva intacto),
      // pero ya no agotan el tope diario ni se quedan bloqueadas detrás de
      // él. Antes, un solo .play gastaba 9 de los 20 envíos del día 0
      // porque cada reaccion/borrado contaba igual que un audio.
      // Pase de estilo: el sistema de diseño lo usaban 9 comandos de
      // 212, así que en vez de reescribir 101 ficheros a mano (y
      // romper alguno por el camino) el texto se peina aquí, de una
      // vez, justo antes de salir. La función es cobarde: si duda,
      // devuelve el texto igual. Se apaga con SHIN_ESTILO=0.
      if (c && typeof c.text === "string" && process.env.SHIN_ESTILO !== "0") {
        try { c = { ...c, text: estilizar(c.text) }; } catch {}
      }

      const esLigero = esEnvioLigero(c);
      const qo = {
        messageLength: c?.text?.length || 0,
        // B1.4: prioridad por flag explícito (_priority) o por ventana de
        // prioridad activa (comandos priority: .menu/.ping/.owner).
        isPriority: !!(o && o._priority) || sendQueue.inPriority(),
        countsForQuota: !esLigero,
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
      // Misma guarda que en sendMessage: las tarjetas interactivas también
      // pueden ir a un chat @lid y tropezar con la misma línea de Baileys.
      if (esJidLid(j) && !s.user?.lid) {
        const pn = lid.pnDeLid(j);
        if (pn) j = pn;
      }
      const text = m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || "";
      return sendQueue.enqueue(() => origRelay(j, m, o), {
        messageLength: String(text).length,
        isPriority: sendQueue.inPriority(), // B1.4: tarjetas interactivas de comandos priority
        // Las ediciones y borrados que viajan como protocolMessage no
        // crean mensaje nuevo: respetan el delay pero no gastan cuota.
        countsForQuota: !esRelayLigero(m),
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
      if (engine.getState() < engine.LIFECYCLE.READY) return;
      if (!Array.isArray(messages)) return;
      for (const msg of messages) {
        try {
          if (!msg?.message || msg.key?.remoteJid === "status@broadcast") continue;
          // Ignorar mensajes enviados por el código interno del bot (evita bucles)
          if (msg.key?.fromMe && msg.key?.id && msgStore.has(SK + msg.key.id)) continue;
          const rawTs = typeof msg.messageTimestamp === "object" && msg.messageTimestamp !== null
            ? (msg.messageTimestamp.low || Number(msg.messageTimestamp))
            : Number(msg.messageTimestamp || 0);

          // Descartar únicamente mensajes históricos viejos de hace más de 3 minutos
          if (rawTs > 0 && (Date.now() - rawTs * 1000) > 180_000) continue;

          // Desenvolver recursivamente wrappers de mensajes (ephemeral, viewOnce, etc.)
          let inner = msg.message;
          while (
            inner?.ephemeralMessage?.message ||
            inner?.viewOnceMessage?.message ||
            inner?.viewOnceMessageV2?.message ||
            inner?.viewOnceMessageV2Extension?.message ||
            inner?.documentWithCaptionMessage?.message ||
            inner?.editedMessage?.message
          ) {
            inner =
              inner.ephemeralMessage?.message ||
              inner.viewOnceMessage?.message ||
              inner.viewOnceMessageV2?.message ||
              inner.viewOnceMessageV2Extension?.message ||
              inner.documentWithCaptionMessage?.message ||
              inner.editedMessage?.message;
          }
          msg.message = inner;

          // La pareja LID ↔ teléfono se aprende ANTES de decidir si el
          // mensaje es un comando: un "hola", un sticker o un mensaje sin
          // texto también sirven para no partir la cuenta del usuario.
          lid.aprenderDeMensaje(msg.key);
          // Si el mensaje solo trajo una cara (típico: chat direccionado
          // por LID), el conector suele saber la otra. Se pregunta sin
          // bloquear: LID → teléfono es una consulta local.
          lid.refrescarDesdeConector(msg.key);

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

      // Sin QR, a propósito: en un móvil no cabe y partido no se puede
      // escanear. Si el conector manda uno es porque nadie pidió el
      // código todavía; se ignora y se dice qué hacer, una sola vez.
      if (qr != null && !state.creds.registered && !pairingNumber && !avisoSinNumero) {
        avisoSinNumero = true;
        log.warn("WhatsApp pide vincular, pero no sé con qué número: reinicia con --code o define PAIRING_NUMBER.");
      }

      if (connection === "open") {
        retries = 0;
        isRestarting = false;
        patientWarned = false;
        if (typeof engine.resetBootTime === "function") engine.resetBootTime();
        if (Date.now() - lastRestartAt > 60000) restartStreak = 0;

        // FORZAR guardado inmediato de credenciales ANTES de que se cierre
        clearTimeout(saveTimer);
        try { await sc(); } catch {}
        saveTimer = null;

        conectadoDesde = Date.now();
        if (podarCortes(marcasDeCorte).length === 0) pistaDeCortesDada = false;

        // Volvió la conexión: lo que se quedó en cola sale ahora, en orden.
        // El motivo es "conexion" y no un resume() a secas para no quitarle
        // la pausa al watchdog si la tiene puesta por riesgo.
        try { engine.getSendQueue()?.resume?.("conexion"); } catch {}

        engine.transit(engine.LIFECYCLE.READY);
        engine.emit("connected", s.user);
        log.success("[ ✿ ] Conectado a: " + (s.user?.name || s.user?.id || "?"));
        if (onReady) onReady(s);

        // Resolver metadata del canal oficial en background
        resolveChannel(s, db).catch(() => {});

        // B2.2: log estilo Ginko — "Grupos: X" al conectar, y el dato queda
        // disponible para el panel /health. Con setTimeout para no frenar la
        // transición READY; si falla no pasa nada (el contador queda en 0).
        setTimeout(async () => {
          try {
            const groups = await s.groupFetchAllParticipating();
            const n = Object.keys(groups || {}).length;
            if (typeof engine.setGroupCount === "function") engine.setGroupCount(n);
            log.info("Grupos: " + n);
          } catch {}
        }, 1500);
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
        // La conexión se cayó: la cola se para SIN vaciarse. Todo lo que
        // llegue mientras estamos fuera (una respuesta a un comando, un
        // aviso) espera aquí y sale al reconectar. Antes no se pausaba:
        // esos envíos morían contra el socket cerrado y se perdían.
        try { engine.getSendQueue()?.pause?.("conexion"); } catch {}

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

        // Cuánto duró la conexión y por qué se corta tanto. Un 428 no dice
        // quién cerró: si van tres en diez minutos, casi siempre es Android
        // durmiendo la app o una segunda instancia con la misma sesión.
        if (conectadoDesde) {
          const seg = Math.round((Date.now() - conectadoDesde) / 1000);
          log.gray("▸ Duró " + (seg >= 60 ? Math.round(seg / 60) + " min" : seg + " s") + " conectada");
          conectadoDesde = 0;
        }
        marcasDeCorte.push(Date.now());
        const corte = analizarCortes(podarCortes(marcasDeCorte));
        if (corte.pista && !pistaDeCortesDada) {
          pistaDeCortesDada = true;
          log.warn(corte.pista);
        }

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
            // Marca de diagnóstico: deja constancia en la consola de que el
            // bot SÍ llegó a pedir el código. La usa scripts/verificar-pairing.js,
            // que comprueba el arranque real con un número inventado.
            if (process.env.SHIN_PAIRING_DEBUG === "1") log.info("Pairing: solicitando código de vinculación…");
            const pair = await s.requestPairingCode(phone);
            const code = formatearCodigoDeVinculacion(pair);
            // El código se dibuja aparte del registro: es lo único que la
            // persona tiene que mirar, y entre líneas de log se perdía.
            console.log(panelCodigo({ numero: phone, codigo: code }));
          }
        } catch (e) { log.error("Pairing: " + (e.message || e)); }
      }, pairingDelayMs);
    }

    isRestarting = false;
    return s;
  }

  return { start, getSocket: () => sock };
}