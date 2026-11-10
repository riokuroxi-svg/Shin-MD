/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { pickRandom } from "#lib/random";
import fetch from "node-fetch";

export default {
  command: ['ppcp', 'ppcouple'],
  category: 'anime',
  description: 'Generar imágenes para amistades o parejas.',
  run: async ({ msg, sock, usedPrefix, command }) => {
    try {
      await msg.react('🕒');
      const res = await fetch('https://raw.githubusercontent.com/ShirokamiRyzen/WAbot-DB/main/fitur_db/ppcp.json', { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cita = Array.isArray(data) ? pickRandom(data) : null;
      if (!cita?.cowo || !cita?.cewe) throw new Error('No se encontraron imágenes disponibles.');
      const resCowo = await fetch(cita.cowo, { signal: AbortSignal.timeout(15000) });
      if (!resCowo.ok) throw new Error(`HTTP ${resCowo.status}`);
      const cowi = Buffer.from(await resCowo.arrayBuffer());
      await sock.sendFile(msg.chat, cowi, 'cowo.jpg', '*Masculino* ♂', msg);
      const resCewe = await fetch(cita.cewe, { signal: AbortSignal.timeout(15000) });
      if (!resCewe.ok) throw new Error(`HTTP ${resCewe.status}`);
      const ciwi = Buffer.from(await resCewe.arrayBuffer());
      await sock.sendFile(msg.chat, ciwi, 'cewe.jpg', '*Femenina* ♀', msg);
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      await msg.reply(`> Ocurrió un error inesperado al ejecutar el comando *${usedPrefix + command}*.\n> [Error: *${e.message}*]`);
    }
  },
};
