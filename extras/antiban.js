/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/** Marca de «no sé si salió». Se distingue de un fallo seguro a propósito. */
export const CODIGO_INCIERTO = "ENVIO_INCIERTO";

/** ¿Falló porque la conexión está caída? (el fotograma no llegó a salir) */
export function esFalloDeConexion(err) {
  if (!err) return false;
  const texto = String(err.message || err);
  if (err.code === CODIGO_INCIERTO) return false; // incógnita, no caída
  return /connection closed|connection failure|connection terminated|socket is not open|not connected|sin conexión/i.test(
    texto
  );
}

/** Una promesa con plazo: si no contesta, es una incógnita, no un fallo. */
function conPlazo(promesa, ms, etiqueta) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => {
      const err = new Error(`${etiqueta} superó ${ms} ms sin respuesta`);
      err.code = CODIGO_INCIERTO;
      rechazar(err);
    }, ms);
    Promise.resolve(promesa).then(
      (v) => {
        clearTimeout(reloj);
        resolver(v);
      },
      (e) => {
        clearTimeout(reloj);
        rechazar(e);
      }
    );
  });
}

/** Número al azar con forma de campana (Box-Muller). */
export function gaussiana(media, desviacion) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return media + desviacion * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function numeroDeEntorno(nombre, porDefecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === "") return porDefecto;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

/** Ajustes del ritmo. Se pueden cambiar por entorno sin tocar código. */
export function ajustesDeRitmo() {
  return {
    activo: String(process.env.ANTIBAN || "").toLowerCase() !== "off",
    baseMs: numeroDeEntorno("ANTIBAN_BASE_MS", 1200),
    desviacion: 0.25,
    minimoMs: numeroDeEntorno("ANTIBAN_MIN_MS", 400),
    maximoMs: numeroDeEntorno("ANTIBAN_MAX_MS", 5000),
    msPorLetra: 25,
    penalizacionNuevo: 1.5,
    diasCalentamiento: numeroDeEntorno("WARMUP_DAYS", 7),
    inicioMsgsDia: numeroDeEntorno("WARMUP_START_MSGS", 20),
    maxMsgsDia: numeroDeEntorno("WARMUP_MAX_MSGS", 500),
  };
}

/**
 * El limitador: cuánto se espera antes de enviar y cuánto se ha enviado hoy.
 *
 * @param {object} [opciones]
 * @param {object} [opciones.estado] dónde se guarda el calentamiento (db.antiban)
 * @param {object} [opciones.ajustes] resultado de `ajustesDeRitmo()`
 */
export function crearLimitador({ estado, ajustes } = {}) {
  const cfg = { ...ajustesDeRitmo(), ...(ajustes || {}) };
  const hoy = () => new Date().toISOString().slice(0, 10);

  // El estado vive en la base: reiniciar el bot no reinicia el calentamiento.
  const guardado = estado || {};
  guardado.inicio ||= hoy();
  guardado.ultimoDia ||= hoy();
  guardado.msgsHoy = Number(guardado.msgsHoy) || 0;
  guardado.total = Number(guardado.total) || 0;

  function revisarDia() {
    const dia = hoy();
    if (guardado.ultimoDia !== dia) {
      guardado.msgsHoy = 0;
      guardado.ultimoDia = dia;
    }
  }

  /** Día del calentamiento (1 = el primero) y tope que toca hoy. */
  function topeDeHoy() {
    if (!cfg.activo) return { dia: 1, tope: Infinity, terminado: true };
    const inicio = new Date(`${guardado.inicio}T00:00:00Z`).getTime();
    const dias = Math.max(0, Math.floor((Date.now() - inicio) / 86_400_000));
    const dia = dias + 1;
    if (dias >= cfg.diasCalentamiento) return { dia, tope: cfg.maxMsgsDia, terminado: true };
    const avance = cfg.diasCalentamiento ? dias / cfg.diasCalentamiento : 1;
    const tope = Math.round(cfg.inicioMsgsDia + (cfg.maxMsgsDia - cfg.inicioMsgsDia) * avance);
    return { dia, tope, terminado: false };
  }

  /** Milisegundos a esperar antes de este envío. */
  function demora({ urgente = false, largo = 0, nuevo = false } = {}) {
    revisarDia();
    if (!cfg.activo) return 0;
    if (urgente) return cfg.minimoMs;

    let ms = cfg.baseMs + gaussiana(0, cfg.baseMs * cfg.desviacion);
    if (largo > 10) ms += Math.min(largo * cfg.msPorLetra, 2000);
    if (nuevo) ms *= cfg.penalizacionNuevo;
    return Math.round(Math.max(cfg.minimoMs, Math.min(cfg.maximoMs, ms)));
  }

  /** ¿Queda cuota hoy? */
  function puedeEnviar() {
    revisarDia();
    return guardado.msgsHoy < topeDeHoy().tope;
  }

  function anotarEnvio() {
    revisarDia();
    guardado.msgsHoy += 1;
    guardado.total += 1;
  }

  function resumen() {
    revisarDia();
    const { dia, tope, terminado } = topeDeHoy();
    return {
      activo: cfg.activo,
      dia,
      tope,
      msgsHoy: guardado.msgsHoy,
      total: guardado.total,
      terminado,
      alcanzado: guardado.msgsHoy >= tope,
    };
  }

  return { demora, puedeEnviar, anotarEnvio, resumen, ajustes: cfg, estado: guardado };
}

/**
 * La salud: cuenta desconexiones, errores y envíos fallidos de la última hora y
 * los convierte en un «riesgo» de 0 a 100.
 *
 * Los pesos son los de Shin-MD (10 por desconexión hasta 30, 5 por error hasta
 * 30, tasa de fallos hasta 30 y 10 más si hubo un 403). No están medidos contra
 * los servidores de WhatsApp —nadie puede medirlo desde fuera—; sirven como
 * semáforo, no como sentencia.
 */
export function crearSalud({ ventanaMs = 3_600_000, maximo = 2000 } = {}) {
  const eventos = [];

  function limpiar() {
    const corte = Date.now() - ventanaMs;
    while (eventos.length && eventos[0].ts < corte) eventos.shift();
  }

  function anotar(tipo, datos) {
    limpiar();
    eventos.push({ ts: Date.now(), tipo, datos });
    if (eventos.length > maximo) eventos.shift();
  }

  function codigoDe(err) {
    return err?.output?.statusCode ?? err?.statusCode ?? err?.code ?? (err?.message || "desconocido");
  }

  function riesgo() {
    limpiar();
    const desconexiones = eventos.filter((e) => e.tipo === "desconexion").length;
    const errores = eventos.filter((e) => e.tipo === "error").length;
    const fallidos = eventos.filter((e) => e.tipo === "envio_fallido").length;
    const enviados = eventos.filter((e) => e.tipo === "envio").length;

    let puntos = 0;
    puntos += Math.min(30, desconexiones * 10);
    puntos += Math.min(30, errores * 5);
    if (enviados > 0) puntos += Math.min(30, (fallidos / enviados) * 100 * 0.5);
    if (eventos.some((e) => e.tipo === "error" && Number(e.datos?.codigo) === 403)) puntos += 10;

    return Math.round(Math.min(100, Math.max(0, puntos)));
  }

  function estado() {
    const puntos = riesgo();
    return {
      riesgo: puntos,
      nivel: puntos >= 80 ? "crítico" : puntos >= 50 ? "alto" : puntos >= 20 ? "moderado" : "normal",
      eventos: eventos.length,
    };
  }

  return {
    anotarEnvio: () => anotar("envio"),
    anotarDesconexion: () => anotar("desconexion"),
    anotarError: (err) => anotar("error", { codigo: codigoDe(err), mensaje: err?.message }),
    anotarEnvioFallido: (err) => anotar("envio_fallido", { codigo: codigoDe(err), mensaje: err?.message }),
    riesgo,
    estado,
    eventos,
  };
}

/**
 * La cola: un solo carril para todos los envíos.
 *
 * @param {object} opciones
 * @param {object} opciones.limitador de `crearLimitador`
 * @param {object} [opciones.salud]     de `crearSalud`
 * @param {function} [opciones.registro] dónde escribir los avisos (console por defecto)
 * @param {number} [opciones.plazoMs]   cuánto se espera una respuesta (2 min)
 * @param {number} [opciones.esperaConexionMs] cuánto se espera a que vuelva (5 min)
 * @param {number} [opciones.esperaTopeMs] cuánto se duerme con el tope alcanzado (60 s)
 */
export function crearCola({
  limitador,
  salud,
  registro = console,
  plazoMs = 120_000,
  esperaConexionMs = 300_000,
  esperaTopeMs = 60_000,
} = {}) {
  const tareas = [];
  const motivosDePausa = new Set();
  let trabajando = false;
  let prioridad = 0;
  let inciertos = 0;
  let ultimoIncierto = 0;
  let avisadoTope = false;

  const pausada = () => motivosDePausa.size > 0;

  function avisarTope() {
    if (avisadoTope) return;
    avisadoTope = true;
    const r = limitador?.resumen?.();
    registro.warn?.(
      `🛡️ Tope diario alcanzado${r ? ` (${r.msgsHoy}/${r.tope} hoy · día ${r.dia})` : ""}: ` +
        `los envíos normales esperan. Ajusta WARMUP_START_MSGS / WARMUP_MAX_MSGS o ANTIBAN=off, y míralo con .warmup`
    );
  }

  function dormir(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function esperarConexion() {
    const fin = Date.now() + esperaConexionMs;
    while (pausada() && Date.now() < fin) await dormir(250);
    return !pausada();
  }

  function encolar(fn, opciones = {}) {
    return new Promise((resolver, rechazar) => {
      tareas.push({
        fn,
        urgente: Boolean(opciones.isPriority || prioridad > 0),
        cuenta: opciones.countsForQuota !== false,
        largo: Number(opciones.messageLength) || 0,
        resolver,
        rechazar,
      });
      if (!trabajando) procesar();
    });
  }

  async function procesar() {
    if (trabajando || pausada()) return;
    trabajando = true;

    while (tareas.length) {
      if (pausada()) {
        trabajando = false;
        return;
      }

      if (limitador && limitador.puedeEnviar()) avisadoTope = false;

      let tarea;
      if (limitador && !limitador.puedeEnviar()) {
        // Con el tope alcanzado solo pasan las urgentes y las que no gastan
        // cuota (reacciones, borrados, ediciones).
        const i = tareas.findIndex((t) => t.urgente || !t.cuenta);
        if (i === -1) {
          avisarTope();
          // Nunca menos de 50 ms: si no, con un tope de prueba la cola se
          // quedaría girando en vacío gastando CPU sin enviar nada.
          await dormir(Math.max(50, esperaTopeMs));
          continue;
        }
        tarea = tareas.splice(i, 1)[0];
      } else {
        tarea = tareas.shift();
      }

      const espera = limitador ? limitador.demora({ urgente: tarea.urgente, largo: tarea.largo }) : 0;
      if (espera > 0) await dormir(espera);

      try {
        const resultado = await conPlazo(tarea.fn(), plazoMs, "envío");
        if (limitador && tarea.cuenta) limitador.anotarEnvio();
        salud?.anotarEnvio();
        tarea.resolver(resultado);
      } catch (err) {
        salud?.anotarEnvioFallido(err);

        // ── Sin respuesta: NO se repite ────────────────────────────────────
        // El envío huérfano puede haber llegado. Repetirlo manda el mensaje
        // dos veces, que es justo lo que más se reporta como spam.
        if (err?.code === CODIGO_INCIERTO) {
          inciertos += 1;
          ultimoIncierto = Date.now();
          if (limitador && tarea.cuenta) limitador.anotarEnvio();
          registro.warn?.(
            `⚠️ Envío sin respuesta tras ${plazoMs} ms: no lo repito para no duplicarlo (van ${inciertos} en esta sesión).`
          );
          tarea.rechazar(err);
          continue;
        }

        // ── Conexión caída: el mensaje espera ──────────────────────────────
        // «Connection Closed» lo lanza Baileys al escribir sobre un socket ya
        // cerrado: el fotograma no salió, así que reintentar no duplica.
        if (esFalloDeConexion(err)) {
          registro.warn?.("🔌 Conexión caída: el mensaje queda en cola y sale al reconectar.");
          const volvio = await esperarConexion();
          if (!volvio) {
            registro.warn?.(`⚠️ La conexión no volvió en ${Math.round(esperaConexionMs / 60000)} min: ese mensaje se pierde.`);
            tarea.rechazar(err);
            continue;
          }
          try {
            const resultado = await conPlazo(tarea.fn(), plazoMs, "envío tras reconectar");
            if (limitador && tarea.cuenta) limitador.anotarEnvio();
            salud?.anotarEnvio();
            tarea.resolver(resultado);
          } catch (err2) {
            salud?.anotarEnvioFallido(err2);
            tarea.rechazar(err2);
          }
          continue;
        }

        // ── Fallo seguro: un reintento, con su espera ──────────────────────
        registro.error?.(`❌ Falló un envío: ${err?.message || err}`);
        try {
          const reintentoMs = limitador ? Math.max(2000, limitador.demora({ largo: tarea.largo })) : 3000;
          await dormir(reintentoMs);
          const resultado = await conPlazo(tarea.fn(), plazoMs, "reintento");
          if (limitador && tarea.cuenta) limitador.anotarEnvio();
          salud?.anotarEnvio();
          tarea.resolver(resultado);
        } catch (err2) {
          if (err2?.code === CODIGO_INCIERTO) {
            inciertos += 1;
            ultimoIncierto = Date.now();
            registro.warn?.("⚠️ El reintento también quedó sin respuesta; no hay un tercer envío.");
          } else {
            salud?.anotarEnvioFallido(err2);
          }
          tarea.rechazar(err2);
        }
      }
    }

    trabajando = false;
  }

  /** Corre `fn` con prioridad: lo que se envíe dentro sale con la espera mínima. */
  async function conPrioridad(fn) {
    prioridad += 1;
    try {
      return await fn();
    } finally {
      prioridad = Math.max(0, prioridad - 1);
    }
  }

  return {
    encolar,
    conPrioridad,
    pausar: (motivo = "manual") => {
      motivosDePausa.add(motivo);
    },
    reanudar: (motivo = "manual") => {
      motivosDePausa.delete(motivo);
      if (!pausada() && !trabajando) procesar();
    },
    motivos: () => [...motivosDePausa],
    pausada,
    largo: () => tareas.length,
    limpiar: () => {
      tareas.length = 0;
    },
    estado: () => ({ enEspera: tareas.length, pausada: pausada(), motivos: [...motivosDePausa], inciertos, ultimoIncierto }),
  };
}

/**
 * Manda por la cola todo lo que salga de este socket.
 *
 * Se parchea `sendMessage` y `relayMessage` una sola vez: los plugins siguen
 * llamando a `sock.sendMessage` como siempre y no hay que tocarlos. Las
 * reacciones, borrados y ediciones no gastan cuota y salen con prioridad (si no,
 * con el tope alcanzado el bot no podría ni quitar un mensaje).
 */
export function envolverSocket(sock, { cola }) {
  if (!sock || sock.__colaUnica) return sock;

  const enviarOriginal = sock.sendMessage.bind(sock);
  const relayOriginal = sock.relayMessage.bind(sock);

  sock.sendMessage = (jid, contenido, opciones) => {
    const cuerpo = contenido && typeof contenido === "object" ? contenido : {};
    const liviano = Boolean(cuerpo.react || cuerpo.delete || cuerpo.edit);
    const largo = typeof cuerpo.text === "string" ? cuerpo.text.length : 0;

    return cola.encolar(() => enviarOriginal(jid, contenido, opciones), {
      isPriority: liviano,
      countsForQuota: !liviano,
      messageLength: largo,
    });
  };

  sock.relayMessage = (jid, mensaje, opciones) =>
    cola.encolar(() => relayOriginal(jid, mensaje, opciones), {
      messageLength: JSON.stringify(mensaje ?? {}).length,
    });

  Object.defineProperty(sock, "__colaUnica", { value: true, enumerable: false });
  return sock;
}

/**
 * El vigilante: mira el riesgo cada 10 s y actúa.
 *
 *   riesgo ≥ 80 → pausa la cola (deja de mandar hasta que baje)
 *   riesgo ≥ 95 → cierra el websocket para que Baileys reconecte
 *   sin señales de vida en 5 min con el socket abierto → lo mismo
 *   tres reconnects seguidos sin alivio → para y avisa (no reinicia solo)
 *
 * Lo último es importante: un bucle de reconexiones es peor que estar caído.
 */
export function crearVigilante({
  cola,
  salud,
  obtenerSock,
  registro = console,
  intervaloMs = 10_000,
  sinSenalMs = 300_000,
  riesgoAlto = 80,
  riesgoCritico = 95,
  maxIntentos = 3,
  enfriamientoMs = 120_000,
} = {}) {
  let reloj = null;
  let ultimaSenal = Date.now();
  let pausadoPorRiesgo = false;
  let intentos = 0;
  let ultimoIntento = 0;
  let revisando = false;
  let ultimoRiesgo = 0;

  const socketAbierto = (sock) => Boolean(sock && (sock.ws?.ready === true || sock.ws?.readyState === 1));

  function latido() {
    ultimaSenal = Date.now();
  }

  function reconectar(motivo) {
    const sock = obtenerSock?.();
    if (!socketAbierto(sock)) return;
    if (Date.now() - ultimoIntento < enfriamientoMs) return;
    intentos += 1;
    ultimoIntento = Date.now();
    if (intentos > maxIntentos) {
      registro.error?.(
        `🛑 Vigilante: ${maxIntentos} reconexiones forzadas sin alivio. Riesgo de bloqueo; revisa sesión y red (no reinicio solo).`
      );
      intentos = 0;
      return;
    }
    registro.warn?.(`🔄 Vigilante: reconectando #${intentos} (${motivo})`);
    try {
      sock.ws.close();
    } catch (err) {
      registro.error?.(`Vigilante: ws.close() falló: ${err.message}`);
    }
  }

  function revisar() {
    if (revisando) return;
    revisando = true;
    try {
      if (!salud || !cola) return;
      const { riesgo } = salud.estado();
      ultimoRiesgo = riesgo;

      if (riesgo >= riesgoAlto && !pausadoPorRiesgo) {
        pausadoPorRiesgo = true;
        cola.pausar("riesgo");
        registro.warn?.(`⚠️ Vigilante: riesgo ${riesgo} — envíos en pausa.`);
      } else if (pausadoPorRiesgo && riesgo < riesgoAlto) {
        pausadoPorRiesgo = false;
        cola.reanudar("riesgo");
        registro.log?.(`✅ Vigilante: riesgo ${riesgo} — envíos reanudados.`);
      }

      const quieto = Date.now() - ultimaSenal;
      if (quieto > sinSenalMs) {
        const sock = obtenerSock?.();
        if (socketAbierto(sock)) reconectar(`sin actividad ${Math.round(quieto / 60000)} min`);
        else registro.warn?.(`Vigilante: sin conexión abierta y ${Math.round(quieto / 60000)} min de silencio.`);
      }

      if (riesgo >= riesgoCritico) reconectar(`riesgo crítico ${riesgo}`);
      if (riesgo < riesgoAlto && intentos > 0) intentos = 0;
    } catch (err) {
      registro.error?.(`Vigilante: ${err.message}`);
    } finally {
      revisando = false;
    }
  }

  function iniciar() {
    if (reloj) return;
    reloj = setInterval(revisar, intervaloMs);
    reloj.unref?.();
  }

  function parar() {
    if (reloj) clearInterval(reloj);
    reloj = null;
  }

  return {
    iniciar,
    parar,
    revisar,
    latido,
    estado: () => ({ riesgo: ultimoRiesgo, pausadoPorRiesgo, intentos }),
  };
}

export default { crearLimitador, crearCola, crearSalud, crearVigilante, envolverSocket };
