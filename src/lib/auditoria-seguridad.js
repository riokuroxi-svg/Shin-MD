/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  auditoria-seguridad.js — CAPA 5: la evidencia
//
//  Un detector que no deja rastro no sirve para nada: si el bot avisa
//  «cambió algo» y no queda escrito qué, cuándo y con qué resultado, no
//  hay forma de reconstruirlo después.
//
//  Cada comprobación de arranque se apunta aquí, en una línea JSON por
//  evento, en `logs/seguridad-AAAA-MM-DD.jsonl`. Se escribe al final y
//  sin dependencias: si el disco falla, la seguridad no tumba el bot
//  (devuelve null y sigue).
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 4 * 1024 * 1024; // más que eso en un día es un bucle: se deja de escribir

export function rutaDeRegistro(raiz = process.cwd(), fecha = new Date()) {
  const dia = fecha.toISOString().slice(0, 10);
  return path.join(raiz, "logs", "seguridad-" + dia + ".jsonl");
}

/**
 * Apunta un evento de seguridad.
 *
 * @param {object} evento  lo que pasó (estado, resumen, hallazgos…)
 * @param {{raiz?:string, fecha?:Date}} [opciones]
 * @returns {string|null} ruta escrita, o null si no se pudo
 */
export function registrar(evento, { raiz = process.cwd(), fecha = new Date() } = {}) {
  try {
    const archivo = rutaDeRegistro(raiz, fecha);
    try {
      const st = fs.statSync(archivo);
      if (st.size > MAX_BYTES) return null;
    } catch {
      /* primera línea del día */
    }
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    const linea = JSON.stringify({ ts: new Date(fecha).toISOString(), ...evento });
    fs.appendFileSync(archivo, linea + "\n");
    return archivo;
  } catch {
    return null; // la auditoría nunca puede tumbar el bot
  }
}

/**
 * Las últimas N líneas del registro de un día (o del más reciente).
 * @param {{raiz?:string, n?:number, fecha?:Date}} [opciones]
 */
export function ultimos({ raiz = process.cwd(), n = 20, fecha = new Date() } = {}) {
  let archivo = rutaDeRegistro(raiz, fecha);
  if (!fs.existsSync(archivo)) {
    // Sin eventos hoy: se busca el más nuevo que haya.
    try {
      const dir = path.join(raiz, "logs");
      const candidatos = fs
        .readdirSync(dir)
        .filter((f) => /^seguridad-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort();
      if (!candidatos.length) return [];
      archivo = path.join(dir, candidatos[candidatos.length - 1]);
    } catch {
      return [];
    }
  }
  try {
    const lineas = fs.readFileSync(archivo, "utf8").trim().split("\n").filter(Boolean);
    return lineas.slice(-n).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { crudo: l.slice(0, 200) };
      }
    });
  } catch {
    return [];
  }
}

export default { registrar, ultimos, rutaDeRegistro };
