/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  presencia.js — «está pensando…» sin mentir y sin dejar basura
//
//  QUÉ ES EL TRUCO DE LOS OTROS BOTS
//  ────────────────────────────────
//  No hay ninguna API secreta. Son tres piezas de WhatsApp que ya
//  existen y que casi nadie combina:
//
//    1. `sendPresenceUpdate("composing")` → el chat muestra «escribiendo…»
//    2. un mensaje corto («pensando…») que se manda de inmediato
//    3. `delete` de ese mensaje cuando la respuesta está lista
//
//  El resultado es lo que parece «Meta AI está pensando»: un texto que
//  aparece, la presencia activa y el texto final que lo sustituye.
//
//  LO QUE NO HACE: fabricar los certificados de Meta. El formato nativo
//  de progreso exige firmas de verificación de Meta; sin ellas el
//  teléfono muestra «Actualiza WhatsApp». Aquí solo se usan las tres
//  piezas legítimas, que funcionan en cualquier cliente.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

const ACTIVO = () => String(process.env.THINKING || "on").trim() !== "off";

/**
 * Mantiene «escribiendo…» mientras se trabaja.
 * WhatsApp caduca la presencia a los ~10 s, así que se refresca.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {{cadaMs?:number}} [op]
 * @returns {() => Promise<void>} función para parar
 */
export function mantenerEscribiendo(sock, jid, { cadaMs = 8000 } = {}) {
  let vivo = true;
  const tick = () => {
    if (!vivo) return;
    sock.sendPresenceUpdate("composing", jid).catch(() => {});
  };
  tick();
  const timer = setInterval(tick, cadaMs);
  if (typeof timer.unref === "function") timer.unref();

  return async () => {
    vivo = false;
    clearInterval(timer);
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
      /* si se cayó la conexión, nada que hacer */
    }
  };
}

/**
 * Manda el aviso de «pensando…» y devuelve cómo borrarlo.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} [aviso]
 * @param {object} [cita]
 * @returns {Promise<{mensaje:object|null, borrar:()=>Promise<void>}>}
 */
export async function avisarPensando(sock, jid, aviso, cita = null) {
  const texto = aviso || process.env.THINKING_TEXT || "_pensando…_";
  if (!ACTIVO()) return { mensaje: null, borrar: async () => {} };

  let mensaje = null;
  try {
    mensaje = await sock.sendMessage(jid, { text: texto }, cita ? { quoted: cita } : {});
  } catch (err) {
    log.warn("presencia: no se pudo mandar el aviso (" + (err.message || err) + ")");
  }

  const borrar = async () => {
    if (!mensaje?.key) return;
    try {
      await sock.sendMessage(jid, { delete: mensaje.key });
    } catch {
      /* si ya no existe o la conexión se cayó, no es un error del bot */
    }
  };

  return { mensaje, borrar };
}

/**
 * El envoltorio: aviso → trabajo → borrar aviso → mandar el resultado.
 *
 * Si `trabajo` falla, el aviso se borra igual (nadie ve un «pensando…»
 * colgado para siempre) y el error sube tal cual.
 *
 * @template T
 * @param {object} sock
 * @param {string} jid
 * @param {() => Promise<T>} trabajo
 * @param {{aviso?:string, cita?:object, responder?:(resultado:T)=>Promise<any>}} [op]
 * @returns {Promise<T>}
 */
export async function conAviso(sock, jid, trabajo, { aviso, cita = null, responder } = {}) {
  const parar = mantenerEscribiendo(sock, jid);
  const { borrar } = await avisarPensando(sock, jid, aviso, cita);
  let borrado = false;
  try {
    const resultado = await trabajo();
    await borrar();
    borrado = true;
    if (responder) await responder(resultado);
    return resultado;
  } finally {
    // Si el trabajo reventó (o `responder` falló), el aviso se borra igual:
    // nadie debe quedarse con un «pensando…» colgado para siempre.
    if (!borrado) await borrar();
    await parar();
  }
}

export default { mantenerEscribiendo, avisarPensando, conAviso };
