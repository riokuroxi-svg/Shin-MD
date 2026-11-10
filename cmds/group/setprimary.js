/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { resolveJidSync, resolveParticipantJid } from '#serialize';
import { mismaPersona, resolver as resolverLid } from '#lib/lid';
import fs from 'fs';
import path from 'path';
import db from '../../src/services/ginko-db.js';

const sessionsPath = path.resolve(process.cwd(), 'Sessions');
const subsPath = path.join(sessionsPath, 'Subs');
const cleanNumber = (value = '') => String(value).split('@')[0].split(':')[0].replace(/\D/g, '');

function getBotsFromFolder(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath, { withFileTypes: true })
    .filter((dir) => dir.isDirectory() && fs.existsSync(path.join(folderPath, dir.name, 'creds.json')))
    .map((dir) => `${cleanNumber(dir.name)}@s.whatsapp.net`)
    .filter((jid) => jid !== '@s.whatsapp.net');
}

function getActiveSubBots() {
  if (!Array.isArray(global.conns)) return [];
  return global.conns
    .map((conn) => cleanNumber(conn?.user?.id || conn?.userId || ''))
    .filter(Boolean)
    .map((num) => `${num}@s.whatsapp.net`);
}

function getAllowedBots(mainBotJid) {
  const bots = [...getBotsFromFolder(subsPath), ...getActiveSubBots()];
  if (mainBotJid) bots.push(mainBotJid);
  return [...new Set(bots)];
}

export default {
  command: ['setprimary'],
  category: 'group',
  description: 'Establecer un bot como primario del grupo.',
  isAdmin: true,
  run: async ({ msg, sock, groupMetadata, participants }) => {
    const chat = db.getChat(msg.chat);
    const rawWho = msg.mentionedJid?.[0] || msg.quoted?.sender || null;
    if (!rawWho) return sock.reply(msg.chat, '《✧》 Por favor menciona un bot para convertirlo en primario.', msg);
    const who = resolverLid(rawWho) || resolveJidSync(rawWho, sock) || rawWho;
    const groupParticipants = (participants || groupMetadata?.participants || [])
      .map((p) => resolveParticipantJid(p, sock) || p.id)
      .filter(Boolean);
    const mainNumber = cleanNumber(global.sock?.user?.id || sock?.user?.id || '');
    const mainBotJid = mainNumber ? `${mainNumber}@s.whatsapp.net` : '';
    const allowedBots = getAllowedBots(mainBotJid);
    const matchedBot = allowedBots.find((b) => mismaPersona(b, who));
    if (!matchedBot) return sock.reply(msg.chat, '《✧》 El usuario mencionado no es una instancia de Sub-Bot.', msg);
    if (!groupParticipants.some((p) => mismaPersona(p, who))) {
      return sock.reply(msg.chat, '《✧》 El bot mencionado no está presente en este grupo.', msg);
    }
    if (chat.primaryBot && mismaPersona(chat.primaryBot, matchedBot)) {
      return sock.reply(msg.chat, `「✿」 @${matchedBot.split('@')[0]} ya es el Bot principal del Grupo.`, msg, { mentions: [matchedBot] });
    }
    chat.primaryBot = matchedBot;
    db.setChat(msg.chat, 'primaryBot', matchedBot);
    await sock.reply(msg.chat, `ꕥ Se ha establecido a @${matchedBot.split('@')[0]} como bot primario de este grupo.\n> Ahora todos los comandos de este grupo serán ejecutados por @${matchedBot.split('@')[0]}.`, msg, { mentions: [matchedBot] });
  },
};
