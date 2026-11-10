/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  update.js — traer el código de GitHub y recargar los comandos
// ═══════════════════════════════════════════════════════════════════
import log from "#logger";
import path from "path";
import { fileURLToPath } from "url";
import { actualizar, confirmacionVigente } from "../../extras/actualizar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..", "..");

// Quién pidió confirmación y cuándo (se olvida si se reinicia).
const pedidos = new Map();

export default {
  command: ["fix", "update"],
  category: "owner",
  description: "Actualizar el código desde GitHub y recargar los comandos.",
  isOwner: true,
  run: async ({ msg, sock }) => {
    const jid = msg.key?.remoteJid || msg.chat;
    const prefijo = msg.usedPrefix || ".";
    const comando = msg.command || "fix";
    const ahora = Date.now();

    const confirmado = confirmacionVigente(pedidos.get(jid), { ahora });

    let r;
    try {
      r = await actualizar({ raiz: RAIZ, prefijo, comando, confirmado, ahora });
    } catch (error) {
      await sock.sendMessage(
        jid,
        { text: `❌ Error inesperado: ${error.message}\n\n> El código no se ha tocado.` },
        { quoted: msg }
      );
      return;
    }

    if (r.estado === "espera") {
      pedidos.set(jid, ahora);
      await sock.sendMessage(jid, { text: String(r.texto || "").trim() }, { quoted: msg });
      return;
    }

    pedidos.delete(jid);

    if (r.estado === "error") {
      await sock.sendMessage(jid, { text: String(r.texto || "").trim() }, { quoted: msg });
      return;
    }

    let recarga = "sin cambios pendientes";
    if (r.estado === "actualizado") {
      try {
        const router = /** @type {any} */ (globalThis).__shinRouter;
        if (router && typeof router.reload === "function") {
          await router.reload();
          recarga = `recargados (${router.countUnique?.() || "OK"})`;
        } else {
          recarga = "router no disponible (reinicia el bot)";
        }
      } catch (err) {
        recarga = "⚠️ no pude recargar (reinicia el bot)";
        log.error("No pude recargar los comandos tras actualizar:", err);
      }
    }

    const avisoReinicio = r.necesitaReinicio
      ? `⚠️ Cambió el núcleo (${r.cambiosNucleo.slice(0, 4).join(", ")}) — ejecuta *${prefijo}restart*.`
      : `♻️ Si algo se ve raro, reinicia con *${prefijo}restart*.`;

    const resumen = [
      "✅ *Actualizado*",
      `> ${String(r.texto || "").trim()}`,
      `> Base de datos: ${r.avisoDatos || "intacta"}`,
      `> Comandos: ${recarga}`,
      "",
      avisoReinicio,
    ].join("\n");

    await sock.sendMessage(jid, { text: resumen }, { quoted: msg });
  },
};
