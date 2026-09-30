/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  progress.js — Un solo mensaje que se va editando
//
//  POR QUÉ ES GRATIS (lo comprobé en el código del propio bot):
//  src/core/socket.js → esEnvioLigero() marca react / delete / edit
//  como envíos que NO gastan la cuota diaria del warm-up. Así que
//  editar un mensaje cuesta 0 del tope del día; solo pasa por la cola
//  anti-ban con su ritmo normal.
//
//  ANTES (.play):  "⏳ Descargando…"  →  se BORRA  →  llega el audio
//                  El usuario ve un mensaje que aparece y desaparece.
//  AHORA:          "🔎 Buscando…"  →  se edita a  "⬇️ Bajando «tema»"
//                  →  llega el audio  →  el mensaje queda de recibo.
//
//  Mismo gasto de cuota (1 mensaje), sin parpadeo y con la información
//  final a la vista.
//
//  REGLAS DE ESTE MÓDULO:
//   · Nunca lanza. Si algo falla, el comando sigue su curso.
//   · Nunca edita dos veces seguidas más rápido que `minGapMs`: una
//     descarga que reporta 60 veces no convierte la cola en un embudo.
//   · Si el mensaje inicial no se pudo enviar, todo lo demás es un
//     no-op silencioso.
// ═══════════════════════════════════════════════════════════════════

const LLENO = "▰";
const VACIO = "▱";

/**
 * Barra de progreso en texto. Pura y exportada para poder probarla.
 * @param {number} pct 0–100
 * @param {number} [ancho=10] número de bloques
 * @returns {string} "▰▰▰▱▱▱▱▱▱▱ 30%"
 */
export function renderBar(pct, ancho = 10) {
  const n = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const total = Number.isFinite(ancho) && ancho > 0 ? Math.trunc(ancho) : 10;
  const llenos = Math.round((n / 100) * total);
  return LLENO.repeat(llenos) + VACIO.repeat(total - llenos) + " " + Math.round(n) + "%";
}

/**
 * Cuerpo del mensaje de progreso. Pura.
 * @param {object} o
 * @param {string} o.title   Línea de arriba (lo que se está haciendo).
 * @param {string} [o.detail] Línea de abajo, más pequeña.
 * @param {number} [o.pct]   Si se pasa, dibuja la barra.
 */
export function renderProgress({ title, detail = "", pct = null } = {}) {
  const lineas = [`*${String(title || "Trabajando…").trim()}*`];
  if (pct !== null && pct !== undefined) lineas.push(renderBar(pct));
  if (detail) lineas.push(`> ${detail}`);
  return lineas.join("\n");
}

/**
 * Crea el mensaje que se irá editando.
 *
 * @param {object} sock   Socket de baileys.
 * @param {string} jid    Chat destino.
 * @param {object} [opts]
 * @param {object} [opts.quoted]      Mensaje a citar en el primer envío.
 * @param {number} [opts.minGapMs=1500] Tiempo mínimo entre ediciones.
 * @returns {{start:Function, update:Function, finish:Function, fail:Function, key:Function, alive:Function}}
 */
export function createProgress(sock, jid, { quoted = null, minGapMs = 1500 } = {}) {
  let key = null;
  let ultimo = 0;
  let ultimoTexto = "";
  let cerrado = false;

  async function editar(texto, forzar) {
    if (!key || cerrado) return false;
    if (texto === ultimoTexto) return false;
    const ahora = Date.now();
    if (!forzar && ahora - ultimo < minGapMs) return false;
    ultimo = ahora;
    ultimoTexto = texto;
    try {
      await sock.sendMessage(jid, { text: texto, edit: key });
      return true;
    } catch {
      return false; // el mensaje pudo borrarse o caducar: no es fatal
    }
  }

  return {
    /** Envía el primer mensaje. Es el único que gasta cuota. */
    async start(datos) {
      const texto = typeof datos === "string" ? datos : renderProgress(datos);
      ultimoTexto = texto;
      ultimo = Date.now();
      try {
        const r = await sock.sendMessage(jid, { text: texto }, quoted ? { quoted } : undefined);
        key = r?.key || null;
      } catch {
        key = null;
      }
      return key;
    },

    /** Edita el mensaje. Se salta la edición si va demasiado rápido. */
    async update(datos) {
      return editar(typeof datos === "string" ? datos : renderProgress(datos), false);
    },

    /** Edición final: siempre se aplica y cierra el progreso. */
    async finish(datos) {
      const ok = await editar(typeof datos === "string" ? datos : renderProgress(datos), true);
      cerrado = true;
      return ok;
    },

    /** Cierre por error, con el mismo formato de aviso del resto del bot. */
    async fail(motivo) {
      const texto = `❌ *No se pudo completar.*\n> ${String(motivo || "Inténtalo de nuevo en un momento.").slice(0, 160)}`;
      const ok = await editar(texto, true);
      cerrado = true;
      return ok;
    },

    /** Key del mensaje (por si el comando quiere borrarlo o citarlo). */
    key() { return key; },

    /** ¿Se envió el mensaje inicial? */
    alive() { return !!key && !cerrado; },
  };
}

export default { createProgress, renderProgress, renderBar };
