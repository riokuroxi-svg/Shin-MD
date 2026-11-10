/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  update.js — traer el código de GitHub y recargar los comandos
//
//  ANTES: un `git pull` a secas. Si el bot tenía algo a medio hacer —o el
//  dueño había tocado un comando desde WhatsApp con `.subir`— el pull podía
//  pisarlo sin decir nada. Y como `data/shin.db.json` está versionado, un
//  reinicio con el árbol sucio devolvía la base de datos a la del repositorio.
//
//  AHORA: la faena la hace `extras/actualizar.js`, que antes de tocar nada
//  guarda un parche en `tmp/` y pide que el dueño repita el comando en los
//  próximos 5 minutos. Después actualiza, deja la base de datos como estaba y
//  aquí recargamos los comandos para que el cambio se note sin reiniciar.
//
//  Nada de esto cambia el nombre ni la categoría del comando: sigue siendo
//  `.fix` / `.update`, solo dueños.
// ═══════════════════════════════════════════════════════════════════
import log from "#logger";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { actualizar, confirmacionVigente } from "../../extras/actualizar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// La raíz del bot: este archivo vive en cmds/owner/.
const RAIZ = path.resolve(__dirname, "..", "..");

// Quién pidió confirmación y cuándo. En memoria a propósito: si el bot se
// reinicia, la confirmación se olvida y hay que volver a pedirla.
const pedidos = new Map();

async function reloadCommands(dir = path.join(__dirname, "..")) {
  const commandsMap = new Map();
  async function readCommands(folder) {
    const files = fs.readdirSync(folder);
    for (const file of files) {
      const fullPath = path.join(folder, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        await readCommands(fullPath);
      } else if (file.endsWith(".js")) {
        try {
          const { default: cmd } = await import(fullPath + "?update=" + Date.now());
          if (cmd?.command) {
            cmd.command.forEach((c) => {
              commandsMap.set(c.toLowerCase(), cmd);
            });
          }
        } catch (err) {
          log.error(`Error recargando comando ${file}:`, err);
        }
      }
    }
  }
  await readCommands(dir);
  global.comandos = commandsMap;
}

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
      await sock.sendMessage(jid, { text: r.texto }, { quoted: msg });
      return;
    }

    pedidos.delete(jid);

    if (r.estado === "error") {
      await sock.sendMessage(jid, { text: r.texto }, { quoted: msg });
      return;
    }

    let recarga = "recargados";
    try {
      await reloadCommands(path.join(__dirname, ".."));
    } catch (err) {
      recarga = "⚠️ no pude recargar (reinicia el bot)";
      log.error("No pude recargar los comandos tras actualizar:", err);
    }

    await sock.sendMessage(
      jid,
      {
        text:
          `✅ *Actualizado*\n\n` +
          `> ${r.texto}\n` +
          `> Base de datos: ${r.avisoDatos || "intacta"}\n` +
          `> Comandos: ${recarga}\n\n` +
          `♻️ Si algo se ve raro, reinicia con ${prefijo}restart.`,
      },
      { quoted: msg }
    );
  },
};
