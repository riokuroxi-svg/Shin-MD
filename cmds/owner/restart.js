/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  restart.js — Reiniciar, también cuando nadie me está vigilando
//
//  Había dos maneras de que este comando te dejara el bot muerto:
//
//   · con `npm start` no hay supervisor: `process.send` no existe, se
//     hacía `process.exit(0)` y el bot se apagaba para siempre;
//   · si algo fallaba al arrancar, tampoco volvía.
//
//  Ahora, cuando no hay supervisor, el comando deja al vigía arrancado
//  en la misma terminal y se aparta. El vigía levanta el bot otra vez y
//  desde ese momento los siguientes .restart son instantáneos (IPC).
// ═══════════════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VIGIA = path.join(RAIZ, "scripts", "vigia.mjs");

/** ¿Quién me está sosteniendo? Para poder probarlo sin arrancar nada. */
export function decidirReinicio({ haySupervisor, hayVigia }) {
  if (haySupervisor) return "ipc";
  if (hayVigia) return "relevo";
  return "sin-salida";
}

/**
 * Deja el vigía corriendo en esta misma terminal y devuelve su pid.
 * No usa `detached`: así Ctrl+C sigue parándolo todo, como siempre.
 * Devuelve 0 si no se pudo arrancar, y entonces NO hay que salir.
 */
function pasarleElMando() {
  const hijo = spawn(process.execPath, [VIGIA, ...process.argv.slice(2)], {
    cwd: RAIZ,
    stdio: "inherit",
    env: { ...process.env, SHIN_RELEVO: "1" },
  });
  // Sin pid no hubo arranque de verdad: mejor quedarse vivo que morirse.
  if (!hijo.pid) return 0;
  hijo.unref();
  return hijo.pid;
}

export default {
  command: ["restart"],
  category: "owner",
  description: "Reiniciar el bot. Si no hay supervisor, lo levanta solo.",
  isOwner: true,
  run: async ({ msg, sock }) => {
    const camino = decidirReinicio({
      haySupervisor: typeof process.send === "function",
      hayVigia: fs.existsSync(VIGIA),
    });

    if (camino === "sin-salida") {
      // Instalación vieja, sin scripts/vigia.mjs: no se toca nada.
      return sock.reply(
        msg.chat,
        "「✧」 No puedo reiniciarme en esta instalación.\n" +
          "> Falta `scripts/vigia.mjs`, que llega a partir de la 3.2.8.\n" +
          "> Actualiza con `bash install.sh --update` y vuelve a intentarlo.",
        msg,
      );
    }

    await sock.reply(msg.chat, "「✧」 Reiniciando...\n> *Espere un momento...*", msg);

    setTimeout(() => {
      if (camino === "ipc") {
        process.send("restart");
        return;
      }
      // Sin supervisor: me relevo y me voy. Si el vigía no arranca,
      // seguir vivo es mejor que quedarse sin bot.
      if (!pasarleElMando()) return;
      process.exit(0);
    }, 3000);
  },
};
