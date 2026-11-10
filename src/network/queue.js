/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";

// Tope por envío: si Baileys cuelga una promesa de sendMessage (redes
// inestables), la cola NO puede congelarse detrás de ese envío para todos
// los chats. Tras este tiempo se trata como fallo y se sigue con el siguiente.
// (La operación huérfana puede terminar más tarde en segundo plano; no es
// cancelable, pero ya no bloquea nada.)
const SEND_TIMEOUT_MS = 120000;

// Marca de «no sé si salió». Ver el comentario de abajo, en el reintento.
export const CODIGO_INCIERTO = "ENVIO_INCIERTO";

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => {
        const e = new Error(label + " superó " + ms + "ms sin respuesta");
        // Esto NO es un fallo: es una incógnita. Se distinguen porque la
        // respuesta que corresponde a cada uno es distinta.
        e.code = CODIGO_INCIERTO;
        reject(e);
      }, ms);
    }),
  ]).finally(() => clearTimeout(t));
}

/**
 * ¿Falló porque la conexión con WhatsApp está caída?
 *
 * Baileys no tiene un código para esto: el envío revienta con textos como
 * «Connection Closed», «Connection Failure» o «Socket is not open». No es
 * un fallo del bot ni del mensaje — el mensaje está perfecto, no hay por
 * dónde mandarlo. Distinguirlo importa: un fallo de verdad se reintenta y,
 * si vuelve a fallar, se descarta; este otro NO se descarta, se espera.
 *
 * @param {any} err
 */
export function esFalloDeConexion(err) {
  if (!err) return false;
  const e = /** @type {any} */ (err);
  const texto = String(e.message || e);
  // Las credenciales inválidas o el número desvinculado NO son transitorios:
  // esperar la reconexión ahí sería esperar para siempre.
  if (e.code === CODIGO_INCIERTO) return false;
  return /connection closed|connection failure|connection terminated|socket is not open|not connected|sin conexión/i.test(texto);
}

export function createSendQueue(throttler, health, opts = {}) {
  const timeoutMs = opts.timeoutMs || SEND_TIMEOUT_MS;
  // Cuánto puede esperar un mensaje a que vuelva la conexión antes de
  // darse por perdido. 5 min cubre el corte típico de datos móviles; más
  // allá de eso el que escribió ya se fue.
  const esperaReconexionMs = opts.esperaReconexionMs || 300000;
  const queue = [];
  let processing = false;
  // La pausa lleva MOTIVOS, no un booleano. Antes, cualquier `resume()`
  // reanudaba la cola aunque hubiera otro motivo para tenerla parada: el
  // watchdog la pausaba por riesgo alto y la reconexión la reanudaba tres
  // segundos después, saltándose el freno anti-ban sin querer.
  const motivosDePausa = new Set();
  let paused = false;
  // B1.4: ventana de prioridad. El router la abre alrededor de comandos
  // marcados `priority: true` (.menu/.ping/.owner); todo envío hecho
  // dentro de la ventana sale con delay mínimo y no lo frena el tope
  // diario del warm-up (son respuestas directas a quien escribe: lo
  // menos baneable que hay).
  let priorityDepth = 0;
  // Envíos de los que no sabemos si llegaron. Se cuentan para poder verlos.
  let inciertos = 0;
  let ultimoIncierto = 0;

  // B2.2: el tope diario antes escribía "Warm-up limit reached, waiting 60s..."
  // una vez por minuto, para siempre, sin decir cuánto era el tope ni cuándo
  // se libera. Ahora se avisa UNA sola vez por episodio y con datos útiles.
  let avisoTopeDado = false;
  function avisarTopeDiario(th) {
    if (avisoTopeDado) return;
    avisoTopeDado = true;
    let detalle = "";
    try {
      const s = th.getStats();
      const faltanMs = new Date().setUTCHours(24, 0, 0, 0) - Date.now();
      const horas = Math.floor(faltanMs / 3600000);
      const mins = Math.round((faltanMs % 3600000) / 60000);
      detalle = ` (${s.msgsToday}/${s.dailyLimit} hoy · día ${s.day} del warm-up · se reinicia en ${horas}h ${mins}m)`;
    } catch {}
    log.warn("Tope diario del warm-up alcanzado" + detalle);
    log.warn("Los envíos normales esperan; .menu/.ping y las reacciones siguen pasando. Ajusta con WARMUP_START_MSGS / WARMUP_MAX_MSGS / WARMUP=off en .env, o revísalo con .warmup");
  }

  function enterPriority() { priorityDepth++; }
  function exitPriority() { priorityDepth = Math.max(0, priorityDepth - 1); }
  function inPriority() { return priorityDepth > 0; }

  /**
   * Espera a que la cola deje de estar pausada (es decir, a que vuelva la
   * conexión). Devuelve `true` si volvió y `false` si se agotó el tiempo.
   * @param {number} topeMs
   */
  async function esperarReanudacion(topeMs) {
    const fin = Date.now() + topeMs;
    while (paused && Date.now() < fin) {
      await new Promise((r) => setTimeout(r, 250));
    }
    return !paused;
  }

  function enqueue(fn, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      queue.push({ fn, opts, resolve, reject, ts: Date.now() });
      if (!processing) process();
    });
  }

  async function process() {
    if (processing || paused) return;
    processing = true;

    while (queue.length > 0) {
      if (paused) { processing = false; return; }

      // B1.4: con el tope diario del warm-up alcanzado, las tareas
      // normales esperan; si hay una tarea de prioridad en la cola,
      // se adelanta y pasa (nunca se queda 60s detrás del bloqueo).
      // B2.2: lo mismo para las tareas que no gastan cuota (reacciones,
      // borrados, ediciones): no tiene sentido congelarlas 60s por un
      // tope que ni siquiera consumen.
      let task;
      if (throttler && throttler.canSend()) avisoTopeDado = false;
      if (throttler && !throttler.canSend()) {
        const pIdx = queue.findIndex(t => t.opts && (t.opts.isPriority || t.opts.countsForQuota === false));
        if (pIdx === -1) {
          avisarTopeDiario(throttler);
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        task = queue.splice(pIdx, 1)[0];
      } else {
        task = queue.shift();
      }

      const delay = throttler ? throttler.calcDelay({
        isPriority: task.opts.isPriority || false,
        messageLength: task.opts.messageLength || 0,
        isNewContact: task.opts.isNewContact || false,
      }) : 500;

      await new Promise(r => setTimeout(r, delay));

      const gastaCuota = task.opts.countsForQuota !== false;

      try {
        const result = await withTimeout(task.fn(), timeoutMs, "envío");
        if (throttler && gastaCuota) throttler.recordSent();
        if (health) health.recordSend();
        task.resolve(result);
      } catch (err) {
        if (health) health.recordSendFail(err);

        // ── Un envío sin respuesta NO se reintenta a ciegas ──────────
        // Antes, un timeout (120 s sin que Baileys conteste) caía en el
        // reintento de abajo y se mandaba OTRA VEZ el mismo mensaje. Pero
        // el que se colgó puede haber llegado perfectamente: la promesa
        // huérfana sigue viva en segundo plano. Resultado: el contacto ve
        // el mensaje dos veces, y el doble mensaje es de las cosas que más
        // se reportan como spam — justo lo que este bot evita.
        //
        // Reintentar sirve cuando el fallo es SEGURO (el socket dijo que
        // no). Cuando es una incógnita, se anota y se sigue: perder uno
        // es mejor que duplicarlo. El estado queda en el registro y en
        // `.health`, nunca en silencio.
        if (err && err.code === CODIGO_INCIERTO) {
          inciertos += 1;
          ultimoIncierto = Date.now();
          if (throttler && gastaCuota) throttler.recordSent(); // se envió trabajo real
          log.warn(
            "Envío sin respuesta tras " + timeoutMs + "ms: NO lo repito para no duplicarlo. " +
              "Puede haber llegado o no; revisa el chat. (" + inciertos + " en esta sesión)",
          );
          task.reject(err);
          continue;
        }

        // ── Se cayó la conexión: el mensaje ESPERA, no se pierde ────
        // El fallo que se veía en el móvil: llega un comando, justo ahí se
        // cae la conexión (código 428 en datos móviles es de todos los
        // días), el envío revienta con «Connection Closed», se reintenta a
        // los 2-3 s —la conexión sigue caída—, vuelve a reventar y la
        // respuesta se TIRA. Quien escribió el comando no recibe nada y el
        // bot parece muerto aunque esté reconectando.
        //
        // Aquí ese reintento ciego se cambia por espera: el mensaje se
        // queda en la cola (que está pausada por el mismo motivo) y sale
        // en cuanto la conexión vuelve.
        //
        // ¿Y no se duplica? No: «Connection Closed» lo lanza Baileys al
        // escribir sobre un websocket ya cerrado — el fotograma NO llegó a
        // salir. Es el caso contrario del envío sin respuesta (ese sí es
        // una incógnita y no se reintenta nunca).
        if (esFalloDeConexion(err)) {
          log.warn("Conexión caída: el mensaje queda en cola y sale al reconectar");
          const volvio = await esperarReanudacion(esperaReconexionMs);
          if (!volvio) {
            log.warn("No volvió la conexión en " + Math.round(esperaReconexionMs / 60000) + " min: ese mensaje se pierde");
            task.reject(err);
            continue;
          }
          try {
            const result3 = await withTimeout(task.fn(), timeoutMs, "envío tras reconectar");
            if (throttler && gastaCuota) throttler.recordSent();
            if (health) health.recordSend();
            task.resolve(result3);
          } catch (err3) {
            if (health) health.recordSendFail(err3);
            task.reject(err3);
          }
          continue;
        }

        log.error("Send failed: " + (err.message || err), err);
        try {
          // Reintento que RESPETA el throttler (nunca 3s fijos a tope de
          // velocidad: esto es un bot anti-ban). Mínimo 2s.
          const retryDelay = throttler
            ? Math.max(2000, throttler.calcDelay({ messageLength: task.opts.messageLength || 0 }))
            : 3000;
          await new Promise(r => setTimeout(r, retryDelay));
          const result2 = await withTimeout(task.fn(), timeoutMs, "reintento");
          if (throttler && gastaCuota) throttler.recordSent();
          task.resolve(result2);
          if (health) health.recordSend();
        } catch (err2) {
          // El reintento también puede quedarse sin respuesta. Ahí se
          // acaba: una incógnita no se persigue con un tercer envío.
          if (err2 && err2.code === CODIGO_INCIERTO) {
            inciertos += 1;
            ultimoIncierto = Date.now();
            log.warn("El reintento también quedó sin respuesta; no hay un tercer envío.");
          } else if (health) {
            health.recordSendFail(err2);
          }
          task.reject(err2);
        }
      }
    }
    processing = false;
  }

  /**
   * Pausa la cola. `motivo` permite que dos módulos distintos la paren sin
   * pisarse: el watchdog por riesgo y la conexión por estar caída.
   * @param {string} [motivo]
   */
  function pause(motivo = "manual") { motivosDePausa.add(motivo); paused = true; }

  /**
   * Quita un motivo de pausa. La cola solo vuelve a andar cuando no queda
   * ninguno.
   * @param {string} [motivo]
   */
  function resume(motivo = "manual") {
    motivosDePausa.delete(motivo);
    paused = motivosDePausa.size > 0;
    if (!paused && !processing) process();
  }

  /** Por qué está parada la cola ahora mismo (vacío si anda). */
  function motivos() { return [...motivosDePausa]; }

  function clear() { queue.length = 0; }
  function length() { return queue.length; }
  function isPaused() { return paused; }

  /** Cuántos envíos quedaron en el aire y cuándo fue el último. */
  function getStats() {
    return { length: queue.length, paused, motivos: [...motivosDePausa], inciertos, ultimoIncierto };
  }

  return {
    enqueue, pause, resume, motivos, clear, length, isPaused,
    enterPriority, exitPriority, inPriority, getStats,
  };
}

export default createSendQueue;
