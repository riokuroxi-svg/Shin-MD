/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  identities.js — Dónde se acuerdan las parejas LID ↔ teléfono
//
//  La red solo resuelve teléfono → LID. El sentido contrario no existe:
//  únicamente se puede contestar con lo que ya se vio. Por eso lo que
//  de verdad arregla el problema no es una función de consulta, es una
//  tabla que sobreviva a reinicios, cambios de sesión y dispositivos.
//
//  Además, cuando una pareja se aprende y había datos guardados con la
//  llave del LID (porque en su momento no se sabía el teléfono), esas
//  filas se MUEVEN a la llave buena. Si ya existían las dos, se SUMAN.
//  Sin esto, el usuario vería dos carteras y podría reclamar la diaria
//  dos veces.
//
//  Todo el archivo es defensivo a propósito: una base vieja puede no
//  tener alguna tabla (g_*, economy_timers, user_characters...). Lo que
//  falte se salta, se anota en el log y el mensaje sigue su camino.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { normalizeJid, esLid, esTelefono } from "#lib/jid";
import ginko from "../services/ginko-db.js";

const TABLA = `
  CREATE TABLE IF NOT EXISTS identities (
    lid        TEXT PRIMARY KEY,
    pn         TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_identities_pn ON identities(pn);
`;

/** Columnas que se suman al fusionar (dinero, XP, objetos contados). */
const SUMAR = new Set([
  "coins", "bank", "exp", "xp", "minxp", "maxxp", "usedcommands",
  "wins", "losses", "games", "count", "uses", "amount",
]);
/** Columnas de tiempo: al fusionar vale la más reciente (no se duplica el premio). */
const RECIENTE = new Set([
  "streak", "weeklyStreak", "monthlyStreak", "Subs",
  "reportCooldown", "sugCooldown", "timeTrade",
  "lastDailyGlobal", "lastWeeklyGlobal", "lastMonthlyGlobal",
  "lastCmd", "lastdaily", "lastweekly", "lastmonthly", "lastwork", "lastfish",
  "lasthunt", "lastmine", "lastcrime", "laststeal", "lastslut", "lastadventure",
  "lastdungeon", "lastcoffer", "lastcoinflip", "lastroulette", "lastslot",
  "lastppt", "lastApuesta", "lastinvoke", "lastClaim", "lastRoll",
  "lastrobwaifu", "lastVote", "last_seen", "updated_at", "level",
]);
/** Listas donde se unen los elementos sin repetir. */
const LISTAS = new Set(["warnings", "robVictims", "characters"]);
/** Columnas que guardan JSON aunque su nombre no lo diga. */
const JSON_COLS = new Set(["stats", "inventory", "tools", "weapons", "rolls", "sales", "intercambios", "regalosPendientes"]);

const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const vacio = (v) => v === null || v === undefined || v === "";

function json(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

/**
 * Une dos valores JSON sin perder nada: los números se suman, las listas
 * se unen y en los textos gana el que ya tenía la cuenta del teléfono.
 */
function unirJson(a, b) {
  const ja = json(a);
  const jb = json(b);
  if (ja === null) return jb === null ? (vacio(b) ? a : b) : JSON.stringify(jb);
  if (jb === null) return JSON.stringify(ja);

  if (Array.isArray(ja) && Array.isArray(jb)) {
    const salida = [...ja];
    for (const x of jb) {
      const repetido = salida.some((y) => JSON.stringify(y) === JSON.stringify(x));
      if (!repetido) salida.push(x);
    }
    return JSON.stringify(salida);
  }

  if (typeof ja === "object" && typeof jb === "object" && !Array.isArray(ja) && !Array.isArray(jb)) {
    const salida = { ...ja };
    for (const [k, v] of Object.entries(jb)) {
      const anterior = salida[k];
      if (typeof v === "number" && typeof anterior === "number") salida[k] = anterior + v;
      else if (vacio(anterior)) salida[k] = v;
    }
    return JSON.stringify(salida);
  }

  // Tipos distintos (o texto): se queda el de la cuenta del teléfono.
  return JSON.stringify(jb);
}

/**
 * ¿Qué valor queda en una columna cuando las dos filas existen?
 * @param {string} columna
 * @param {any} a valor de la fila guardada con el LID
 * @param {any} b valor de la fila guardada con el teléfono
 */
export function combinarColumna(columna, a, b) {
  if (JSON_COLS.has(columna) || LISTAS.has(columna)) return unirJson(a, b);
  if (SUMAR.has(columna)) return num(a) + num(b);
  if (RECIENTE.has(columna)) return Math.max(num(a), num(b));
  if (columna === "first_seen" || columna === "jointime") {
    const va = num(a);
    const vb = num(b);
    if (!va) return vb;
    if (!vb) return va;
    return Math.min(va, vb);
  }
  if (columna === "afk") {
    if (num(b) >= 0) return b;
    return a;
  }
  // Texto y perfiles: si la cuenta del teléfono ya tiene algo, se respeta.
  return vacio(b) ? a : b;
}

function esBaseValida(db) {
  return !!db && typeof db.prepare === "function" && typeof db.exec === "function";
}

function tablaExiste(db, nombre) {
  try {
    const fila = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre);
    return !!fila;
  } catch {
    return false;
  }
}

/**
 * Fusiona una fila de `tabla` (con clave `clave`) desde `desde` hacia
 * `hacia`. Si la de destino no existe, se renombra; si existe, se combina
 * columna a columna con las reglas de arriba.
 */
function fusionarFila(db, tabla, clave, desde, hacia) {
  const a = db.prepare("SELECT * FROM " + tabla + " WHERE " + clave + " = ?").get(desde);
  if (!a) return false;
  const b = db.prepare("SELECT * FROM " + tabla + " WHERE " + clave + " = ?").get(hacia);

  if (!b) {
    db.prepare("UPDATE " + tabla + " SET " + clave + " = ? WHERE " + clave + " = ?").run(hacia, desde);
    return true;
  }

  // Las columnas salen de las dos filas: nunca se inventan nombres.
  const columnas = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const sets = [];
  const valores = [];
  for (const col of columnas) {
    if (col === clave) continue;
    const nuevo = combinarColumna(col, a[col], b[col]);
    if (nuevo !== b[col]) {
      sets.push(col + " = ?");
      valores.push(nuevo);
    }
  }
  if (sets.length) {
    db.prepare("UPDATE " + tabla + " SET " + sets.join(", ") + " WHERE " + clave + " = ?").run(...valores, hacia);
  }
  db.prepare("DELETE FROM " + tabla + " WHERE " + clave + " = ?").run(desde);
  return true;
}

/**
 * g_chat_users tiene clave compuesta (chat_id, user_id): la misma persona
 * puede tener fila en varios grupos, y cada una se fusiona por separado.
 */
function fusionarChatUsers(db, lid, pn) {
  if (!tablaExiste(db, "g_chat_users")) return 0;
  let filas;
  try {
    filas = db.prepare("SELECT * FROM g_chat_users WHERE user_id = ?").all(lid);
  } catch {
    return 0;
  }
  if (!filas?.length) return 0;

  const columnas = Object.keys(filas[0]);
  let movidas = 0;
  for (const fila of filas) {
    const chat = fila.chat_id;
    if (!chat) continue;
    const destino = db.prepare("SELECT * FROM g_chat_users WHERE chat_id = ? AND user_id = ?").get(chat, pn);
    if (!destino) {
      db.prepare("UPDATE g_chat_users SET user_id = ? WHERE chat_id = ? AND user_id = ?").run(pn, chat, lid);
      movidas++;
      continue;
    }
    const sets = [];
    const valores = [];
    for (const col of columnas) {
      if (col === "chat_id" || col === "user_id") continue;
      const nuevo = combinarColumna(col, fila[col], destino[col]);
      if (nuevo !== destino[col]) {
        sets.push(col + " = ?");
        valores.push(nuevo);
      }
    }
    if (sets.length) {
      db.prepare("UPDATE g_chat_users SET " + sets.join(", ") + " WHERE chat_id = ? AND user_id = ?")
        .run(...valores, chat, pn);
    }
    db.prepare("DELETE FROM g_chat_users WHERE chat_id = ? AND user_id = ?").run(chat, lid);
    movidas++;
  }
  return movidas;
}

/** Temporizadores de economía: la clave es "chat:usuario". */
function fusionarTimers(db, lid, pn) {
  if (!tablaExiste(db, "economy_timers")) return 0;
  let filas;
  try {
    filas = db.prepare("SELECT * FROM economy_timers WHERE sender = ?").all(lid);
  } catch {
    return 0;
  }
  if (!filas?.length) return 0;
  const columnas = Object.keys(filas[0]);
  let movidos = 0;
  for (const fila of filas) {
    const nuevoId = fila.chat_id + ":" + pn;
    const destino = db.prepare("SELECT * FROM economy_timers WHERE id = ?").get(nuevoId);
    if (!destino) {
      db.prepare("UPDATE economy_timers SET id = ?, sender = ? WHERE id = ?").run(nuevoId, pn, fila.id);
      movidos++;
      continue;
    }
    const sets = [];
    const valores = [];
    for (const col of columnas) {
      if (col === "id" || col === "chat_id" || col === "sender") continue;
      const nuevo = combinacionDeTiempo(fila[col], destino[col]);
      if (nuevo !== destino[col]) {
        sets.push(col + " = ?");
        valores.push(nuevo);
      }
    }
    if (sets.length) {
      db.prepare("UPDATE economy_timers SET " + sets.join(", ") + " WHERE id = ?").run(...valores, nuevoId);
    }
    db.prepare("DELETE FROM economy_timers WHERE id = ?").run(fila.id);
    movidos++;
  }
  return movidos;
}

function combinacionDeTiempo(a, b) {
  if (typeof a === "number" || typeof b === "number") return Math.max(num(a), num(b));
  return vacio(b) ? a : b;
}

/** Personajes reclamados (gacha): se mueven sin duplicar. */
function fusionarPersonajes(db, lid, pn) {
  if (!tablaExiste(db, "user_characters")) return 0;
  let filas;
  try {
    filas = db.prepare("SELECT * FROM user_characters WHERE user_jid = ?").all(lid);
  } catch {
    return 0;
  }
  if (!filas?.length) return 0;
  let movidos = 0;
  for (const fila of filas) {
    const yaEsta = db.prepare("SELECT 1 AS hay FROM user_characters WHERE user_jid = ? AND char_id = ?")
      .get(pn, fila.char_id);
    if (!yaEsta) {
      db.prepare("UPDATE user_characters SET user_jid = ? WHERE user_jid = ? AND char_id = ?")
        .run(pn, lid, fila.char_id);
    } else if (fila.favorite) {
      db.prepare("UPDATE user_characters SET favorite = 1 WHERE user_jid = ? AND char_id = ?").run(pn, fila.char_id);
      db.prepare("DELETE FROM user_characters WHERE user_jid = ? AND char_id = ?").run(lid, fila.char_id);
    } else {
      db.prepare("DELETE FROM user_characters WHERE user_jid = ? AND char_id = ?").run(lid, fila.char_id);
    }
    movidos++;
  }
  return movidos;
}

/** Avisos de grupo: el campo que identifica a la persona es `warned_jid`. */
function fusionarAvisos(db, lid, pn) {
  if (!tablaExiste(db, "group_warns")) return 0;
  // Sin try/catch: un fallo real debe deshacer la fusión (ver fusionarCuentas).
  const r = db.prepare("UPDATE group_warns SET warned_jid = ? WHERE warned_jid = ?").run(pn, lid);
  return r?.changes || 0;
}

/**
 * Mueve (o suma) la cuenta guardada con el LID a la del teléfono.
 * Devuelve true si tocó algo.
 */
export function fusionarCuentas(db, lidJid, pnJid) {
  const lid = normalizeJid(lidJid);
  const pn = normalizeJid(pnJid);
  if (!esBaseValida(db) || !esLid(lid) || !esTelefono(pn)) return false;

  let tocado = false;
  const pasos = [
    ["g_users", () => {
      if (!tablaExiste(db, "g_users")) return 0;
      return fusionarFila(db, "g_users", "id", lid, pn) ? 1 : 0;
    }],
    ["g_chat_users", () => fusionarChatUsers(db, lid, pn)],
    ["users", () => {
      if (!tablaExiste(db, "users")) return 0;
      return fusionarFila(db, "users", "jid", lid, pn) ? 1 : 0;
    }],
    ["economy_timers", () => fusionarTimers(db, lid, pn)],
    ["user_characters", () => fusionarPersonajes(db, lid, pn)],
    ["group_warns", () => fusionarAvisos(db, lid, pn)],
  ];

  // Todo o nada: si un paso falla se deshace la fusión entera y el error
  // sube a lid.js, que la reintenta. Sin esto quedaba la cuenta partida
  // entre el LID y el teléfono (y un reintento sumaría dos veces).
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [nombre, paso] of pasos) {
      try {
        if (paso() > 0) tocado = true;
      } catch (err) {
        err.pasoFusion = nombre;
        throw err;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    log.warn("[identities] fusión deshecha en " + (err?.pasoFusion || "?") + ": " + (err?.message || err));
    throw err;
  }
  return tocado;
}

/**
 * Backend de persistencia para #lib/lid. Es síncrono porque node:sqlite lo
 * es; así una pareja aprendida está escrita antes de que termine el
 * mensaje, sin colas ni promesas de por medio.
 */
export function crearBackendIdentidades(db, { fusionar = true } = {}) {
  if (!esBaseValida(db)) throw new Error("identities: hace falta una base de datos válida");

  db.exec(TABLA);
  // Índices que abaratan las búsquedas de la fusión (si la tabla existe).
  try {
    if (tablaExiste(db, "g_chat_users")) {
      db.exec("CREATE INDEX IF NOT EXISTS idx_g_chat_users_user ON g_chat_users(user_id)");
    }
  } catch { /* solo es una optimización */ }

  const st = {
    leer: db.prepare("SELECT pn FROM identities WHERE lid = ?"),
    leerInverso: db.prepare("SELECT lid FROM identities WHERE pn = ? ORDER BY updated_at DESC LIMIT 1"),
    guardar: db.prepare("INSERT INTO identities (lid, pn, updated_at) VALUES (?, ?, ?) ON CONFLICT(lid) DO UPDATE SET pn = excluded.pn, updated_at = excluded.updated_at"),
    // COUNT(*) no lo entiende el respaldo JSON; contar filas sí, y la
    // tabla es pequeña (una fila por persona).
    todas: db.prepare("SELECT lid FROM identities"),
  };

  return {
    pnPorLid(lid) {
      const fila = st.leer.get(lid);
      return fila?.pn || "";
    },
    lidPorPn(pn) {
      const fila = st.leerInverso.get(pn);
      return fila?.lid || "";
    },
    guardar(lid, pn) {
      st.guardar.run(lid, pn, Date.now());
    },
    fusionar(lid, pn) {
      if (!fusionar) return false;
      const tocado = fusionarCuentas(db, lid, pn);
      // ginko-db guarda filas en memoria: si no se vacía, seguiría
      // sirviendo la copia vieja de la cuenta del LID.
      if (tocado) {
        try { ginko.limpiarCache?.(); } catch { /* caché opcional */ }
      }
      return tocado;
    },
    contar() {
      try {
        return st.todas.all().length;
      } catch {
        return 0;
      }
    },
  };
}

export default { crearBackendIdentidades, fusionarCuentas, combinarColumna };
