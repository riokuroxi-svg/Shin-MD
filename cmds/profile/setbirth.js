/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import db from '../../src/services/ginko-db.js';

const MESES_CORTOS = {
  ene: 1, 'ene.': 1,
  feb: 2, 'feb.': 2,
  mar: 3, 'mar.': 3,
  abr: 4, 'abr.': 4,
  may: 5, 'may.': 5,
  jun: 6, 'jun.': 6,
  jul: 7, 'jul.': 7,
  ago: 8, 'ago.': 8,
  sep: 9, 'sep.': 9,
  oct: 10, 'oct.': 10,
  nov: 11, 'nov.': 11,
  dic: 12, 'dic.': 12,
};

const MESES_LARGOS = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const DIAS_SEMANA = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
];

function fechaCalendarioValida(dia, mes, anio) {
  if (!Number.isInteger(dia) || !Number.isInteger(mes) || !Number.isInteger(anio)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCFullYear(anio);
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return d;
}

export function validarFechaNacimiento(text, currentYear, usedPrefix, command) {
  if (typeof text !== 'string') return null;
  let dia = 0;
  let mes = 0;
  let anio = currentYear;

  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (m) {
    dia = Number(m[1]);
    mes = Number(m[2]);
    anio = Number(m[3]);
  } else if ((m = /^(\d{2})\/(\d{2})$/.exec(text))) {
    dia = Number(m[1]);
    mes = Number(m[2]);
  } else if ((m = /^(\d{1,2}) ([a-záéíóú]{3}\.?)$/i.exec(text))) {
    dia = Number(m[1]);
    mes = MESES_CORTOS[m[2].toLowerCase()] || 0;
  } else if ((m = /^(\d{1,2}) ([a-záéíóú]{3}\.?) (\d{4})$/i.exec(text))) {
    dia = Number(m[1]);
    mes = MESES_CORTOS[m[2].toLowerCase()] || 0;
    anio = Number(m[3]);
  } else {
    return null;
  }

  const fecha = fechaCalendarioValida(dia, mes, anio);
  if (!fecha) return null;

  const edad = currentYear - anio;
  if (anio > currentYear) {
    return `✦ El año no puede ser mayor a ${currentYear}. Ejemplo: ${usedPrefix + command} 01/12/${currentYear}`;
  }
  if (edad > 120) {
    return '✦ La fecha establecida es invalida.';
  }
  const diaSemana = DIAS_SEMANA[fecha.getUTCDay()];
  const nombreMes = MESES_LARGOS[mes];
  return `${diaSemana}, ${dia} de ${nombreMes} de ${anio}`;
}

export default {
  command: ['setbirth'],
  category: 'profile',
  description: 'Establecer tu fecha de cumpleaños.',
  run: async ({ msg, args, usedPrefix, command }) => {
    db.getUser(msg.sender);
    const currentYear = new Date().getFullYear();
    const input = args.join(' ');
    if (!input) return msg.reply(`《✧》 Debes ingresar una fecha válida para tu cumpleaños.\n✐ Ejemplos:\n> ${usedPrefix + command} *01/01/2000* (día/mes/año)\n> ${usedPrefix + command} *01/01* (día/mes/año)`);
    const birth = validarFechaNacimiento(input, currentYear, usedPrefix, command);
    if (typeof birth === 'string' && birth.startsWith('✦'))
      return msg.reply(birth);
    if (!birth)
      return msg.reply(`《✧》 Fecha inválida. Usa › *${usedPrefix + command} 01/01/2000*`);
    db.setUser(msg.sender, 'birth', birth);
    return msg.reply(`✎ Se ha establecido tu fecha de nacimiento como: *${birth}*`);
  },
};
