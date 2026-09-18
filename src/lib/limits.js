// ════════════════════════════════════════════════════════════════════
//  limits.js — Límites de concurrencia para trabajo pesado (Blanco sano)
//
//  Autocontenido (no depende de #lib/humanize). Implementa un semáforo
//  sencillo por clave para que un comando pesado no sature el bot.
//
//  Uso en un comando:
//    import { withLimit } from '#lib/limits'
//    ...
//    run: async (ctx) => {
//      return withLimit('media', 3, async () => {
//        // ...cuerpo original...
//      })
//    }
//
//  Si el semáforo está lleno, lanza un error de usuario (mensaje limpio
//  "espera un momento") → el despachador lo muestra tal cual.
//
//  Claves sugeridas:
//   · 'media'  → procesamiento pesado de imágenes/videos (stickers, upscale)
//   · 'api'    → llamadas lentas a APIs externas
// ════════════════════════════════════════════════════════════════════

import { userError } from '#lib/errors';

// Registro interno de semáforos: clave → { max, activos }
const semaforos = new Map();

// Intenta tomar un slot de `key` (máx `max` concurrentes).
// Devuelve una función `liberar()` o lanza un error con `.semaforo = true`.
function adquirir(key, max) {
  const cur = semaforos.get(key) || { max, activos: 0 };
  if (cur.activos >= cur.max) {
    const e = new Error(`Semáforo lleno: ${key}`);
    e.semaforo = true;
    throw e;
  }
  cur.activos += 1;
  semaforos.set(key, cur);
  let liberado = false;
  return function liberar() {
    if (liberado) return;
    liberado = true;
    const s = semaforos.get(key);
    if (s) s.activos = Math.max(0, s.activos - 1);
  };
}

// Ejecuta `fn` bajo un semáforo `key` con máximo `max` concurrentes.
// Asegura SIEMPRE liberar el recurso, incluso si `fn` lanza.
// Si el semáforo está lleno, lanza un **error de usuario** (mensaje limpio
// "espera un momento") en vez de un error interno.
export async function withLimit(key, max, fn) {
  let liberar;
  try {
    liberar = adquirir(key, max);
  } catch (e) {
    if (e?.semaforo) {
      throw userError('⏳ Hay demasiadas tareas pesadas en curso. Espera un momento e inténtalo de nuevo.');
    }
    throw e;
  }
  try {
    return await fn();
  } finally {
    liberar();
  }
}

// Atajo: ¿el error es "semáforo lleno"?
export function isLimitError(e) {
  return !!(e && e.semaforo === true);
}
