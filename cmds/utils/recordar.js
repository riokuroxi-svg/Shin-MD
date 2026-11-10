/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
/**
 * .recordar <minutos>|<mensaje>  →  programa un recordatorio en el mismo chat.
 */
if (!global.ginkoRecordatorios) global.ginkoRecordatorios = [];

import { sendInteractive, ctaReminder, quickReply } from "#interactive";

export default {
  command: ['recordar', 'recordatorio', 'reminder', 'alarma'],
  category: 'utils',
  description: 'Programar un recordatorio en X minutos.',
  run: async ({ msg, sock, usedPrefix, text }) => {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return msg.reply(
        `《✧》 Programa un recordatorio.\n`
        + `> Formato: ${usedPrefix}recordar <minutos>|<mensaje>\n`
        + `> Ejemplo: ${usedPrefix}recordar 5|tomar agua`
      );
    }

    if (/^(lista|list|ver)$/i.test(trimmed)) {
      const activos = global.ginkoRecordatorios.filter(r => r.jid === msg.chat);
      if (!activos.length) {
        return msg.reply('📋 No hay recordatorios activos en este chat.');
      }
      const lista = activos.map((r, i) => `${i + 1}. *${r.mins} min* — ${r.msg}`).join('\n');
      return msg.reply(`📋 *Recordatorios activos (${activos.length})*\n\n${lista}`);
    }

    const sep = trimmed.indexOf('|');
    if (sep === -1) {
      return msg.reply(`《✧》 Separa los minutos del mensaje con | (pleca).\n> Ej: ${usedPrefix}recordar 5|tomar agua`);
    }
    const minsRaw = trimmed.slice(0, sep).trim();
    const mensaje = trimmed.slice(sep + 1).trim();
    const mins = parseInt(minsRaw, 10);
    if (!Number.isFinite(mins) || mins < 1) {
      return msg.reply(`《✧》 Los minutos deben ser un *número mayor a 0*.`);
    }
    if (!mensaje) {
      return msg.reply(`《✧》 Falta el mensaje del recordatorio.`);
    }
    const jid = msg.chat;
    const delay = Math.min(mins, 60 * 24) * 60000;
    const timer = setTimeout(async () => {
      try {
        await sock.sendMessage(jid, {
          text: `⏰ *Recordatorio*\n\n» ${mensaje}\n\n_(programado hace ${mins} min)_`,
        });
      } catch {}
      global.ginkoRecordatorios = global.ginkoRecordatorios.filter(r => r.timer !== timer);
    }, delay);
    timer.unref?.();
    global.ginkoRecordatorios.push({ timer, jid, msg: mensaje, mins });

    const cuerpo = `✅ *Recordatorio programado* para dentro de *${mins} min*.\n\n📝 » ${mensaje}`;
    await sendInteractive(sock, jid, {
      body: cuerpo,
      footer: "Si el bot se reinicia, el recordatorio de WhatsApp sigue en pie.",
      buttons: [
        ctaReminder("⏰ Que me avise WhatsApp", "recordatorio"),
        quickReply("📋 Mis recordatorios", "recordar lista"),
      ],
      quoted: msg.full || msg,
      fallbackText: cuerpo,
    });
  },
};
