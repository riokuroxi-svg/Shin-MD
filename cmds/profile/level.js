/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';
import { generateProfileCard } from '../../src/lib/cardGenerator.js';
import { sendInteractive } from "#interactive";
import { atajo } from "#lib/ui-kit";

const growth = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 0.75;

function xpRange(level, multiplier = global.multiplier || 2) {
  if (level < 0) throw new TypeError('level cannot be negative value');
  level = Math.floor(level);
  const min = level === 0 ? 0 : Math.round(Math.pow(level, growth) * multiplier) + 1;
  const max = Math.round(Math.pow(level + 1, growth) * multiplier);
  return { min, max, xp: max - min };
}

export default {
  command: ['level', 'lvl', 'nivel', 'xp'],
  category: 'profile',
  description: 'Ver tu nivel y experiencia actual con tarjeta gráfica.',
  run: async ({ msg, sock, text, usedPrefix }) => {
    const chatId = msg.chat;
    const who = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    const user = db.getUser(who);
    if (!user) {
      return msg.reply(`「✎」 El usuario mencionado no está registrado en el bot.`);
    }

    const allUsers = db.getUser() || [];
    const users = Array.isArray(allUsers) ? allUsers.map(u => ({ ...u, jid: u.id })) : [];
    const sortedLevel = users.sort((a, b) => (b.level || 0) - (a.level || 0));
    const rank = sortedLevel.findIndex(u => u.jid === who) + 1;
    const { min, max, xp } = xpRange(user.level || 0, global.multiplier);
    const progresoActual = Math.max(0, (user.exp || 0) - min);
    const porcentaje = xp > 0 ? Math.min(100, Math.floor((progresoActual / xp) * 100)) : 0;

    let perfilUrl = null;
    try {
      perfilUrl = await sock.profilePictureUrl(who, 'image');
    } catch {
      perfilUrl = null;
    }

    let txt = `╭┈┈⫹⫺ *NIVEL Y EXPERIENCIA* ⫹⫺┈┈╮\n`;
    txt += `│ ◈ *Usuario* : *${user.name || msg.pushName || "Usuario"}*\n`;
    txt += `│ ◈ *Nivel Actual* : *${user.level || 0}*\n`;
    txt += `│ ◈ *Rango Global* : *#${rank || 1}*\n`;
    txt += `│ ◈ *EXP Actual* : *${(user.exp || 0).toLocaleString()}* / ${max.toLocaleString()}\n`;
    txt += `│ ◈ *Progreso* : *${progresoActual} => ${xp}* _(${porcentaje}%)_\n`;
    txt += `│ ◈ *Comandos* : *${(user.usedcommands || 0).toLocaleString()}*\n`;
    txt += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯`;

    let cardBuffer = null;
    try {
      cardBuffer = await generateProfileCard({
        name: user.name || msg.pushName || "Usuario",
        rank: user.isOwner ? "Owner" : (user.isPremium ? "Premium" : "Miembro"),
        level: user.level || 0,
        exp: progresoActual,
        maxExp: xp || 100,
        coins: user.coins || 0,
        avatarUrl: perfilUrl,
      });
    } catch {}

    await sendInteractive(sock, chatId, {
      body: txt,
      footer: 'Nivel · Shin-MD',
      buttons: [
        atajo('🏆 Tabla de niveles', 'lboard', usedPrefix),
        atajo('👤 Mi perfil', 'profile', usedPrefix),
        atajo('💰 Mi saldo', 'balance', usedPrefix),
      ],
      image: cardBuffer || null,
      quoted: msg.full || msg,
      fallbackText: txt,
      contextInfo: { mentionedJid: [who] },
    });
    return null;
  }
};
