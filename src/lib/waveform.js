/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  waveform.js — Dibujar la onda de las notas de voz
//
//  HALLAZGO
//  --------
//  La barrita de sonido que WhatsApp pinta encima de una nota de voz
//  NO la calcula el teléfono que la recibe: viaja dentro del mensaje.
//  Son exactamente 64 bytes (0-100) en audioMessage.waveform, y los
//  pone QUIEN ENVÍA. Baileys los rellena analizando el audio
//  (Utils/messages-media.js → getAudioWaveform), pero nada obliga a
//  que sean los reales.
//
//  O sea: la onda es un lienzo de 64 píxeles de alto variable que el
//  bot controla. Ninguna otra librería de bots lo usa como dibujo.
//
//  Este archivo solo hace matemáticas: entra un patrón, salen 64
//  bytes. Sin dependencias, sin ffmpeg, sin red. Quien los mete en el
//  mensaje es #lib/voice-art.
// ═══════════════════════════════════════════════════════════════════

/** WhatsApp espera siempre 64 muestras. Ni una más. */
export const MUESTRAS = 64;

/** Valor máximo por muestra (el cliente recorta por encima de 100). */
export const MAX_ALTURA = 100;

export const PATRONES = Object.freeze([
  "onda",        // senoidal suave, como un audio normal bien grabado
  "latido",      // dos picos juntos y silencio: ba-bump
  "ecualizador", // barras alternas, estética de reproductor
  "montana",     // sube, cima, baja
  "rafaga",      // arranque fuerte que se apaga
  "reloj",       // picos regulares separados
  "firma",       // única por texto (cada canción, su onda)
]);

/** Recorta a entero 0-100. */
function clamp(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_ALTURA, Math.round(v)));
}

/** Hash FNV-1a de 32 bits: mismo texto → misma onda, siempre. */
export function hashTexto(texto = "") {
  let h = 0x811c9dc5;
  const s = String(texto);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIBUJOS = {
  onda: (i) => 30 + 45 * Math.abs(Math.sin((i / MUESTRAS) * Math.PI * 4)),

  latido: (i) => {
    const p = i % 16;
    if (p === 0) return 95;
    if (p === 1) return 70;
    if (p === 3) return 55;
    if (p === 4) return 30;
    return 8 + (p % 2) * 4;
  },

  ecualizador: (i) => {
    const base = [20, 65, 35, 90, 45, 75, 25, 55];
    return base[i % base.length];
  },

  montana: (i) => {
    const mitad = MUESTRAS / 2;
    const d = i < mitad ? i / mitad : (MUESTRAS - i) / mitad;
    return 10 + 85 * d;
  },

  rafaga: (i) => 95 * Math.exp(-i / 18) + 6,

  reloj: (i) => (i % 8 === 0 ? 88 : i % 4 === 0 ? 40 : 10),
};

/**
 * Dibuja una onda.
 *
 * @param {string} patron  uno de PATRONES (por defecto "onda")
 * @param {object} [op]
 * @param {string|number} [op.semilla]  solo para el patrón "firma"
 * @param {number} [op.intensidad=1]    0-1.5, escala la altura
 * @returns {Uint8Array} exactamente 64 bytes
 */
export function drawWaveform(patron = "onda", op = {}) {
  const intensidad = Number.isFinite(op.intensidad) ? op.intensidad : 1;
  const salida = new Uint8Array(MUESTRAS);

  if (patron === "firma") {
    // Onda irrepetible por texto: mezcla ruido determinista con una
    // envolvente suave para que parezca audio de verdad y no estática.
    const semilla = typeof op.semilla === "number"
      ? op.semilla >>> 0
      : hashTexto(op.semilla ?? "shin-md");
    const azar = rng(semilla);
    for (let i = 0; i < MUESTRAS; i++) {
      const envolvente = Math.sin((i / (MUESTRAS - 1)) * Math.PI); // 0→1→0
      const ruido = 0.45 + azar() * 0.55;
      salida[i] = clamp(MAX_ALTURA * envolvente * ruido * intensidad);
    }
    return salida;
  }

  const dibujo = DIBUJOS[patron] || DIBUJOS.onda;
  for (let i = 0; i < MUESTRAS; i++) salida[i] = clamp(dibujo(i) * intensidad);
  return salida;
}

/** Atajo: la onda propia de un texto (título de canción, nombre, etc.). */
export function waveformFromText(texto, op = {}) {
  return drawWaveform("firma", { ...op, semilla: texto });
}

/** ¿Estos bytes sirven como waveform para WhatsApp? */
export function esWaveformValida(bytes) {
  if (!bytes || typeof bytes.length !== "number") return false;
  if (bytes.length !== MUESTRAS) return false;
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    if (!Number.isInteger(v) || v < 0 || v > MAX_ALTURA) return false;
  }
  return true;
}

/**
 * Vista previa en texto (para pruebas, logs y maquetas).
 * No se envía a WhatsApp: es para ver qué estamos dibujando.
 */
export function renderAsciiWave(bytes, alto = 6) {
  const barras = "▁▂▃▄▅▆▇█";
  let salida = "";
  for (let i = 0; i < bytes.length; i++) {
    const idx = Math.min(barras.length - 1, Math.floor((bytes[i] / MAX_ALTURA) * barras.length));
    salida += barras[Math.max(0, idx)];
  }
  return alto > 0 ? salida : salida;
}
