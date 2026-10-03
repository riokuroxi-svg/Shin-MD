/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import makeWASocket, { Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, jidDecode } from 'baileys';
import { useSQLiteAuthState } from '#lib/sqliteAuth';
import NodeCache from 'node-cache';
import events from '#events';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { smsg, patchGroupMetadata, getCachedMeta } from '#serialize';
import { sendNativeQuickReply } from '#lib/native-reply';
import db from '../../src/services/ginko-db.js';

if (!global.conns) global.conns = [];
const reintentos = {};
const commandFlags = {};
const cleanJid = (jid = '') => jid.replace(/:\d+/, '').split('@')[0];
const sessionsPath = path.resolve(process.cwd(), 'Sessions');
const subsPath = path.join(sessionsPath, 'Subs');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getClient(client) {
  const userId = client?.user?.id?.split(':')[0];
  if (!userId) return client;
  return global.conns?.find((c) => c?.user?.id?.split(':')[0] === userId) || client;
}

export function remove(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners(); } catch {}
  try { sock.ws?.close(); } catch {}
  try { sock.end?.(new Error('replaced')); } catch {}
  try { sock.msgRetryCounterCache?.close(); } catch {}
}

const logger = pino({ level: 'silent' });
const versionCache = { value: null, expiresAt: 0 };
async function getVersion() {
  if (versionCache.value && Date.now() < versionCache.expiresAt) return versionCache.value;
  try {
    const latest = await fetchLatestBaileysVersion();
    versionCache.value = latest.version;
    versionCache.expiresAt = Date.now() + 60 * 60 * 1000;
  } catch (e) {
    if (!versionCache.value) versionCache.value = [2, 3000, 1033105955];
  }
  return versionCache.value;
}

function normalizePhone(input) {
  let s = String(input).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = s.replace(/^0+/, '');
  if (s.length === 10 && s.startsWith('3')) s = '57' + s;
  if (s.startsWith('52') && !s.startsWith('521') && s.length >= 12) s = '521' + s.slice(2);
  if (s.startsWith('54') && !s.startsWith('549') && s.length >= 11) s = '549' + s.slice(2);
  return s;
}

function backoffDelay(attempt, baseMs = 4000, maxMs = 45000, jitterMs = 2000) {
  const exponential = baseMs * Math.pow(1.6, Math.min(attempt, 8));
  const capped = Math.min(maxMs, exponential);
  return Math.max(2000, capped + (Math.random() * jitterMs * 2 - jitterMs));
}

function getBannerBuffer() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'assets', 'banner-default.png'),
    path.resolve(process.cwd(), 'assets', 'bocchi-banner.png'),
    path.resolve(process.cwd(), 'assets', 'avatar-default.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try { return fs.readFileSync(p); } catch {}
    }
  }
  return null;
}

export async function startSubBot(msg, client, caption = '', isCode = false, phone = '', chatId = '', isCommand = false) {
  const id = normalizePhone(phone || (msg?.sender || '').split('@')[0]);
  if (!id) throw new Error('No se pudo obtener el número del Sub-Bot.');
  ensureDir(subsPath);
  const sessionFolder = path.join(subsPath, id);
  const senderId = msg?.sender;
  const { state, saveCreds: saveCredsDB } = await useSQLiteAuthState(sessionFolder);
  const version = await getVersion();
  let saveCredsTimer = null;
  const saveCreds = () => { clearTimeout(saveCredsTimer); saveCredsTimer = setTimeout(saveCredsDB, 2000); };
  const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });
  const msgStore = new Map();
  const msgLimit = 500;
  console.info = () => {};
  const socks = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.windows('Chrome'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    fireInitQueries: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
    keepAliveIntervalMs: 30000,
    connectTimeoutMs: 20000,
    transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
    emitOwnEvents: false,
    msgRetryCounterCache,
    cachedGroupMetadata: async (jid) => getCachedMeta(jid) ?? undefined,
    getMessage: async (key) => msgStore.get(key.remoteJid + ':' + key.id),
  });
  patchGroupMetadata(socks);
  socks.msgRetryCounterCache = msgRetryCounterCache;
  socks.isCommand = isCommand;
  socks.senderId = senderId;
  socks.chatId = chatId;
  socks.client = client;
  socks.isCode = isCode;
  socks.sessionFolder = sessionFolder;
  socks.ev.on('creds.update', saveCreds);
  socks.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
    }
    return jid;
  };
  let bootTime = Date.now();
  let botReady = false;
  socks.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!botReady) return;
    if (type !== 'notify') return;
    for (const raw of messages) {
      if (raw?.message && raw?.key?.id) {
        const sid = raw.key.remoteJid + ':' + raw.key.id;
        msgStore.set(sid, raw.message);
        if (msgStore.size > msgLimit) msgStore.delete(msgStore.keys().next().value);
      }
      try {
        if (!raw?.message || raw.key?.remoteJid === 'status@broadcast') continue;
        if ((raw.messageTimestamp * 1000) < bootTime - 15_000) continue;
        if (raw.message.ephemeralMessage) raw.message = raw.message.ephemeralMessage.message;
        const m = await smsg(socks, raw);
      } catch (e) { console.log(e); }
    }
  });
  try { await events(socks, msg); } catch (err) { console.log(chalk.gray(`[ EVENT ERROR  ]  → ${err}`)); }
  socks.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection === 'open') {
      bootTime = Date.now();
      botReady = true;
      socks.uptime = Date.now();
      socks.userId = cleanJid(socks.user?.id?.split('@')[0]);
      const botDir = socks.userId + '@s.whatsapp.net';
      const settings = db.getSettings(botDir);
      settings.type = 'Sub';
      db.setSettings(botDir, 'type', settings.type);
      const conss = global.conns.findIndex((c) => c.userId === socks.userId);
      if (conss !== -1) { global.conns[conss] = socks; } else { global.conns.push(socks); }
      delete reintentos[socks.userId || id];
      console.log(chalk.gray(`[ ✿  ]  SUB-BOT conectado: ${socks.userId}`));
      
      // Guardar credenciales de forma inmediata y síncrona
      clearTimeout(saveCredsTimer);
      try { await saveCredsDB(); } catch {}

      const sentFlagFile = path.join(socks.sessionFolder, 'msg_sent.flag');
      const hasSentMessage = fs.existsSync(sentFlagFile);
      if (msg && socks.isCommand && !hasSentMessage && socks.client && socks.chatId) {
        await socks.client.sendMessage(chatId, { text: `✎ Has conectado un nuevo Socket de tipo *Sub*.` }, { quoted: msg });
        fs.writeFileSync(sentFlagFile, '1');
        socks.isCommand = false;
        if (commandFlags[socks.senderId]) delete commandFlags[socks.senderId];
      }
    }
    if (connection === 'close') {
      const botId = socks.userId || id;
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 0;
      remove(socks);
      const isRegistered = Boolean(state.creds?.registered);
      const intentos = reintentos[botId] || 0;
      reintentos[botId] = intentos + 1;
      const delay = backoffDelay(intentos, 4000, 30000, 1500);

      // Si es un sub-bot YA registrado, NUNCA borrar la sesión por cortes de red o reinicios
      if (isRegistered) {
        if ([401, 403].includes(reason) && reason === 401 && String(lastDisconnect?.error?.message || '').includes('logged out')) {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} Sesión cerrada desde el teléfono. Limpiando.`));
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch {}
          delete reintentos[botId];
          return;
        }
        console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} reconectando sesión existente en ${Math.round(delay/1000)}s...`));
        setTimeout(() => startSubBot(msg, getClient(client), caption, isCode, phone, chatId, isCommand), delay);
        return;
      }

      // Si estaba en fase de pairing (aún no registrado)
      if ([401, 403].includes(reason)) {
        if (intentos < 5) {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} Pairing en progreso (${reason}) intento ${intentos}/5 → Reintentando en ${Math.round(delay/1000)}s...`));
          setTimeout(() => startSubBot(msg, getClient(client), caption, isCode, phone, chatId, isCommand), delay);
        } else {
          console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} Código de pairing expirado. Limpiando temporales.`));
          try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
          delete reintentos[botId];
        }
        return;
      }
      console.log(chalk.gray(`[ ✿  ]  SUB-BOT ${botId} desconectado (${reason}), reconectando en ${Math.round(delay/1000)}s...`));
      setTimeout(() => startSubBot(msg, getClient(client), caption, isCode, phone, chatId, isCommand), delay);
    }

    // ── Envío de Código de Emparejamiento (TODO EN UN SOLO MENSAJE CON IMAGEN + BOTÓN COPIAR) ──
    if (qr && isCode && phone && socks.client && chatId && senderId && commandFlags[senderId]) {
      try {
        let codeGen = await socks.requestPairingCode(phone);
        codeGen = codeGen.match(/.{1,4}/g)?.join('-') || codeGen;
        delete commandFlags[senderId];

        const instagramLink = global.links?.instagram || 'https://www.instagram.com/__ikg.05';
        const instagramTag = instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '');

        const textMessage = `\`✤\` Vincula tu *cuenta* usando el *código.*\n\n` +
          `> ✥ Sigue las *instrucciones*\n\n` +
          `*›* Click en los *3 puntos* (o Ajustes)\n` +
          `*›* Toque *Dispositivos vinculados*\n` +
          `*›* Vincular *nuevo dispositivo*\n` +
          `*›* Selecciona *Vincular con el número de teléfono*\n\n` +
          `*Código:* \`${codeGen}\`\n\n` +
          `ꕤ *\`Importante\`*\n` +
          `> ₊·( 🜸 ) ➭ Este *Código* expira en 60s y solo funciona en el *número que lo solicitó.*`;

        const bannerBuf = getBannerBuffer();

        const replyRes = await sendNativeQuickReply({
          sock: socks.client,
          jid: chatId,
          body: textMessage,
          footer: `❦ Shin-MD · Instagram: ${instagramTag}`,
          title: '❦ Shin-MD Sub-Bot',
          quoted: msg,
          buttons: [
            {
              name: 'cta_copy',
              text: '📋 Copiar Código',
              copy_code: codeGen,
            },
          ],
          imageBuffer: bannerBuf,
        });

        let sentMsgKey = replyRes?.key;
        if (!replyRes?.sent) {
          const fallback = await socks.client.sendMessage(chatId, bannerBuf ? {
            image: bannerBuf,
            caption: textMessage,
          } : { text: textMessage }, { quoted: msg }).catch(() => null);
          sentMsgKey = fallback?.key;
        }

        setTimeout(async () => {
          if (sentMsgKey) {
            try { await socks.client.sendMessage(chatId, { delete: sentMsgKey }); } catch {}
          }
        }, 60000);
      } catch (err) { console.error('[Código Error]', err); }
    }

    // ── Envío de Código QR (TODO EN UN SOLO MENSAJE CON QR GENERADO) ──
    if (qr && !isCode && socks.client && chatId && senderId && commandFlags[senderId]) {
      try {
        delete commandFlags[senderId];
        const qrBuffer = await qrcode.toBuffer(qr, { scale: 8 });
        const instagramLink = global.links?.instagram || 'https://www.instagram.com/__ikg.05';
        const instagramTag = instagramLink.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, '');

        const qrText = `\`✤\` Vincula tu *cuenta* usando *código QR.*\n\n` +
          `> ✥ Sigue las *instrucciones*\n\n` +
          `*›* Click en los *3 puntos* (o Ajustes)\n` +
          `*›* Toque *Dispositivos vinculados*\n` +
          `*›* Vincular *nuevo dispositivo*\n` +
          `*›* Escanea el código *QR.*\n\n` +
          `> ₊·( 🜸 ) ➭ Recuerda no usar tu cuenta principal para registrar un socket.\n\n` +
          `❦ Shin-MD · Instagram: ${instagramTag}`;

        const msgQR = await socks.client.sendMessage(chatId, {
          image: qrBuffer,
          caption: qrText,
        }, { quoted: msg });

        setTimeout(async () => {
          if (msgQR?.key) {
            try { await socks.client.sendMessage(chatId, { delete: msgQR.key }); } catch {}
          }
        }, 60000);
      } catch (err) { console.error('[QR Error]', err); }
    }
  });
  return socks;
}

function msToTime(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes} minuto${minutes !== 1 ? 's' : ''} y ${seconds} segundo${seconds !== 1 ? 's' : ''}`
    : `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
}

export default {
  command: ['code', 'qr', 'serbot', 'jadibot'],
  category: 'socket',
  description: 'Gestionar y vincular subbots por código o QR.',
  run: async ({ msg, sock, args, command }) => {
    db.setCreate('users', msg.sender, 'Subs', 0);
    const user = db.getUser(msg.sender);
    const lastSubTime = Number(user?.Subs || 0);
    if (Date.now() - lastSubTime < 80000) {
      const remainingTime = (lastSubTime + 80000) - Date.now();
      return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remainingTime)}* para volver a intentar vincular un socket.`, msg);
    }
    ensureDir(subsPath);
    const allSubs = fs.readdirSync(subsPath, { withFileTypes: true })
      .filter((dir) => dir.isDirectory() && fs.existsSync(path.join(subsPath, dir.name, 'creds.json')))
      .map((dir) => dir.name);
    const activeSubNumbers = new Set();
    if (global.conns && Array.isArray(global.conns)) {
      for (const conn of global.conns) {
        if (conn?.user?.id) activeSubNumbers.add(conn.user.id.split(':')[0]);
      }
    }
    const activeSubs = allSubs.filter((num) => activeSubNumbers.has(num));
    if (activeSubs.length >= 50) {
      return sock.reply(msg.chat, '✐ No se han encontrado espacios disponibles para registrar un `Sub-Bot`.', msg);
    }
    commandFlags[msg.sender] = true;
    const isCode = /^(code|serbot|jadibot)$/.test(command);
    const fullArgs = args.join(' ');
    const separatorIndex = fullArgs.search(/[|•/]/);
    const rawPhone = separatorIndex === -1 ? fullArgs.trim() : fullArgs.slice(separatorIndex + 1).trim();
    const phone = normalizePhone(rawPhone || msg.sender.split('@')[0]);
    await startSubBot(msg, sock, '', isCode, phone, msg.chat, true);
    db.setUser(msg.sender, 'Subs', Date.now());
  },
};
