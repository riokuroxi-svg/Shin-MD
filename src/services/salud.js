/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  salud.js — qué le pasa al bot, por qué, y qué hacer
//
//  No mide velocidad. Contesta tres preguntas, en este orden:
//
//    1. ¿está fallando?      → estado: sano · degradado · crítico
//    2. ¿por qué?            → causa con la evidencia que la sostiene
//    3. ¿qué hago?           → remedio concreto, no un «revisa los logs»
//
//  La diferencia con un contador suelto: un número no dice nada. «3
//  bloqueados por 463» sin saber que son de contactos nuevos lleva a
//  reiniciar el bot, que es exactamente lo que NO hay que hacer.
//
//  La foto se puede construir desde el motor (`crearFoto`) o desde un
//  informe del banco (`diagnosticar` con cualquier objeto con la misma
//  forma). Diagnosticar es una función pura: entra una foto, sale un
//  veredicto. Así se puede probar con fallos grabados.
// ═══════════════════════════════════════════════════════════════════

export const UMBRALES = {
  colaAviso: 50, // mensajes esperando para salir
  colaCritica: 200,
  inciertosAviso: 1, // envíos de los que no se sabe si llegaron
  riesgoAviso: 50,
  memoriaAvisoMB: 400,
  descartesAviso: 1, // mensajes que nunca se atendieron
  muertosAviso: 1,
};

/**
 * Foto del estado, desde el motor. Todo lo opcional se omite con cuidado:
 * la mitad de estas piezas no existen hasta que se aplican sus parches.
 *
 * @param {object} opciones
 * @param {object} opciones.engine
 * @param {function} [opciones.entrada] devuelve las stats de la puerta de entrada
 * @param {function} [opciones.muertos] devuelve {total, porMotivo} de la cola de muertos
 * @param {function} [opciones.transporte] devuelve stats del conector
 */
export function crearFoto({ engine, entrada, muertos, transporte } = {}) {
  const foto = { ts: Date.now() };

  try {
    foto.motor = {
      estado: engine?.getStateName?.() ?? "DESCONOCIDO",
      uptimeSec: Math.round((engine?.getUptime?.() ?? 0) / 1000),
      grupos: engine?.getGroupCount?.() ?? 0,
    };
  } catch {
    foto.motor = { estado: "DESCONOCIDO" };
  }

  try {
    const q = engine?.getSendQueue?.();
    if (q) {
      const s = typeof q.getStats === "function" ? q.getStats() : {};
      foto.cola = {
        esperando: q.length?.() ?? 0,
        pausada: q.isPaused?.() ?? false,
        motivos: q.motivos?.() ?? [],
        inciertos: s.inciertos ?? 0,
        ultimoIncierto: s.ultimoIncierto ?? 0,
        timelocks: s.timelocks ?? 0,
        rechazados: s.rechazados ?? 0,
        muertos: s.muertos ?? 0,
      };
    }
  } catch {}

  try {
    const th = engine?.getThrottler?.();
    if (th) foto.cuota = th.getStats();
  } catch {}

  try {
    const h = engine?.getHealth?.();
    if (h) foto.salud = h.getStatus();
  } catch {}

  try {
    if (typeof entrada === "function") foto.entrada = entrada();
  } catch {}

  try {
    if (typeof muertos === "function") foto.muertos = muertos();
  } catch {}

  try {
    if (typeof transporte === "function") foto.transporte = transporte();
  } catch {}

  foto.memoriaMB = Math.round(process.memoryUsage().rss / 1048576);
  return foto;
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * El veredicto. Función pura: sólo mira la foto.
 *
 * @param {object} foto
 * @returns {{estado: string, causas: Array<object>, resumen: string}}
 */
export function diagnosticar(foto) {
  const causas = [];
  const cola = foto?.cola || {};
  const cuota = foto?.cuota || {};
  const ent = foto?.entrada || {};
  const muertos = foto?.muertos || {};
  const trans = foto?.transporte || {};
  const motor = foto?.motor || {};

  // ── 463: el bloqueo de cuenta ──────────────────────────────────────
  const timelocks = n(cola.timelocks) + n(trans.timelocks) + n(trans.bloqueadosPorTimelock);
  if (timelocks > 0) {
    causas.push({
      codigo: "TIMELOCK_463",
      gravedad: "alta",
      sintoma: `el servidor está rechazando envíos con error 463 (${timelocks} visto${timelocks === 1 ? "" : "s"})`,
      causa:
        "WhatsApp restringió la cuenta para abrir conversaciones nuevas (reachout timelock). " +
        "No es tu código ni tu red: es una decisión del servidor sobre esta cuenta.",
      remedio:
        "No reinicies ni desvincules: eso no lo levanta y pierde la sesión. Deja de abrir " +
        "conversaciones nuevas, sigue contestando los chats que ya existen, y espera. " +
        "Dura de 24 h a 7 días; insistir lo alarga.",
      evidencia: { timelocks, bloqueadosPorTimelock: n(trans.bloqueadosPorTimelock) },
    });
  }

  // ── Sin conexión ───────────────────────────────────────────────────
  const motivoConexion = (cola.motivos || []).includes("conexion");
  if (motor.estado && motor.estado !== "READY" && motor.estado !== "RUNNING") {
    causas.push({
      codigo: "SIN_CONEXION",
      gravedad: "alta",
      sintoma: `el motor está en estado ${motor.estado}`,
      causa: "la sesión con WhatsApp no está abierta; los envíos se acumulan en la cola",
      remedio:
        "Mirar el último corte en el log antes de tocar nada. Si la sesión caducó, hay que " +
        "volver a vincular con código; si fue un corte de red, la cola sale sola al reconectar.",
      evidencia: { estado: motor.estado, pausadaPorConexion: motivoConexion },
    });
  } else if (motivoConexion) {
    causas.push({
      codigo: "COLA_PAUSADA_POR_CONEXION",
      gravedad: "media",
      sintoma: "la cola está parada esperando la conexión",
      causa: "hubo un corte y los mensajes están esperando a que vuelva",
      remedio: "esperar la reconexión; si pasan más de 5 minutos, el mensaje se descarta y queda anotado",
      evidencia: { motivos: cola.motivos },
    });
  }

  // ── Envíos de los que no se sabe nada ──────────────────────────────
  if (n(cola.inciertos) >= UMBRALES.inciertosAviso) {
    causas.push({
      codigo: "ENVIOS_INCIERTOS",
      gravedad: "media",
      sintoma: `${n(cola.inciertos)} envío(s) quedaron sin respuesta del servidor`,
      causa:
        "la promesa de envío no resolvió a tiempo: puede haber llegado o no. " +
        "El bot no los repite a propósito, para no duplicar.",
      remedio:
        "Revisar esos chats a mano antes de reenviar. Si se repiten, el tiempo de espera " +
        "(SEND_TIMEOUT_MS) está corto para la red que hay.",
      evidencia: { inciertos: n(cola.inciertos), ultimoIncierto: cola.ultimoIncierto || 0 },
    });
  }

  // ── Techo de cola ──────────────────────────────────────────────────
  if (n(cola.rechazados) > 0) {
    causas.push({
      codigo: "COLA_LLENA",
      gravedad: "media",
      sintoma: `${n(cola.rechazados)} mensaje(s) se rechazaron por cola llena`,
      causa: "están llegando más mensajes de los que el ritmo puede sacar; el techo los corta antes de acumular memoria",
      remedio: "bajar el ritmo de quien genera los envíos, o subir el techo si la espera sigue siendo aceptable",
      evidencia: { rechazados: n(cola.rechazados), esperando: n(cola.esperando) },
    });
  } else if (n(cola.esperando) >= UMBRALES.colaAviso) {
    causas.push({
      codigo: "COLA_CRECIENDO",
      gravedad: n(cola.esperando) >= UMBRALES.colaCritica ? "alta" : "baja",
      sintoma: `hay ${n(cola.esperando)} mensajes esperando para salir`,
      causa: "el ritmo de salida es menor que el de llegada",
      remedio: "vigilar si sigue subiendo; si llega al techo, empezarán los rechazos",
      evidencia: { esperando: n(cola.esperando) },
    });
  }

  // ── Tope diario ────────────────────────────────────────────────────
  if (cuota.dailyLimitReached) {
    causas.push({
      codigo: "CUOTA_DIARIA",
      gravedad: "media",
      sintoma: `tope diario alcanzado (${n(cuota.msgsToday)}/${n(cuota.dailyLimit)})`,
      causa: "el perfil del número limita cuántos mensajes salen por día",
      remedio:
        "esperar el reinicio del día; subir el tope sólo si el número tiene meses de uso normal",
      evidencia: { msgsToday: n(cuota.msgsToday), dailyLimit: n(cuota.dailyLimit), dia: n(cuota.day) },
    });
  }

  // ── Mensajes que nunca se atendieron ───────────────────────────────
  if (n(ent.descartados) > 0) {
    causas.push({
      codigo: "ENTRADA_SATURADA",
      gravedad: "media",
      sintoma: `${n(ent.descartados)} mensaje(s) se descartaron al llegar`,
      causa: "llegaron más mensajes a la vez de los que la puerta de entrada admite en espera",
      remedio: "subir ENTRADA_EN_ESPERA, o bajar el trabajo por mensaje; revisar si hay un pico real",
      evidencia: { descartados: n(ent.descartados), enEspera: n(ent.enEspera), pico: n(ent.maxVisto) },
    });
  }

  // ── Cola de muertos ────────────────────────────────────────────────
  if (n(muertos.total) > 0) {
    causas.push({
      codigo: "MENSAJES_PERDIDOS",
      gravedad: "baja",
      sintoma: `${n(muertos.total)} mensaje(s) no salieron y quedaron anotados`,
      causa: "se agotaron los reintentos o se descartaron al apagar; están guardados con su motivo",
      remedio: "revisarlos y reenviarlos de a uno, respetando el ritmo; no en bloque",
      evidencia: { total: n(muertos.total), porMotivo: muertos.porMotivo || {} },
    });
  }

  // ── Salud del conector y memoria ───────────────────────────────────
  if (n(foto?.salud?.riskScore ?? foto?.salud?.riesgo) >= UMBRALES.riesgoAviso) {
    causas.push({
      codigo: "RIESGO_ALTO",
      gravedad: "media",
      sintoma: `el monitor de salud marca riesgo ${n(foto?.salud?.riskScore ?? foto?.salud?.riesgo)}`,
      causa: "se acumularon cortes o fallos de envío en la ventana reciente",
      remedio: "bajar el ritmo y revisar el último corte; el riesgo se enfría solo si no hay más fallos",
      evidencia: foto.salud,
    });
  }

  if (n(foto?.memoriaMB) >= UMBRALES.memoriaAvisoMB) {
    causas.push({
      codigo: "MEMORIA_ALTA",
      gravedad: "baja",
      sintoma: `el proceso usa ${n(foto.memoriaMB)} MB`,
      causa: "cachés y colas acumuladas",
      remedio: "mirar si la memoria crece sin bajar; si lo hace, reiniciar y anotar cuándo empezó",
      evidencia: { memoriaMB: n(foto.memoriaMB) },
    });
  }

  const graves = causas.filter((c) => c.gravedad === "alta").length;
  const estado = graves > 0 ? "critico" : causas.length > 0 ? "degradado" : "sano";

  return { estado, causas, resumen: resumir(foto, causas, estado) };
}

/** Una línea, la que se lee en el móvil. */
function resumir(foto, causas, estado) {
  const cola = foto?.cola || {};
  const cuota = foto?.cuota || {};
  const partes = [];
  if (causas.length) partes.push(causas.map((c) => c.codigo).join(", "));
  else partes.push("nada fuera de rango");
  partes.push(`cola ${n(cola.esperando)}${cola.pausada ? " (parada)" : ""}`);
  partes.push(`inciertos ${n(cola.inciertos)}`);
  if (cuota.dailyLimit) partes.push(`cuota ${n(cuota.msgsToday)}/${n(cuota.dailyLimit)}`);
  return `${estado.toUpperCase()} · ${partes.join(" · ")}`;
}

/**
 * Devuelve `{ foto, veredicto }` para pintarlo o servirlo.
 * @param {object} opciones
 */
export function crearSalud(opciones) {
  function foto() {
    return crearFoto(opciones);
  }
  function veredicto() {
    const f = foto();
    return { foto: f, ...diagnosticar(f) };
  }
  return { foto, veredicto, diagnosticar, linea: () => veredicto().resumen };
}

export default { crearSalud, crearFoto, diagnosticar, UMBRALES };
