/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  update.js — `.update`, el único mando de mantenimiento por chat
//
//  QUÉ HACE
//    Trae lo último del repositorio (git), recarga los comandos en
//    caliente y, si hace falta, REINICIA el bot solo. Todo desde
//    WhatsApp, sin abrir una terminal.
//
//    .update              → hace todo (traer + recargar)
//    .update listar       → qué ha cambiado y en qué commit está
//    .update deshacer     → vuelve al commit de antes de la última vez
//
//  POR QUÉ SOLO EL DUEÑO
//    Porque ejecuta git y reinicia el proceso. Un comando así en manos
//    de un desconocido es un botón de apagado. `isOwner: true` ya lo
//    protege; además la rama de reinicio se niega si no está vigilado
//    (sin supervisor, matar el proceso deja el bot muerto y sin quien
//    lo levante).
//
//  CÓMO VUELVE ATRÁS
//    Antes de tocar nada se apunta el commit actual. `deshacer` hace
//    git reset --hard a ese commit. Es un solo nivel, a propósito: una
//    pila de deshaceres es una forma elegante de acabar en la rama
//    equivocada sin enterarse.
// ═══════════════════════════════════════════════════════════════════
import log from "#logger";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..", "..");
const ARCHIVO_VUELTA = path.join(RAIZ, "Sessions", ".update-vuelta");

/**
 * Ejecuta una orden y devuelve la salida, sin lanzar.
 *
 * @param {string} orden
 * @param {string} [cwd]
 * @returns {Promise<{ok:boolean, salida:string, error:string}>}
 */
function correr(orden, cwd = RAIZ) {
  return new Promise((listo) => {
    exec(orden, { cwd, timeout: 120_000 }, (error, stdout, stderr) => {
      listo({ ok: !error, salida: String(stdout || "").trim(), error: String(stderr || "").trim() });
    });
  });
}

/** El commit en el que estamos ahora ("" si no es un repo). */
async function commitActual() {
  const r = await correr("git rev-parse --short HEAD");
  return r.ok ? r.salida : "";
}

/** El commit guardado antes de la última actualización. */
function commitDeVuelta() {
  try {
    return fs.readFileSync(ARCHIVO_VUELTA, "utf8").trim();
  } catch {
    return "";
  }
}

/** Apunta el commit para poder deshacer. */
function guardarVuelta(sha) {
  try {
    fs.mkdirSync(path.dirname(ARCHIVO_VUELTA), { recursive: true });
    fs.writeFileSync(ARCHIVO_VUELTA, sha + "\n");
    return true;
  } catch (err) {
    log.warn("update: no pude apuntar el commit de vuelta (" + (err.message || err) + ")");
    return false;
  }
}

/**
 * ¿Hay un supervisor que nos levante si el proceso se cae? Sin él, un
 * reinicio dejaba el bot apagado y sin nadie que lo prendiera.
 * @returns {boolean}
 */
export function hayQuienNosLevante() {
  return process.env.SHIN_VIGILADO === "1";
}

/**
 * Pide al supervisor que reinicie. Si no hay supervisor, se recarga en
 * caliente y se dice que hace falta reiniciar a mano.
 *
 * @param {function} recargar  la recarga en caliente del router
 * @returns {Promise<"reinicio"|"recarga">}
 */
export async function volverAArrancar(recargar) {
  if (hayQuienNosLevante() && typeof process.send === "function") {
    // Un respiro para que el mensaje de WhatsApp salga antes de morir.
    setTimeout(() => {
      try { process.send("restart"); } catch {
        process.kill(process.pid, "SIGTERM");
      }
    }, 1500);
    return "reinicio";
  }
  if (typeof recargar === "function") await recargar();
  return "recarga";
}

/** Recarga los comandos sin reiniciar (delegado del router). */
async function recargaEnCaliente() {
  try {
    const router = globalThis.__shinRouter;
    if (router?.reload) {
      await router.reload();
      return true;
    }
  } catch (err) {
    log.warn("update: recarga en caliente falló (" + (err.message || err) + ")");
  }
  return false;
}

export default {
  command: ["update", "actualizar"],
  category: "owner",
  description: "Trae lo último del repositorio y reinicia si hace falta.",
  usage: ".update [listar|deshacer]",
  isOwner: true,
  run: async ({ msg, sock, text }) => {
    const chat = msg.key.remoteJid;
    const responder = (t) => sock.sendMessage(chat, { text: t }, { quoted: msg });
    const accion = String(text || "").trim().toLowerCase();

    // ── listar: qué hay y dónde estamos ───────────────────────────
    if (["listar", "list", "estado"].includes(accion)) {
      await responder("🔎 *Mirando el repositorio…*");
      const aqui = await commitActual();
      const rama = await correr("git rev-parse --abbrev-ref HEAD");
      const traer = await correr("git fetch --quiet origin");
      if (!traer.ok) {
        return responder(`❌ No pude hablar con el repositorio.\n\n> ${traer.error.slice(0, 300)}`);
      }
      const detras = await correr("git rev-list --count HEAD..@{u}");
      const cambios = await correr("git log --oneline --no-decorate HEAD..@{u}");
      const vuelta = commitDeVuelta();

      let res = "📋 *Estado de la instalación*\n\n";
      res += `› Rama: *${rama.salida || "?"}*\n`;
      res += `› Commit: *${aqui || "?"}*\n`;
      if (detras.salida === "0") {
        res += "› Novedades: *ninguna, estás al día* ✅\n";
      } else {
        res += `› Novedades: *${detras.salida} commit(s) por detrás* ⬆️\n\n`;
        res += "```\n" + cambios.salida.split("\n").slice(0, 10).join("\n") + "\n```\n";
      }
      if (vuelta) res += `\n↩️ Se puede volver a *${vuelta}* con \`.update deshacer\``;
      return responder(res);
    }

    // ── deshacer: volver al commit de antes ───────────────────────
    if (["deshacer", "undo", "revertir"].includes(accion)) {
      const vuelta = commitDeVuelta();
      if (!vuelta) {
        return responder("🤷 No hay nada que deshacer: no se ha actualizado desde que arrancó.");
      }
      await responder(`↩️ *Volviendo a ${vuelta}…*`);
      const r = await correr(`git reset --hard ${vuelta}`);
      if (!r.ok) {
        return responder(`❌ Git no me dejó volver.\n\n> ${r.error.slice(0, 300)}`);
      }
      try { fs.unlinkSync(ARCHIVO_VUELTA); } catch {}
      const como = await volverAArrancar(recargaEnCaliente);
      return responder(
        `✅ *Vuelta hecha a ${vuelta}*\n\n` +
        (como === "reinicio"
          ? "🔄 El bot se reinicia solo en un momento."
          : "♻️ Comandos recargados. *Reinicia el bot* para que el cambio se note del todo."),
      );
    }

    // ── normal: traer y recargar ──────────────────────────────────
    await responder("⬆️ *Buscando actualizaciones…*");

    const antes = await commitActual();
    if (!antes) {
      return responder("❌ Esta instalación no es un repositorio git, no hay de dónde traer nada.");
    }

    const rama = await correr("git rev-parse --abbrev-ref HEAD");
    const traer = await correr(`git pull --ff-only origin ${rama.salida || "main"}`);
    if (!traer.ok && !traer.salida.includes("Already up to date")) {
      return responder(
        "❌ *No pude actualizar*\n\n" +
        "> " + (traer.error || traer.salida).slice(0, 400) + "\n\n" +
        "Si hay cambios tuyos sin guardar, `git stash` los aparta y luego `.update` vuelve a intentarlo.",
      );
    }

    const despues = await commitActual();
    const alDia = despues === antes && /already up to date/i.test(traer.salida);

    if (alDia) {
      const recargado = await recargaEnCaliente();
      return responder(
        "ꕥ *Ya estabas al día* ✅\n\n" +
        `› Commit: *${despues}*\n` +
        (recargado ? "› Comandos recargados sin reiniciar." : "› No hizo falta recargar nada."),
      );
    }

    // Cambió algo: se apunta de dónde venimos y se reinicia de verdad,
    // porque recargar en caliente NO basta si cambiaron dependencias,
    // el arranque o el propio parche de Baileys.
    guardarVuelta(antes);
    const resumen = (traer.salida || "").slice(0, 800);
    const como = await volverAArrancar(recargaEnCaliente);

    return responder(
      "✅ *Actualizado* 🎉\n\n" +
      `› Antes: *${antes}*\n` +
      `› Ahora: *${despues}*\n\n` +
      (resumen ? "```\n" + resumen + "\n```\n\n" : "") +
      (como === "reinicio"
        ? "🔄 El bot se reinicia solo en un momento."
        : "♻️ Comandos recargados. *Reinicia el bot* para aplicar el resto.") +
      `\n\n↩️ Si algo sale mal: \`.update deshacer\` vuelve a *${antes}*.`,
    );
  },
};
