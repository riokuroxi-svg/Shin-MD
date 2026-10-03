/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import { pickRandom, randomInt } from "#lib/random";
import db from '../../src/services/ginko-db.js';
export default {
  command: ['adventure', 'aventura'],
  category: 'economy',
  description: 'Ir de aventuras para ganar coins.',
  run: async ({ msg, sock, usedPrefix, command, text }) => {
    const { blocked, message: avisoEconomia, chat } = economyGate(msg.chat, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    const botId = botJid(sock);
    const settings = db.getSettings(botId);
    const currency = settings.currency;
    db.setCreate('chat_users', [msg.chat, msg.sender], 'weapons', {});
    db.setCreate('chat_users', [msg.chat, msg.sender], 'lastadventure', 0);
    let user = db.getChatUser(msg.chat, msg.sender);
    if (user.weapons && typeof user.weapons === 'string') {
      try { user.weapons = JSON.parse(user.weapons); } catch { user.weapons = {}; }
    }
    const staminaConsumed = randomInt(1, 5);
    if (user.stamina < staminaConsumed) {
      return msg.reply(`ꕥ No tienes suficiente stamina para salir de aventura.\n> Usa *${usedPrefix}heal* para curarte.`);
    }
    let usingMagic = false;
    let usingWeapon = false;
    if (user.weapons?.espada) {
      if (user.weapons.espada.durability <= 10) {
        delete user.weapons.espada;
        db.setChatUser(msg.chat, msg.sender, 'weapons', user.weapons);
        return msg.reply(`ꕥ Tu Espada se ha roto por el uso y ha sido eliminada de tu inventario.\n> Compra una nueva con: *${usedPrefix}buy espada*`);
      }
      usingWeapon = true;
    } else {
      const magicConsumed = randomInt(1, 12);
      if (user.magic < magicConsumed) {
        return msg.reply(`ꕥ Tu magia está agotada y no tienes un arma.\n> Toma una poción para reabastecer tu magia o compra un arma con: *${usedPrefix}buy espada*`);
      }
      usingMagic = true;
      user.magic -= magicConsumed;
      db.setChatUser(msg.chat, msg.sender, 'magic', user.magic);
    }
    if (user.health < 5) {
      return msg.reply(`ꕥ No tienes suficiente salud para volver a *aventurarte*.\n> Usa *${usedPrefix}heal* para curarte.`);
    }
    const remainingTime = user.lastadventure - Date.now();
    if (remainingTime > 0) {
      return sock.reply(msg.chat, `ꕥ Debes esperar *${msToTime(remainingTime)}* para usar *${usedPrefix + command}* de nuevo.`, msg);
    }
    user.stamina -= staminaConsumed;
    db.setChatUser(msg.chat, msg.sender, 'stamina', user.stamina);
    const rand = Math.random();
    let cantidad = 0;
    let salud = randomInt(1, 20);
    let durabilityConsumed = randomInt(1, 15);
    let message;
    if (rand < 0.4) {
      if (usingWeapon) {
        user.weapons.espada.durability -= durabilityConsumed;
        if (user.weapons.espada.durability <= 10) {
          delete user.weapons.espada;
        }
        db.setChatUser(msg.chat, msg.sender, 'weapons', user.weapons);
      }
      cantidad = randomInt(14000, 18000);
      user.coins += cantidad;
      user.health -= salud;
      db.setChatUser(msg.chat, msg.sender, 'coins', user.coins);
      db.setChatUser(msg.chat, msg.sender, 'health', user.health);
      const successMessages = [
        `Derrotaste a un ogro emboscado entre los árboles de Drakonia, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Te conviertes en campeón del torneo de gladiadores de Valoria, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Rescatas un libro mágico del altar de los Susurros, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Liberas a aldeanos atrapados en las minas de Ulderan tras vencer a los trolls, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Derrotas a un dragón joven en los acantilados de Flamear, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Encuentras un relicario sagrado en las ruinas de Iskaria y lo proteges de saqueadores, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Triunfas en el duelo contra el caballero corrupto de Invalion, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Conquistas la fortaleza maldita de las Sombras Rojas sin sufrir bajas, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Te infiltras en el templo del Vacío y recuperas el cristal del equilibrio, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Resuelves el acertijo de la cripta eterna y obtienes un tesoro legendario, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`
      ];
      message = pickRandom(successMessages);
    } else if (rand < 0.7) {
      if (usingWeapon) {
        user.weapons.espada.durability -= durabilityConsumed;
        if (user.weapons.espada.durability <= 10) {
          delete user.weapons.espada;
        }
        db.setChatUser(msg.chat, msg.sender, 'weapons', user.weapons);
      }
      cantidad = randomInt(9000, 11000);
      const total = (user.coins || 0) + (user.bank || 0);
      if (total >= cantidad) {
        if (user.coins >= cantidad) {
          user.coins -= cantidad;
          db.setChatUser(msg.chat, msg.sender, 'coins', user.coins);
        } else {
          const restante = cantidad - user.coins;
          user.coins = 0;
          user.bank -= restante;
          db.setChatUser(msg.chat, msg.sender, 'coins', 0);
          db.setChatUser(msg.chat, msg.sender, 'bank', user.bank);
        }
      } else {
        cantidad = total;
        user.coins = 0;
        user.bank = 0;
        db.setChatUser(msg.chat, msg.sender, 'coins', 0);
        db.setChatUser(msg.chat, msg.sender, 'bank', 0);
      }
      user.health -= salud;
      if (user.health < 0) user.health = 0;
      db.setChatUser(msg.chat, msg.sender, 'health', user.health);
      const failMessages = [
        `El hechicero oscuro te lanzó una maldición y huyes perdiendo *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Te extravías en la jungla de Zarkelia y unos bandidos te asaltan, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un basilisco te embiste y escapas herido sin botín, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Fracasa tu incursión a la torre de hielo cuando caes en una trampa mágica, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Pierdes orientación entre los portales del bosque espejo y terminas sin recompensa, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un grupo de trolls te embosca y te quitan tus pertenencias, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`,
        `El dragón anciano te derrota y te obliga a huir, pierdes *¥${cantidad.toLocaleString()} ${currency}*.`
      ];
      message = pickRandom(failMessages);
    } else {
      const neutralMessages = [
        `Exploras ruinas antiguas y aprendes secretos ocultos.`,
        `Sigues la pista de un espectro pero desaparece entre la niebla.`,
        `Acompañas a una princesa por los desiertos de Thaloria sin contratiempos.`,
        `Recorres un bosque encantado y descubres nuevas rutas.`,
        `Visitas una aldea remota y escuchas relatos de viejas batallas.`
      ];
      message = pickRandom(neutralMessages);
    }
    db.setChatUser(msg.chat, msg.sender, 'lastadventure', Date.now() + 20 * 60 * 1000);
    await sock.sendMessage(msg.chat, { text: `「✿」 ${message}` }, { quoted: msg });
  }
};

function msToTime(duration) {
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const min = minutes < 10 ? '0' + minutes : minutes;
  const sec = seconds < 10 ? '0' + seconds : seconds;
  return min === '00' ? `${sec} segundo${sec > 1 ? 's' : ''}` : `${min} minuto${min > 1 ? 's' : ''}, ${sec} segundo${sec > 1 ? 's' : ''}`;
}

