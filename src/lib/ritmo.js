/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 *
 * src/lib/ritmo.js — el ritmo con el que se manda, medido como lo mide WhatsApp.
 *
 * El throttler cuenta *mensajes*. Eso está mal por dos motivos: un negocio de
 * verdad no manda 500 mensajes al día, y lo que de verdad gasta reputación no
 * es el mensaje, es **abrir conversación con alguien que no te ha escrito**.
 * La API oficial lo dice sin rodeos: el cupo se cuenta en clientes únicos, y
 * lo que inicia el usuario no gasta nada. Los bots no oficiales se miden igual.
 *
 * De ahí las tres señales de este módulo, y solo tres:
 *
 *   1. CONVERSACIONES NUEVAS — chats fríos abiertos por día, con rampeo.
 *      Contestar a quien te escribió no gasta cupo; escribirle a un
 *      desconocido, sí.
 *   2. RELOJ — de madrugada una persona no contesta ni abre chats. La espera
 *      se estira con una curva suave (nunca un escalón: eso también se nota).
 *   3. TECLEO — WhatsApp lo dice en su documento sobre spam: una cuenta que
 *      manda mensajes sin encender nunca el «escribiendo…» es señal de abuso.
 *
 * Sobre el rendimiento (esto es lo que este archivo tiene de más que una copia
 * del de Levi): las ventanas se llevan con cubetas por minuto en un anillo de
 * tamaño fijo, así que preguntar «¿cuántos envíos en la última hora?» cuesta
 * O(1) y no recorre ni filtra listas. La memoria está acotada por diseño: los
 * mapas se podan por antigüedad y el anillo no crece nunca.
 *
 * Lo que este archivo NO hace: garantizar que una cuenta no caiga. Baja el
 * parecido con un robot; no da inmunidad.
 */
import log from "#logger";

/** Minutos que se recuerdan para el tope por hora. */
const MINUTOS_HORA = 60;

function numeroDeEntorno(nombre, porDefecto) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === "") return porDefecto;
  const n = Number(crudo);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

const apagado = (nombre) => String(process.env[nombre] || "").toLowerCase() === "off";

/**
 * Niveles de caudal.
 *
 * La cuenta que hay detrás (y que conviene tener a la vista):
 *
 *   mensajes por día ≈ MENSAJES_HORA × horas de actividad
 *
 * Con el nivel `normal` (30/h) y 14 horas de actividad salen ~420 al día: por
 * mucho que se suba el tope diario, el cuello de botella es la hora. Para pasar
 * de 2 000 hace falta un nivel `alto`, y eso sube el promedio por hora por
 * encima de las 60 que las guías marcan como zona de peligro.
 *
 * Lo que NO cambia con el nivel: NUEVOS_DIA. Abrir conversación con desconocidos
 * es lo que WhatsApp puntúa, y ahí no se negocia. El caudal alto es para
 * contestar a gente que ya está hablando contigo, que es otra cosa.
 */
export const NIVELES = {
  normal: { mensajesHora: 30, porChatHora: 15 },
  alto: { mensajesHora: 80, porChatHora: 25 },
  maximo: { mensajesHora: 200, porChatHora: 40 },
};

export function nivelPedido() {
  const crudo = String(process.env.RITMO_NIVEL || "normal").toLowerCase().trim();
  return NIVELES[crudo] ? crudo : "normal";
}

/** Ajustes del ritmo. Todo se puede cambiar por entorno, sin tocar código. */
export function ajustesDeRitmo(extra) {
  const a = {
    activo: !apagado("RITMO"),
    // Chats nuevos por día. Las cifras de la comunidad coinciden: por debajo
    // de 20 es zona tranquila; por encima de 50, zona roja.
    nuevosDia: numeroDeEntorno("NUEVOS_DIA", 20),
    nuevosPrimerDia: numeroDeEntorno("NUEVOS_DIA_1", 5),
    nuevosDiaTres: numeroDeEntorno("NUEVOS_DIA_3", 10),
    diasDeRampa: numeroDeEntorno("NUEVOS_RAMPA_DIAS", 7),
    // Por defecto, 30/h: la zona tranquila. `RITMO_NIVEL=alto|maximo` sube el
    // caudal para quien contesta mucho, a sabiendas de lo que implica.
    mensajesHora: numeroDeEntorno("MENSAJES_HORA", NIVELES[nivelPedido()].mensajesHora),
    porChatHora: numeroDeEntorno("POR_CHAT_HORA", NIVELES[nivelPedido()].porChatHora),
    // Ráfagas: una persona manda 3-4 mensajes seguidos y luego se calla. Se
    // permiten sin gastar la ventana de la hora, pero con un techo.
    rafaga: numeroDeEntorno("RAFAGA", 4),
    // Un grupo pesa más: lo que se manda a un grupo lo ven muchos de golpe.
    factorGrupo: Number(process.env.FACTOR_GRUPO ?? 2),
    calienteMin: numeroDeEntorno("CALIENTE_MIN", 60),
    silencioDesde: numeroDeEntorno("SILENCIO_DESDE", 2),
    silencioHasta: numeroDeEntorno("SILENCIO_HASTA", 6),
    tecleoWpm: numeroDeEntorno("TECLEO_WPM", 45),
    tecleoMinMs: numeroDeEntorno("TECLEO_MIN_MS", 700),
    tecleoMaxMs: numeroDeEntorno("TECLEO_MAX_MS", 4000),
    presencia: !apagado("PRESENCIA"),
  };
  return extra ? { ...a, ...extra } : a;
}

/**
 * Qué tan de noche es una hora: 1 a las 3, 0 de 8 a 22. Curva suave.
 *
 * @param {number|Date} cuando hora (0-23) o momento
 * @param {object} [ajustes]
 * @returns {{hora:number, factor:number, madrugada:boolean}}
 */
export function curvaCircadiana(cuando = new Date(), ajustes = ajustesDeRitmo()) {
  // Un número de 0 a 23 es una hora; uno mayor es un instante. Sin esta
  // distinción, pasar la hora a mano se lee como milisegundos del año 1970.
  const fecha =
    typeof cuando === "number" && cuando >= 0 && cuando < 24
      ? { getHours: () => cuando }
      : cuando instanceof Date
        ? cuando
        : new Date(cuando);
  const hora = fecha.getHours();
  // Distancia al centro de la noche (3:00), de 0 a 5 horas.
  const lejos = Math.min(1, Math.abs(hora - 3) / 5);
  const noche = 0.5 * (1 + Math.cos(Math.PI * lejos));
  return {
    hora,
    factor: Number((0.8 + 1.7 * noche).toFixed(3)),
    madrugada: hora >= ajustes.silencioDesde && hora < ajustes.silencioHasta,
  };
}

/**
 * Lo que tardaría una persona en escribir ese texto.
 *
 * Se acota por arriba a propósito: un humano también pega y manda. Nadie se
 * queda medio minuto viendo «escribiendo…» por un menú.
 *
 * @param {number|string} texto o su largo
 * @param {object} [ajustes]
 * @returns {{ms:number, segundos:number}}
 */
export function planDeTecleo(texto = "", ajustes = ajustesDeRitmo()) {
  const largo = typeof texto === "number" ? texto : String(texto || "").length;
  const letrasPorSegundo = Math.max(1, (ajustes.tecleoWpm * 5) / 60);
  const segundos = Math.min(
    ajustes.tecleoMaxMs / 1000,
    Math.max(ajustes.tecleoMinMs / 1000, largo / letrasPorSegundo),
  );
  return { ms: Math.round(segundos * 1000), segundos: Number(segundos.toFixed(1)) };
}

/**
 * Un contador de ventana deslizante por cubetas.
 *
 * Cada cubeta guarda el minuto al que pertenece y cuántos eventos lleva. Al
 * sumar se descartan las viejas, así que la consulta es O(60) en el peor caso
 * y O(1) en el normal (solo la cubeta del minuto actual cambia). No crece
 * nunca: memoria fija.
 */
function cubetas({ minutos = MINUTOS_HORA } = {}) {
  const anillo = new Array(minutos).fill(null);
  let total = 0;

  const indice = (ms) => Math.floor(ms / 60000) % minutos;

  function podar(ms) {
    const corte = Math.floor(ms / 60000) - minutos + 1;
    for (let i = 0; i < minutos; i++) {
      const c = anillo[i];
      if (c && c.minuto < corte) {
        total -= c.cuenta;
        anillo[i] = null;
      }
    }
  }

  return {
    sumar(ms) {
      const minuto = Math.floor(ms / 60000);
      const i = indice(ms);
      const c = anillo[i];
      if (c && c.minuto === minuto) c.cuenta += 1;
      else {
        if (c) total -= c.cuenta;
        anillo[i] = { minuto, cuenta: 1 };
      }
      total += 1;
    },
    contar(ms) {
      podar(ms);
      return total;
    },
    get total() {
      return total;
    },
  };
}

/**
 * El presupuesto de conversaciones, con memoria en la base y reloj inyectable.
 *
 * @param {object} [opciones]
 * @param {object} [opciones.estado]   dónde vive (db.ritmo): sobrevive al reinicio
 * @param {object} [opciones.ajustes]
 * @param {function} [opciones.ahora]  reloj, para poder probarlo sin esperar
 */
export function crearRitmo({ estado, ajustes, ahora } = {}) {
  const cfg = ajustesDeRitmo(ajustes);
  const reloj = typeof ahora === "function" ? ahora : () => Date.now();
  const s = estado || {};

  s.inicio ||= new Date(reloj()).toISOString().slice(0, 10);
  s.ultimoDia ||= new Date(reloj()).toISOString().slice(0, 10);
  s.salidasHoy = Number(s.salidasHoy) || 0;
  s.chatsNuevos ||= {}; // jid → día en que se le abrió conversación
  s.entrantes ||= {}; // jid → instante del último mensaje recibido

  const hora = cubetas();
  const porChat = new Map();
  // Ráfaga: envíos seguidos sin esperar, con su propio techo.
  let rafagaActual = 0;
  let ultimoEnvio = 0;

  // El factor circadiano se recalcula como mucho una vez por minuto: es una
  // función de la hora, no del envío.
  let cacheMinuto = -1;
  let cacheFactor = { factor: 1, madrugada: false, hora: 0 };
  function ahoraFactor() {
    const t = reloj();
    const minuto = Math.floor(t / 60000);
    if (minuto !== cacheMinuto) {
      cacheMinuto = minuto;
      cacheFactor = curvaCircadiana(t, cfg);
    }
    return cacheFactor;
  }

  function revisarDia(t = reloj()) {
    const dia = new Date(t).toISOString().slice(0, 10);
    if (s.ultimoDia !== dia) {
      s.ultimoDia = dia;
      s.salidasHoy = 0;
      s.chatsNuevos = {}; // el cupo de conversaciones es diario
    }
    return dia;
  }

  function cubetasDelChat(jid) {
    let c = porChat.get(jid);
    if (!c) {
      c = cubetas();
      porChat.set(jid, c);
      // Poda: si hay demasiados chats vigilados, se sueltan los más viejos.
      if (porChat.size > 500) {
        const primero = porChat.keys().next().value;
        if (primero !== jid) porChat.delete(primero);
      }
    }
    return c;
  }

  /** Cuántos chats nuevos permite abrir hoy (sube con los días de vida). */
  function cupoNuevos(t = reloj()) {
    if (!cfg.diasDeRampa) return cfg.nuevosDia;
    const inicio = new Date(`${s.inicio}T00:00:00Z`).getTime();
    if (!Number.isFinite(inicio)) return cfg.nuevosDia;
    const dias = Math.max(0, Math.floor((t - inicio) / 86400000));
    if (dias < 3) return cfg.nuevosPrimerDia;
    if (dias < cfg.diasDeRampa) return cfg.nuevosDiaTres;
    return cfg.nuevosDia;
  }

  function abiertosHoy(t = reloj()) {
    const dia = revisarDia(t);
    let n = 0;
    for (const d of Object.values(s.chatsNuevos)) if (d === dia) n++;
    return n;
  }

  /** ¿Nos escribió hace poco? Entonces contestarle no es acercarse. */
  function caliente(jid, t = reloj()) {
    const ultimo = Number(s.entrantes[jid]) || 0;
    return ultimo > 0 && t - ultimo <= cfg.calienteMin * 60000;
  }

  /**
   * ¿Se puede mandar esto ahora, y si no, cuánto falta?
   *
   * @param {string} jid
   * @param {object} [op]
   * @param {boolean} [op.urgente] `.menu`, `.ping`: nunca se frenan
   * @param {number} [op.ahora]
   * @returns {{ok:boolean, motivo:string|null, esperarMs:number, detalle:object}}
   */
  function evaluar(jid, { urgente = false, ahora: t = reloj() } = {}) {
    if (!cfg.activo || urgente) {
      return { ok: true, motivo: null, esperarMs: 0, detalle: {} };
    }
    revisarDia(t);
    const relojAhora = ahoraFactor();
    const esCaliente = caliente(jid, t);

    if (!esCaliente) {
      if (relojAhora.madrugada) {
        // Se espera a que acabe la madrugada, como mucho una hora: más que
        // eso en una cola es lo mismo que perder el mensaje.
        const fin = new Date(t);
        fin.setHours(cfg.silencioHasta, 0, 0, 0);
        const esperarMs = Math.min(3600000, Math.max(0, fin.getTime() - t));
        return { ok: false, motivo: "madrugada", esperarMs, detalle: relojAhora };
      }
      const cupo = cupoNuevos(t);
      const abiertos = abiertosHoy(t);
      if (abiertos >= cupo) {
        const fin = new Date(t);
        fin.setUTCHours(24, 0, 0, 0);
        const esperarMs = Math.min(3600000, Math.max(0, fin.getTime() - t));
        return { ok: false, motivo: "chats-nuevos", esperarMs, detalle: { cupo, abiertos } };
      }
    }

    // Un grupo cuenta como varios: el mensaje llega a mucha gente de golpe.
    const peso = String(jid).endsWith("@g.us") ? Math.max(1, cfg.factorGrupo) : 1;
    const enLaHora = hora.contar(t) + (peso - 1) * salidasGrupo(t);

    if (enLaHora >= cfg.mensajesHora) {
      return {
        ok: false,
        motivo: "por-hora",
        esperarMs: 60000,
        detalle: { limite: cfg.mensajesHora, enLaHora },
      };
    }
    if (jid) {
      const delChat = cubetasDelChat(jid).contar(t);
      if (delChat >= cfg.porChatHora) {
        return {
          ok: false,
          motivo: "por-chat",
          esperarMs: 60000,
          detalle: { limite: cfg.porChatHora, delChat },
        };
      }
    }

    // Ráfaga: las primeras N van seguidas dentro del mismo minuto (es lo que
    // hace una persona cuando escribe tres líneas). No salta el tope por chat
    // ni el de la hora: solo ahorra la espera entre mensajes cortos.
    if (rafagaActual > 0 && rafagaActual < cfg.rafaga && t - ultimoEnvio < 30_000) {
      return { ok: true, motivo: null, esperarMs: 0, detalle: { rafaga: rafagaActual } };
    }
    return { ok: true, motivo: null, esperarMs: 0, detalle: { lento: relojAhora.factor } };
  }

  /** Cuántos envíos a grupos hubo en la última hora (para pesar el cupo). */
  function salidasGrupo(t) {
    let n = 0;
    for (const [jid, c] of porChat) {
      if (String(jid).endsWith("@g.us")) n += c.contar(t);
    }
    return n;
  }

  /** Apunta un mensaje recibido: enciende la calidez de ese chat. */
  function anotarEntrante(jid, t = reloj()) {
    if (!jid) return;
    s.entrantes[jid] = t;
    // Memoria acotada: los 500 chats más recientes y nada más.
    const claves = Object.keys(s.entrantes);
    if (claves.length > 500) {
      claves
        .sort((a, b) => (s.entrantes[a] > s.entrantes[b] ? 1 : -1))
        .slice(0, claves.length - 500)
        .forEach((k) => delete s.entrantes[k]);
    }
  }

  /** Apunta un envío. Si el chat estaba frío, además es conversación nueva. */
  function anotarSalida(jid, t = reloj()) {
    if (!jid) return;
    const dia = revisarDia(t);
    const eraCaliente = caliente(jid, t);
    hora.sumar(t);
    cubetasDelChat(jid).sumar(t);
    // La ráfaga se corta si pasa medio minuto: entonces ya es otra conversación.
    rafagaActual = t - ultimoEnvio < 30_000 ? rafagaActual + 1 : 1;
    ultimoEnvio = t;
    s.salidasHoy += 1;
    if (!eraCaliente && !s.chatsNuevos[jid]) {
      s.chatsNuevos[jid] = dia;
    }
  }

  /** Multiplicador de espera por la hora que es (1 = sin efecto). */
  function factorHorario(t = reloj()) {
    return cfg.activo ? ahoraFactor().factor : 1;
  }

  function resumen(t = reloj()) {
    const relojAhora = ahoraFactor();
    return {
      activo: cfg.activo,
      presencia: cfg.presencia,
      hora: relojAhora.hora,
      factor: relojAhora.factor,
      madrugada: relojAhora.madrugada,
      nuevosHoy: abiertosHoy(t),
      cupoNuevos: cupoNuevos(t),
      salidasHoy: s.salidasHoy,
      porHora: hora.contar(t),
      limiteHora: cfg.mensajesHora,
      rafaga: cfg.rafaga,
      chatsVigilados: porChat.size,
    };
  }

  return {
    evaluar,
    anotarEntrante,
    anotarSalida,
    caliente,
    factorHorario,
    planDeTecleo: (texto) => planDeTecleo(texto, cfg),
    resumen,
    ajustes: cfg,
    estado: s,
  };
}

/** Escribe el aviso del ritmo una sola vez por episodio. */
let avisado = null;
export function avisarRitmo(motivo) {
  if (avisado === motivo) return;
  avisado = motivo;
  const que =
    motivo === "chats-nuevos"
      ? "ya se abrieron todas las conversaciones nuevas de hoy"
      : motivo === "madrugada"
        ? "es de madrugada y ese chat no ha escrito"
        : motivo === "por-hora"
          ? "se llegó al tope de mensajes por hora"
          : motivo === "por-chat"
            ? "se llegó al tope de mensajes seguidos en ese chat"
            : "el envío espera";
  log.warn(`Ritmo: ${que}. Contestar a quien ya escribió no se frena.`);
}

export default { crearRitmo, curvaCircadiana, planDeTecleo, ajustesDeRitmo, avisarRitmo };
