/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 *
 * src/lib/sesion.js — lo que se rompe ANTES de que te baneen.
 *
 * Cuatro piezas que no tienen que ver con el contenido ni con los topes, sino
 * con la *forma* de la conexión. Según los reportes de campo (Baileys #2484,
 * #2491, #2309) casi todos los sustos empiezan aquí, no en un mensaje:
 *
 *   1. TORMENTA DE RECONEXIÓN. Cuando la conexión vuelve, el bot escupe de
 *      golpe todo lo que tenía en cola. Ese pico justo después de reconectar es
 *      lo que más rápido dispara los límites: WhatsApp ve un número que
 *      recién vuelve y manda 40 mensajes en diez segundos.
 *      → `crearCalmaDeReconexion()`: arranca al 10 % del ritmo y sube a 100 %
 *        en un minuto, en pasos. Nunca de golpe.
 *
 *   2. SESIÓN SORDA. La conexión está «abierta», el keepAlive responde, pero
 *      `messages.upsert` deja de llegar. El bot parece vivo y no recibe nada
 *      durante horas (#2491). La solución de campo es forzar una reconexión
 *      limpia tras N minutos de silencio.
 *      → `crearDetectorDeSordera()`: avisa y pide `sock.end()`.
 *
 *   3. REPETICIÓN AL RECONECTAR. Baileys puede reentregar mensajes viejos al
 *      abrir de nuevo. Contestarlos es peor que no contestar: son respuestas a
 *      conversaciones de hace media hora, y en ráfaga.
 *      → `crearPortonDeReentrada()`: durante los primeros segundos tras
 *        reconectar solo entran mensajes recientes, y nunca dos veces el mismo.
 *
 *   4. VIDA 24/7. Una cuenta que manda a las 4 de la mañana todos los días no
 *      parece una persona. Un rato de descanso diario, a una hora distinta cada
 *      día, cuesta cero y quita la señal de «encendido permanente».
 *      → `crearDescanso()`: una ventana diaria sin envíos normales.
 *
 * Nada de esto garantiza que un número no caiga. Quitan señales de robot; no
 * dan inmunidad.
 */
import log from "#logger";

function numeroDeEntorno(nombre, porDefecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === "") return porDefecto;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

const apagado = (nombre) => String(process.env[nombre] || "").toLowerCase() === "off";

const hoy = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// ── 1. calma tras reconectar ────────────────────────────────────────────────

/**
 * Sube el ritmo poco a poco después de una reconexión.
 *
 * Devuelve un factor entre `inicial` y 1 que se aplica a la espera entre
 * envíos: con 0,1 la cola va diez veces más lenta, y en un minuto vuelve a la
 * normalidad. Si se vuelve a caer, la calma empieza otra vez.
 *
 * @param {object} [op]
 * @param {number} [op.duracionMs] cuánto tarda en volver al 100 %
 * @param {number} [op.inicial]    factor de arranque (0,1 = 10 % del ritmo)
 * @param {number} [op.pasos]      cuántos escalones tiene la subida
 * @param {function} [op.ahora]    reloj, para probarlo sin esperar
 */
export function crearCalmaDeReconexion({
  duracionMs = numeroDeEntorno("CALMA_MS", 60_000),
  inicial = 0.1,
  pasos = 6,
  ahora,
} = {}) {
  const reloj = typeof ahora === "function" ? ahora : () => Date.now();
  let desde = null;

  return {
    /** Se llama en cada `connection === "open"`. */
    reiniciar() {
      desde = reloj();
    },
    /** ¿Está en calma ahora mismo? */
    get activa() {
      return desde !== null;
    },
    /**
     * Multiplicador de espera. 1 = normal; 10 = ir diez veces más despacio.
     * Es la inversa del factor de ritmo, que es lo que espera la cola.
     */
    factorDeEspera() {
      if (desde === null || !duracionMs) return 1;
      const pasado = reloj() - desde;
      if (pasado >= duracionMs) {
        desde = null;
        return 1;
      }
      // Escalones: 10 % → 25 % → 50 % → … → 100 % del ritmo.
      const escalon = Math.floor((pasado / duracionMs) * pasos);
      const avance = Math.max(inicial, Math.min(1, (escalon + 1) / pasos));
      return Number((1 / avance).toFixed(2));
    },
    /** Para el panel: cuánto falta y en qué escalón va. */
    estado() {
      if (desde === null) return { activa: false, faltaMs: 0, espera: 1 };
      const pasado = reloj() - desde;
      return {
        activa: pasado < duracionMs,
        faltaMs: Math.max(0, duracionMs - pasado),
        espera: this.factorDeEspera(),
      };
    },
  };
}

// ── 2. sesión sorda ─────────────────────────────────────────────────────────

/**
 * Detecta la conexión que está abierta pero ya no recibe nada.
 *
 * No cierra nada por su cuenta: avisa y deja que quien manda decida. Un
 * reinicio automático en mal momento es peor que una sesión sorda (y el
 * «storm» de reconexiones es justo lo que dispara los límites).
 *
 * @param {object} [op]
 * @param {number} [op.silencioMs] cuánto silencio se tolera (5 min)
 * @param {function} [op.alSordera]  qué hacer cuando se detecta
 */
export function crearDetectorDeSordera({
  silencioMs = numeroDeEntorno("SORDERA_MS", 5 * 60_000),
  alSordera,
  ahora,
} = {}) {
  const reloj = typeof ahora === "function" ? ahora : () => Date.now();
  let ultimoLatido = reloj();
  let ultimoAviso = 0;
  let sorderas = 0;

  return {
    /** Cada mensaje que llega es una prueba de que la sesión oye. */
    latido() {
      ultimoLatido = reloj();
    },
    /** Se llama al conectar: el contador arranca limpio. */
    reiniciar() {
      ultimoLatido = reloj();
    },
    /** Revisión periódica. Devuelve `true` si hay que reconectar. */
    revisar() {
      const t = reloj();
      if (t - ultimoLatido < silencioMs) return false;
      // No se avisa más de una vez por minuto: si no, el log se llena.
      if (t - ultimoAviso > 60_000) {
        ultimoAviso = t;
        sorderas += 1;
        log.warn(
          `Sesión sorda: ${Math.round((t - ultimoLatido) / 60000)} min conectada sin recibir nada. Conviene cerrar y reconectar.`,
        );
        try {
          alSordera?.();
        } catch {
          /* si el que escucha falla, no se cae el vigilante */
        }
      }
      return true;
    },
    estado() {
      return {
        silencioMs: reloj() - ultimoLatido,
        limiteMs: silencioMs,
        sorderas,
      };
    },
  };
}

// ── 3. portón de reentrada ──────────────────────────────────────────────────

const MAX_RECORDADOS = 200;

/**
 * Filtra lo que llega justo después de reconectar.
 *
 * Dos reglas, las dos baratas:
 *   · durante los primeros segundos solo entran mensajes recientes;
 *   · un mismo id no entra dos veces, nunca.
 *
 * @param {object} [op]
 * @param {number} [op.ventanaMs]     cuánto dura el filtro estricto (30 s)
 * @param {number} [op.edadMaxMs]     qué se considera «reciente» (10 s)
 * @param {function} [op.ahora]
 */
export function crearPortonDeReentrada({
  ventanaMs = numeroDeEntorno("PORTON_MS", 30_000),
  edadMaxMs = numeroDeEntorno("PORTON_EDAD_MS", 10_000),
  ahora,
} = {}) {
  const reloj = typeof ahora === "function" ? ahora : () => Date.now();
  let desde = null;
  const vistos = new Set();
  let repetidos = 0;
  let viejos = 0;

  return {
    reiniciar() {
      desde = reloj();
    },
    /**
     * ¿Pasa este mensaje?
     * @param {object} m mensaje crudo de Baileys
     * @returns {boolean}
     */
    dejarPasar(m) {
      const id = m?.key?.id;
      if (id) {
        if (vistos.has(id)) {
          repetidos += 1;
          return false;
        }
        vistos.add(id);
        // La memoria no crece: los más viejos se van solos.
        if (vistos.size > MAX_RECORDADOS) {
          vistos.delete(vistos.values().next().value);
        }
      }
      if (desde !== null && reloj() - desde < ventanaMs) {
        const sello = Number(m?.messageTimestamp) * 1000;
        // Si no hay sello no se descarta: mejor contestar de más que tirar algo.
        if (sello && reloj() - sello > edadMaxMs) {
          viejos += 1;
          return false;
        }
      }
      return true;
    },
    /** Atajo para un lote de `messages.upsert`. */
    filtrar(mensajes = []) {
      return mensajes.filter((m) => this.dejarPasar(m));
    },
    estado() {
      return {
        ventanaActiva: desde !== null && reloj() - desde < ventanaMs,
        recordados: vistos.size,
        repetidos,
        viejos,
      };
    },
  };
}

// ── 4. descanso diario ──────────────────────────────────────────────────────

/**
 * Una ventana de descanso al día, a una hora distinta cada día.
 *
 * No apaga el bot: lo que hace es que los envíos *normales* esperen. Lo urgente
 * (`.menu`, `.ping`) y las respuestas a quien acaba de escribir siguen pasando,
 * porque un bot que deja de contestar tampoco parece humano.
 *
 * La ventana se sortea con la fecha como semilla, así que es estable dentro del
 * día (no cambia a mitad) y distinta al siguiente. Con la semilla, dos procesos
 * que arranquen a horas distintas eligen la misma: no hay sorpresas.
 *
 * @param {object} [op]
 * @param {number} [op.horas]     cuántas horas dura el descanso (0 = apagado)
 * @param {number} [op.desdeHora] franja donde se puede caer (2 a 9 por defecto)
 * @param {number} [op.hastaHora]
 * @param {function} [op.ahora]
 */
export function crearDescanso({
  horas = numeroDeEntorno("DESCANSO_HORAS", 4),
  desdeHora = numeroDeEntorno("DESCANSO_DESDE", 1),
  hastaHora = numeroDeEntorno("DESCANSO_HASTA", 8),
  ahora,
} = {}) {
  const reloj = typeof ahora === "function" ? ahora : () => Date.now();

  /** Ventana de hoy: `{desde, hasta}` en horas decimales. */
  function ventana(t = reloj()) {
    if (!horas) return null;
    const fecha = hoy(t);
    // Semilla barata y estable: la fecha en días, mezclada.
    let semilla = 0;
    for (const ch of fecha) semilla = (semilla * 31 + ch.charCodeAt(0)) % 100_000;
    const margen = Math.max(0, hastaHora - desdeHora - horas);
    const inicio = desdeHora + (semilla % Math.max(1, Math.round(margen * 60))) / 60;
    return { desde: inicio, hasta: inicio + horas, fecha };
  }

  /** ¿Estamos en descanso? */
  function enDescanso(t = reloj()) {
    const v = ventana(t);
    if (!v) return false;
    const d = new Date(t);
    const horaDecimal = d.getHours() + d.getMinutes() / 60;
    // La ventana puede cruzar la medianoche.
    if (v.hasta <= 24) return horaDecimal >= v.desde && horaDecimal < v.hasta;
    return horaDecimal >= v.desde || horaDecimal < v.hasta - 24;
  }

  return {
    enDescanso,
    ventana,
    estado(t = reloj()) {
      const v = ventana(t);
      return {
        activo: Boolean(v),
        horas,
        descansando: enDescanso(t),
        desde: v ? v.desde : null,
        hasta: v ? Math.min(24, v.hasta) : null,
      };
    },
  };
}

/**
 * Un juego de piezas, con sus valores de entorno, para que el motor no tenga
 * que ir a buscarlas una por una.
 */
export function crearSesion(opciones = {}) {
  const calma = crearCalmaDeReconexion(opciones.calma);
  const sordera = crearDetectorDeSordera(opciones.sordera);
  const porton = crearPortonDeReentrada(opciones.porton);
  const descanso = crearDescanso(opciones.descanso);
  const activo = !apagado("SESION");
  return { calma, sordera, porton, descanso, activo };
}

export default { crearSesion, crearCalmaDeReconexion, crearDetectorDeSordera, crearPortonDeReentrada, crearDescanso };
