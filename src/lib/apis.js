/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  apis.js — Dónde están configuradas las APIs externas de respaldo.
//
//  POR QUÉ EXISTE
//  Diez líneas de cuatro comandos (.instagram, .twitter, .imagen y los
//  .ship/.hug) leían `global.APIs.Ginko.url`. Esa variable se definía en
//  el proyecto del que se portearon los comandos y aquí NUNCA se creó:
//  en cuanto uno de esos comandos se ejecutaba, `global.APIs` era
//  `undefined` y el comando moría con un TypeError. No era «depende de
//  una API que puede caerse»: era un fallo garantizado al primer uso.
//
//  CÓMO FUNCIONA AHORA
//  Las URLs salen del `.env` (nunca escritas en el código: son de
//  terceros y cambian). Lo que no esté configurado simplemente NO se
//  intenta, en vez de intentarse con `undefined`. Y si no queda ninguna
//  ruta viva, el comando lo dice con palabras en vez de reventar.
//
//  Nada de esto es obligatorio para que el bot funcione: los comandos
//  que no dependen de una API (el 95 %) no se enteran de que esto existe.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

/** Cada API de respaldo: su variable de URL y, si la usa, la de la key. */
const FUENTES = {
  Ginko: { url: "GINKO_API_URL", key: "GINKO_API_KEY" },
  delirius: { url: "DELIRIUS_API_URL" },
  zenzxz: { url: "ZENXZ_API_URL" },
  ootaizumi: { url: "OOTAIZUMI_API_URL" },
};

/** Quita la barra final: `.../` + `/dl/x` daría `//dl/x`. */
const limpiar = (u) => String(u || "").trim().replace(/\/+$/, "");

/**
 * Arma el objeto que los comandos esperan en `global.APIs`.
 * Solo lleva las fuentes que tengan URL: las demás no aparecen, así que
 * un comando que las pida se las salta en lugar de llamar a `undefined`.
 */
export function crearAPIs(env = process.env) {
  const apis = {};
  for (const [nombre, campos] of Object.entries(FUENTES)) {
    const url = limpiar(env[campos.url]);
    if (!url) continue;
    apis[nombre] = { url, key: String(env[campos.key] || "").trim() };
  }
  return apis;
}

/**
 * Deja `global.APIs` puesto para los comandos porteados y avisa —una vez,
 * sin ruido— si no hay ninguna configurada.
 */
export function instalarAPIs(env = process.env) {
  const apis = crearAPIs(env);
  globalThis.APIs = apis;
  const nombres = Object.keys(apis);
  if (nombres.length) {
    log.ui("  " + "APIs de respaldo: " + nombres.join(", "));
  } else if (!globalThis.__shinAvisoApis) {
    // Solo tiene sentido avisar si el dueño usa comandos que las necesitan.
    globalThis.__shinAvisoApis = true;
    log.ui(
      "  ◐  Sin APIs de respaldo configuradas (.instagram, .twitter, .imagen)\n" +
        "     los demás comandos funcionan igual. Para activarlas, mira el .env.example.",
    );
  }
  return apis;
}

/** ¿Está configurada esta fuente? Los comandos lo preguntan antes de usarla. */
export function hayApi(nombre, env = process.env) {
  return Boolean((globalThis.APIs || crearAPIs(env))[nombre]?.url);
}

export default { crearAPIs, instalarAPIs, hayApi };
