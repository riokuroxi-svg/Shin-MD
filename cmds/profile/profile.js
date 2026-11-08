/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { botJid } from "#serialize";
import moment from 'moment-timezone';
import db from '../../src/services/ginko-db.js';
import defaultAvatar from '../../lib/default-avatar.js';
import { generateProfileCard } from '../../src/lib/cardGenerator.js';
import { sendInteractive } from "#interactive";
import { atajo } from "#lib/ui-kit";
import { xpRange } from "#lib/xp";


export default {
  command: ['profile', 'perfil'],
  category: 'profile',
  description: 'Ver tu perfil con tarjeta gráfica personalizada de estadísticas.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    const userId = msg.mentionedJid?.[0] || msg.quoted?.sender || msg.sender;
    db.setCreate('chat_users', [msg.chat, userId], 'favorite', '');
    let user = db.getChatUser(msg.chat, userId);
    if (!user) {
      return msg.reply('✎ El usuario *mencionado* no está *registrado* en el bot');
    }
    const idBot = botJid(sock) || '';
    const settings = db.getSettings(idBot) || {};
    const currency = settings.currency || '';
    const user2 = db.getUser(userId) || {};
    const name = user2.name || msg.pushName || 'Usuario';
    const birth = user2.birth || 'Sin especificar';
    const genero = user2.genre || 'Oculto';
    const comandos = user2.usedcommands || '0';
    let pareja = 'Nadie';
    if (user2.marry) {
      const partner = db.getUser(user2.marry) || {};
      pareja = partner?.name || 'Alguien';
    }
    const estadoCivil = genero === 'Mujer' ? 'Casada con' : genero === 'Hombre' ? 'Casado con' : 'Casadx con';
    const desc = user2.description ? `\n> ${user2.description}` : '';
    const pasatiempo = user2.pasatiempo ? `${user2.pasatiempo}` : 'No definido';
    const exp = user2.exp || 0;
    const nivel = user2.level || 0;
    const chocolates = user.coins || 0;
    const banco = user.bank || 0;
    const totalCoins = chocolates + banco;
    const favId = user.favorite;
    let favLine = '';
    if (favId) {
      const character = db.getCharacter(favId);
      if (character) {
        favLine = `\n๑ Claim favorito » *${character.name || '???'}*`;
      }
    }
    const ownedIDs = Array.isArray(user.characters) ? user.characters : [];
    let haremValue = 0;
    for (const id of ownedIDs) {
      const character = db.getCharacter(id);
      if (character) {
        haremValue += character.value || 0;
      }
    }
    const haremCount = ownedIDs.length;
    let perfilUrl = null;
    try {
      perfilUrl = await sock.profilePictureUrl(userId, 'image');
    } catch {
      perfilUrl = null;
    }

    const allUsers = db.getUser() || [];
    const users = Array.isArray(allUsers) ? allUsers.map(u => ({ ...u, jid: u.id })) : [];
    const sortedLevel = users.sort((a, b) => (b.level || 0) - (a.level || 0));

    try {
      const rankPos = sortedLevel.findIndex((u) => u.jid === userId) + 1;
      const { min, max, xp } = xpRange(nivel, global.multiplier);
      const progreso = Math.max(0, exp - min);
      const porcentaje = xp > 0 ? Math.min(100, Math.floor((progreso / xp) * 100)) : 0;

      const userRank = user2.isOwner ? "Owner" : (user2.isPremium ? "Premium" : "Miembro");

      let profileText = `╭┈┈⫹⫺ *PERFIL DE USUARIO* ⫹⫺┈┈╮\n`;
      profileText += `│ ◈ *Nombre* : *${name}*\n`;
      profileText += `│ ◈ *Rango* : *${userRank}* (Top #${rankPos || 1})\n`;
      profileText += `│ ◈ *Nivel* : *${nivel}* (${porcentaje}%)\n`;
      profileText += `│ ◈ *EXP* : *${exp.toLocaleString()}* / ${max.toLocaleString()}\n`;
      profileText += `│ ◈ *Monedas* : *¥${totalCoins.toLocaleString()} ${currency}*\n`;
      profileText += `│ ◈ *Harem* : *${haremCount} personajes* (¥${haremValue.toLocaleString()})\n`;
      profileText += `│ ◈ *Cumpleaños* : *${birth}*\n`;
      profileText += `│ ◈ *Pasatiempo* : *${pasatiempo}*\n`;
      profileText += `│ ◈ *Estado Civil* : *${estadoCivil} ${pareja}*\n`;
      profileText += `│ ◈ *Comandos Usados* : *${comandos.toLocaleString()}*\n`;
      profileText += `╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯${desc}${favLine}`;

      // Generar tarjeta vectorial estética
      let cardBuffer = null;
      try {
        cardBuffer = await generateProfileCard({
          name,
          rank: userRank,
          level: nivel,
          exp: progreso,
          maxExp: xp || 100,
          coins: totalCoins,
          avatarUrl: perfilUrl,
        });
      } catch {}

      // La ficha ya se dibujaba bonita; lo que le faltaba eran los
      // atajos. Los botones lanzan otros comandos del bot tal cual,
      // así que desde el perfil se llega al nivel o al saldo sin
      // escribir nada. Si la tarjeta no se dibuja, sale la imagen
      // con el mismo texto de siempre: no se pierde nada.
      const atajosPerfil = [
        atajo('📊 Mi nivel', 'level', usedPrefix),
        atajo('💰 Mi saldo', 'balance', usedPrefix),
        atajo('✏️ Editar descripción', 'setdesc', usedPrefix),
      ];

      await sendInteractive(sock, msg.chat, {
        body: profileText,
        footer: 'Perfil · Shin-MD',
        buttons: atajosPerfil,
        image: cardBuffer || (perfilUrl || null),
        quoted: msg.full || msg,
        fallbackText: profileText,
      });
      return null;
    } catch (e) {
      return msg.reply(`> Error al mostrar el perfil: *${e.message}*`);
    }
  },
};
