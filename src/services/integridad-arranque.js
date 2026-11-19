/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  integridad-arranque.js — la comprobación de cadena de suministro,
//  conectada al arranque real del bot.
//
//  · `--sellar`   sella el árbol actual y sale (para después de instalar).
//  · al arrancar compara y AVISA (o aborta con SHIN_INTEGRIDAD=estricto).
//  · el resultado se guarda en globalThis.__shinIntegridad para que
//    /health lo muestre: un árbol cambiado deja de ser invisible.
//
//  Todo el trabajo pesado vive en #lib/integridad; esto solo lo enchufa.
// ═══════════════════════════════════════════════════════════════════

import path from "node:path";
import { fileURLToPath } from "node:url";
import log from "#logger";
import { sellar, revisarAlArrancar } from "#lib/integridad";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Ejecuta el paso de integridad si el proceso lo pidió.
 * Devuelve true si el arranque debe continuar.
 * @param {string[]} args argumentos de línea de comandos (process.argv.slice(2))
 */
export function pasoDeIntegridad(args = process.argv.slice(2)) {
  const quiereSellar = args.includes("--sellar") || args.includes("--seal");

  if (quiereSellar) {
    const h = sellar({ raiz: RAIZ });
    log.success("Integridad: sellados " + h.paquetes + " archivos de node_modules.");
    log.info("Guarda node_modules/.shin-integridad.json fuera del control de versiones.");
    globalThis.__shinIntegridad = { estado: "sellado", paquetes: h.paquetes };
    return false; // trabajo hecho: no hay que arrancar el bot
  }

  const r = revisarAlArrancar({ raiz: RAIZ });
  globalThis.__shinIntegridad = r.detalle;

  if (r.estado === "sin-sello") {
    log.gray("Integridad: sin sello todavía (node index.js --sellar para activarla).");
  } else if (r.estado === "igual") {
    log.success("Integridad: " + r.detalle.paquetes + " archivos de node_modules coinciden con el sello.");
  } else {
    for (const linea of r.mensaje.split("\n")) {
      if (!linea) { log.warn(""); continue; }
      log.warn("Integridad: " + linea);
    }
    if (!r.ok) {
      log.error("Integridad: SHIN_INTEGRIDAD=estricto y el árbol cambió — no se arranca.");
      log.error("Revisa el cambio; si es tuyo:  node index.js --sellar   (o npm ci para volver al lock)");
      return false;
    }
  }
  return true;
}

export default pasoDeIntegridad;
