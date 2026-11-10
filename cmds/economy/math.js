/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { economyGate } from "#lib/economy-guard";
import { botJid } from "#serialize";
import { mismaPersona } from "#lib/lid";
import { randomInt } from "#lib/random";
import db from '../../src/services/ginko-db.js';
global.math = global.math || {};

const limits = { facil: 10, medio: 50, dificil: 90, imposible: 100, imposible2: 160 };
const rewardRanges = { facil: [500, 1000], medio: [1000, 2000], dificil: [2000, 3500], imposible: [3500, 4800], imposible2: [5000, 6500] };

const generateRandomNumber = (max) => Math.floor(Math.random() * max) + 1;
const getOperation = () => ['+', '-', '*', '/'][Math.floor(Math.random() * 4)];

const generarProblema = (dificultad) => {
  const maxLimit = limits[dificultad] || 30;
  let num1 = generateRandomNumber(maxLimit);
  const num2 = generateRandomNumber(maxLimit);
  const operador = getOperation();
  let resultado;
  switch (operador) {
    case '+':
      resultado = num1 + num2;
      break;
    case '-':
      resultado = num1 - num2;
      break;
    case '*':
      resultado = num1 * num2;
      break;
    case '/': {
      const cociente = generateRandomNumber(Math.max(2, Math.floor(maxLimit / 2)));
      num1 = num2 * cociente;
      resultado = cociente;
      break;
    }
  }
  const simbolo = operador === '*' ? '×' : operador === '/' ? '÷' : operador;
  return { problema: `${num1} ${simbolo} ${num2}`, resultado };
};

export default {
  command: ['math', 'mates'],
  category: 'economy',
  description: 'Iniciar un juego de matemáticas.',
  before: async ({ msg, sock }) => {
    if (!msg || msg.isBot || !msg.chat) return;
    const chatId = msg.chat;
    const juego = global.math[chatId];
    if (!juego?.juegoActivo) return;
    const respuestaUsuario = parseFloat(msg.text?.trim());
    if (isNaN(respuestaUsuario)) return;
    const botId = botJid(sock);
    const chat = db.getChat(chatId);
    if (chat?.primaryBot && !mismaPersona(chat.primaryBot, botId)) return;
    const user = db.getChatUser(chatId, msg.sender) || {};
    const respuestaCorrecta = parseFloat(juego.respuesta);
    if (respuestaUsuario === respuestaCorrecta) {
      const [min, max] = rewardRanges[juego.dificultad] || [500, 1000];
      const coinsAleatorio = randomInt(min, max);
      db.setChatUser(chatId, msg.sender, 'coins', (user.coins || 0) + coinsAleatorio);
      clearTimeout(juego.tiempoLimite);
      delete global.math[chatId];
      await sock.reply(chatId, `「❀」Respuesta correcta.\n> *Ganaste ›* ¥${coinsAleatorio.toLocaleString()}`, msg);
    } else {
      juego.intentos += 1;
      if (juego.intentos >= 3) {
        clearTimeout(juego.tiempoLimite);
        delete global.math[chatId];
        await sock.reply(chatId, '「✎」Te quedaste sin intentos. Suerte a la próxima.', msg);
      } else {
        await sock.reply(chatId, `「✎」Respuesta incorrecta, te quedan ${3 - juego.intentos} intentos.`, msg);
      }
    }
    return true;
  },
  run: async ({ msg, sock, args, usedPrefix }) => {
    const chatId = msg.chat;
    const { blocked, message: avisoEconomia } = economyGate(chatId, usedPrefix);
    if (blocked) return msg.reply(avisoEconomia);
    if (global.math[chatId]?.juegoActivo) {
      return sock.reply(chatId, 'ꕥ Ya hay un juego activo. Espera a que termine.', msg);
    }
    const dificultad = args[0]?.toLowerCase();
    if (!limits[dificultad]) {
      return sock.reply(chatId, '「✎」Especifica una dificultad válida: *facil, medio, dificil, imposible, imposible2*', msg);
    }
    const { problema, resultado } = generarProblema(dificultad);
    const entry = {
      juegoActivo: true,
      problema,
      respuesta: resultado.toString(),
      intentos: 0,
      dificultad,
      timeout: Date.now() + 60000,
      problemMessageId: undefined,
      tiempoLimite: null,
    };
    const mathStore = global.math;
    mathStore[chatId] = entry;
    const problemMessage = await sock.reply(chatId, `「✩」Tienes 1 minuto para resolver:\n\n> ✩ *${problema}*\n\n_✐ Responde con el número correcto!_`, msg);
    entry.problemMessageId = problemMessage?.key?.id;
    entry.tiempoLimite = setTimeout(() => {
      if (mathStore[chatId] === entry && entry.juegoActivo) {
        delete mathStore[chatId];
        sock.reply(chatId, `「✿」Tiempo agotado. La respuesta era *${resultado}*.`, msg).catch(() => {});
      }
    }, 60000);
    entry.tiempoLimite.unref?.();
  }
};
