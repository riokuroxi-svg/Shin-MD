/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  db-opcional.js — Sentencias SQL que pueden fallar "con razón".
//
//  El patrón `try { db.exec(sql) } catch {}` estaba 14 veces en las
//  migraciones (ALTER TABLE ... ADD COLUMN). Ahí el catch vacío tapa dos
//  cosas muy distintas:
//
//    · "duplicate column name" → la columna ya existe: es lo ESPERADO y
//      no hay nada que hacer. (Por eso el catch vacío parecía inofensivo.)
//    · cualquier otro fallo → "database is locked", disco lleno, SQL mal
//      escrito... y la columna se queda SIN crear. Después el comando que
//      escribe en esa columna falla en silencio y nadie sabe por qué.
//
//  Con esta función el primer caso sigue siendo silencioso y el segundo
//  deja un aviso en el log (y en logs/shin-*.log, que es lo que se mira
//  cuando algo "dejó de guardar" de un día para otro).
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";

/** Errores que significan "ya estaba hecho" y por eso no se avisa. */
const ESPERADOS = /duplicate column|already exists|duplicate column name/i;

/**
 * Ejecuta una sentencia que puede no ser necesaria (migraciones idempotentes).
 * @param {{ exec: (sql: string) => unknown }} db
 * @param {string} sql
 * @returns {boolean} true si se aplicó, false si se ignoró o falló
 */
export function ejecutarSqlOpcional(db, sql) {
  try {
    db.exec(sql);
    return true;
  } catch (e) {
    const mensaje = e?.message || String(e);
    if (!ESPERADOS.test(mensaje)) {
      // Solo lo que de verdad importa: la columna que NO se creó.
      log.warn("BD: sentencia opcional falló → " + mensaje + " · " + String(sql).slice(0, 80));
    }
    return false;
  }
}

export default { ejecutarSqlOpcional };
