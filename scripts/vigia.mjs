/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  vigia.mjs — deja el bot levantado sin que tengas que hacerlo tú
//
//  Arranca `index.js` como hijo con canal IPC y lo vuelve a levantar:
//    · cuando el comando .restart pide reiniciar (process.send("restart"))
//    · cuando el proceso muere solo (caída, OOM, cierre raro)
//
//  Lo que NO hace: insistir eternamente. Si el bot muere 5 veces en menos
//  de dos minutos, se para y lo dice: eso es un fallo de verdad, no algo
//  que se arregle reiniciando más rápido.
//
//  Este es el modo SIN interfaz: para systemd, pm2, un VPS o `nohup`.
//  Si quieres ver el panel mientras corre, usa `npm start`.
//
//  Uso:
//    npm run vigia              (arranca y vigila)
//    npm run vigia -- --code    (lo mismo, con código de vinculación)
//
//  Para pararlo: Ctrl+C. El hijo recibe SIGTERM y cierra limpio.
// ═══════════════════════════════════════════════════════════════════

import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearSupervisor, VENTANA_MS } from "./supervisor.mjs";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARGS = process.argv.slice(2);

const hora = () => new Date().toTimeString().slice(0, 8);
const decir = (texto) => console.log(`\x1b[90m[${hora()}]\x1b[0m ${texto}`);

const supervisor = crearSupervisor({
  raiz: RAIZ,
  argumentos: ARGS,
  ganchos: {
    pidioReiniciar: ({ reinicios }) => decir(`el bot pidió reiniciar (reinicio nº ${reinicios})`),
    reiniciando: () => decir("levantando otra vez…"),
    cayo: ({ code, signal, esperaMs }) => {
      const como = signal ? `con la señal ${signal}` : `con código ${code}`;
      decir(`se cayó ${como}; vuelvo a levantarlo en ${(esperaMs / 1000).toFixed(1)}s`);
    },
    rendido: ({ caidas }) => {
      console.error(
        `\n  ✗ El bot se cayó ${caidas} veces en ${VENTANA_MS / 1000}s.` +
          `\n  Eso no se arregla reiniciando: mira el error de arriba.` +
          `\n  Dejo de intentarlo; arráncalo tú cuando esté resuelto.\n`,
      );
    },
    parado: ({ motivo }) => {
      if (motivo === "parado") decir("vigía detenido");
    },
  },
});

// El hijo hereda la terminal; si quieres ver lo que imprime, se ve aquí.
// (En la consola, en cambio, se captura y se dibuja dentro del panel.)
for (const senal of ["SIGINT", "SIGTERM"]) {
  process.on(senal, () => {
    if (!supervisor.parar()) {
      decir("parando… (Ctrl+C otra vez para forzar)");
      process.exit(130);
    }
    decir("parando… (Ctrl+C otra vez para forzar)");
  });
}

decir("vigía activo: si el bot se cae o pide reiniciar, lo levanto solo");
supervisor.ejecutar().then((final) => {
  // "rendido" ya se explicó; "parado" lo dijo el gancho.
  process.exitCode = final === "rendido" ? 1 : 0;
});
