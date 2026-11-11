/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lid.js — Una sola persona, dos identificadores
//
//  WhatsApp dejó de mandar siempre el teléfono. El mismo usuario puede
//  llegar como:
//
//      5215512345678@s.whatsapp.net   ← PN  (el número de siempre)
//      123456789012345@lid            ← LID (identificador interno)
//
//  No son dos usuarios. Si el bot los trata como dos, pasan tres cosas:
//  monedas duplicadas, el dueño deja de ser dueño y el admin del grupo
//  deja de ser admin ("no coincide el número").
//
//  La red SOLO resuelve teléfono → LID. Para saber el teléfono de un LID
//  no existe consulta: únicamente se puede contestar con lo que ya se vio
//  antes en el tráfico. Por eso este módulo, más que "resolver", sirve
//  para ACORDARSE: guarda cada pareja que aparece y la devuelve después.
//
//  Qué hace y qué no:
//   · Regla 1: la llave de la base es el TELÉFONO siempre que se conozca,
//     para que la economía siga cuadrando con los datos ya guardados.
//   · Regla 2: si solo hay LID y no se conoce el teléfono, la llave es el
//     LID. Se prefiere una llave fea a perder el mensaje; en cuanto se
//     aprenda la pareja, las dos cuentas se fusionan.
//   · Regla 3: la pareja se pregunta primero al CONECTOR. Desde Baileys 7
//     la librería guarda los pares LID ↔ teléfono en el propio auth state,
//     así que "¿de quién es este LID?" se contesta en local, sin red. La
//     consulta que sí sale a internet es la contraria (teléfono → LID) y
//     solo se usa cuando alguien la pide a propósito.
//
//  Este archivo no toca la base: quien quiera persistencia llama a
//  conectarBackend() (lo hace boot/index.js con #storage/identities).
//  Así las pruebas y los comandos sueltos funcionan sin abrir nada.
// ═══════════════════════════════════════════════════════════════════

import log from "#logger";
import { normalizeJid, esLid, esTelefono, usuarioDe, mismoNumero } from "./jid.js";

// Tope de la caché en memoria. Cada entrada son dos strings: 4096 parejas
// son unos cientos de KB, suficiente para un bot de grupos y vecindarios.
const MAX_MEMORIA = 4096;

const pnPorLid = new Map();
const lidPorPn = new Map();

/** Backend opcional de persistencia (ver src/storage/identities.js). */
let backend = null;

/**
 * Conector vivo (el socket de Baileys). Se usa para preguntarle las parejas
 * que ya conoce: la 7.x las persiste en el auth state, así que esa consulta
 * es local. Sin socket todo sigue funcionando con lo que haya en memoria y
 * en la base; simplemente se sabe menos.
 */
let sesion = null;

// Los metadatos de un grupo se cachean y se reutilizan: no hace falta
// recorrer los participantes dos veces para lo mismo.
let metasVistas = new WeakSet();

const contador = { aprendidas: 0, fusiones: 0, fallos: 0, olvidadas: 0 };

// Fusiones que fallaron: lid → instante del último intento. Se reintentan
// (como mucho una vez por REINTENTO_FUSION_MS) la próxima vez que aparezca
// la pareja, en vez de darlas por hechas.
const REINTENTO_FUSION_MS = 60_000;
const MAX_PENDIENTES = 500;
const fusionesPendientes = new Map();

// Consultas a la red (teléfono → LID): jid → último intento. Evita que un
// comando público (.lid) dispare una consulta a WhatsApp por cada uso.
const REPETIR_RED_MS = 10 * 60_000;
const MAX_CONSULTAS_RED = 500;
const consultasDeRed = new Map();

function recortar(mapa) {
  while (mapa.size > MAX_MEMORIA) {
    const primera = mapa.keys().next().value;
    mapa.delete(primera);
    contador.olvidadas++;
  }
}

function recordar(lidJid, pnJid) {
  if (!lidJid || !pnJid) return;
  // Reinsertar mueve la pareja al final: lo viejo cae primero.
  pnPorLid.delete(lidJid);
  pnPorLid.set(lidJid, pnJid);
  recortar(pnPorLid);
  lidPorPn.delete(pnJid);
  lidPorPn.set(pnJid, lidJid);
  recortar(lidPorPn);
}

/** Un fallo de base no puede tumbar el procesado de mensajes: se cuenta. */
function avisarFallo(que, err) {
  contador.fallos++;
  if (contador.fallos === 1 || contador.fallos % 500 === 0) {
    log.warn("[lid] " + que + ": " + (err?.message || err) + " (fallos: " + contador.fallos + ")");
  }
}

/**
 * Conecta la persistencia. `backend` debe traer:
 *   pnPorLid(lid), lidPorPn(pn), guardar(lid, pn) y, si puede, fusionar(lid, pn)
 * y contar(). Los métodos son síncronos (node:sqlite lo es).
 */
export function conectarBackend(nuevo) {
  backend = nuevo || null;
  return api;
}

/**
 * Engancha el socket para poder preguntarle las parejas al conector.
 * Se llama al crear la sesión (src/core/socket.js).
 */
export function conectarSesion(sock) {
  sesion = sock || null;
  return api;
}

/** ¿Hay conector al cual preguntar? (lo muestra .lid y /health) */
export function conectorActivo() {
  return !!sesion?.signalRepository?.lidMapping;
}

/** Solo para pruebas: deja el módulo como recién importado. */
export function reiniciar() {
  pnPorLid.clear();
  lidPorPn.clear();
  fusionesPendientes.clear();
  consultasDeRed.clear();
  backend = null;
  sesion = null;
  contador.aprendidas = 0;
  contador.fusiones = 0;
  contador.fallos = 0;
  contador.olvidadas = 0;
  metasVistas = new WeakSet();
}

/**
 * Guarda una pareja LID ↔ teléfono. Idempotente.
 *
 * @param {string} lidJid  JID `@lid` (o `@hosted.lid`)
 * @param {string} pnJid   JID `@s.whatsapp.net`
 * @param {{fusionar?: boolean}} [opciones] fusionar: false evita tocar la base
 * @returns {boolean} true si era nueva
 */
export function aprender(lidJid, pnJid, opciones = {}) {
  const lid = normalizeJid(lidJid);
  const pn = normalizeJid(pnJid);
  if (!esLid(lid) || !esTelefono(pn)) return false;
  if (usuarioDe(lid) === usuarioDe(pn)) return false;

  const yaEstaba = pnPorLid.get(lid) === pn && lidPorPn.get(pn) === lid;
  const ultimoIntento = fusionesPendientes.get(lid);
  const reintentar = yaEstaba && ultimoIntento !== undefined &&
    Date.now() - ultimoIntento >= REINTENTO_FUSION_MS;
  recordar(lid, pn);
  if (yaEstaba && !reintentar) return false;

  if (!yaEstaba) contador.aprendidas++;

  if (backend) {
    if (!yaEstaba) {
      try {
        backend.guardar(lid, pn);
      } catch (err) {
        avisarFallo("guardar pareja", err);
      }
    }
    if (opciones.fusionar !== false && typeof backend.fusionar === "function") {
      try {
        if (backend.fusionar(lid, pn)) contador.fusiones++;
        fusionesPendientes.delete(lid);
      } catch (err) {
        avisarFallo("fusionar cuentas", err);
        fusionesPendientes.set(lid, Date.now());
        if (fusionesPendientes.size > MAX_PENDIENTES) {
          fusionesPendientes.delete(fusionesPendientes.keys().next().value);
        }
      }
    }
  }
  return !yaEstaba;
}

/** Teléfono de un LID ("" si todavía no se conoce). */
export function pnDeLid(lidJid) {
  const lid = normalizeJid(lidJid);
  if (!esLid(lid)) return "";
  const enMemoria = pnPorLid.get(lid);
  if (enMemoria) return enMemoria;
  if (!backend) return "";
  try {
    const pn = normalizeJid(backend.pnPorLid(lid) || "");
    if (esTelefono(pn)) {
      recordar(lid, pn);
      return pn;
    }
  } catch (err) {
    avisarFallo("leer LID→teléfono", err);
  }
  return "";
}

/** LID de un teléfono ("" si todavía no se conoce). */
export function lidDePn(pnJid) {
  const pn = normalizeJid(pnJid);
  if (!esTelefono(pn)) return esLid(pn) ? pn : "";
  const enMemoria = lidPorPn.get(pn);
  if (enMemoria) return enMemoria;
  if (!backend) return "";
  try {
    const lid = normalizeJid(backend.lidPorPn(pn) || "");
    if (esLid(lid)) {
      recordar(lid, pn);
      return lid;
    }
  } catch (err) {
    avisarFallo("leer teléfono→LID", err);
  }
  return "";
}

/**
 * Resuelve quién es un JID. `alt` es el identificador alternativo que
 * WhatsApp manda en el propio mensaje (participantPn / senderPn /
 * participantLid / senderLid): cuando viene, es gratis y fiable.
 *
 * @param {string} jid
 * @param {string} [alt]
 * @returns {{key: string, pn: string, lid: string}}
 */
export function resolver(jid, alt = "") {
  const base = normalizeJid(jid);
  const alterno = normalizeJid(alt);
  if (!base) return { key: "", pn: "", lid: "" };

  if (esLid(base)) {
    const lid = base;
    const pn = esTelefono(alterno) ? alterno : pnDeLid(lid);
    if (pn) aprender(lid, pn);
    return { key: pn || lid, pn, lid };
  }

  if (esTelefono(base)) {
    const pn = base;
    const lid = esLid(alterno) ? alterno : lidDePn(pn);
    if (lid) aprender(lid, pn);
    return { key: pn, pn, lid };
  }

  // Grupo, canal, estado: no son una persona.
  return { key: base, pn: "", lid: "" };
}

/** Llave estable para la base: el teléfono si se conoce, si no el LID. */
export function clave(jid) {
  return resolver(jid).key;
}

/**
 * ¿Los dos JID son la misma persona? Compara la llave, el teléfono (con la
 * regla mexicana 521 = 52) y el LID. Es lo que usan los permisos en vez de
 * comparar cadenas a pelo.
 */
export function mismaPersona(a, b) {
  if (!a || !b) return false;
  const ia = resolver(a);
  const ib = resolver(b);
  if (!ia.key || !ib.key) return false;
  if (ia.key === ib.key) return true;
  if (ia.pn && ib.pn && mismoNumero(ia.pn, ib.pn)) return true;
  if (ia.lid && ib.lid && usuarioDe(ia.lid) === usuarioDe(ib.lid)) return true;
  return false;
}

/**
 * Las dos caras de quien manda, venga la clave como venga.
 *
 * Baileys 6.x colgaba el identificador alternativo en campos propios:
 *   key.participant   + key.participantPn / key.participantLid   (grupos)
 *   key.remoteJid     + key.senderPn     / key.senderLid         (privados)
 *
 * La 7.x adoptó el esquema de WhatsApp Web: `addressingMode` dice con qué
 * cara se direccionó el chat y el "otro" identificador viaja en `*Alt`:
 *   grupos:   key.participant   + key.participantAlt
 *   privados: key.remoteJid     + key.remoteJidAlt
 *
 * Aquí se aceptan las dos formas, así una sesión vieja y una nueva conviven
 * sin migrar nada: se recogen todos los JID de la clave, el primero que sea
 * LID y el primero que sea teléfono son, por definición, la misma persona.
 *
 * @param {object} key  clave del mensaje (WAMessage.key)
 * @returns {{lid: string, pn: string}} una cara puede venir vacía
 */
export function parejaDeClave(key) {
  if (!key || typeof key !== "object") return { lid: "", pn: "" };
  const jid = (x) => normalizeJid(x || "");
  const cara = (a, b) => {
    const x = jid(a);
    const y = jid(b);
    if (esLid(x) && esTelefono(y)) return { lid: x, pn: y };
    if (esTelefono(x) && esLid(y)) return { lid: y, pn: x };
    return null;
  };

  // 1) Parejas declaradas: cada identificador con SU alternativo. Es el
  // orden que importa: en un estado (status@broadcast) y en algunos
  // mensajes de sistema conviven `participant`/`participantAlt` de una
  // persona y `remoteJid`/`remoteJidAlt` de otra, y emparejar por "el
  // primer LID con el primer teléfono" uniría a dos desconocidos.
  const declaradas = [
    cara(key.participant, key.participantAlt),
    cara(key.remoteJid, key.remoteJidAlt),
    cara(key.participant, key.participantLid),
    cara(key.participant, key.participantPn),
    cara(key.remoteJid, key.senderLid),
    cara(key.remoteJid, key.senderPn),
    cara(key.participantLid, key.participantPn),
  ].filter(Boolean);
  if (declaradas.length) return declaradas[0];

  // 2) Sin pareja declarada: se recogen todas las caras. Solo se usa cuando
  // no hay nada mejor (una clave con una cara sola, o formas exóticas).
  const formas = [
    key.participant,
    key.participantAlt,
    key.participantLid,
    key.participantPn,
    key.remoteJid,
    key.remoteJidAlt,
    key.senderLid,
    key.senderPn,
  ]
    .map(jid)
    .filter(Boolean);
  const lid = formas.find((x) => esLid(x)) || "";
  // El teléfono propio del chat no puede ser el compañero de otro LID: si
  // hay un LID, se busca el teléfono en las mismas formas; si no lo hay, la
  // pareja queda incompleta a propósito.
  const pn = lid ? formas.find((x) => esTelefono(x)) || "" : "";
  return { lid, pn };
}

/**
 * Pregunta la pareja al conector.
 *
 * LID → teléfono es LOCAL (el mapa vive en el auth state): sirve en
 * cualquier mensaje, sin red y sin riesgo para el número.
 * Teléfono → LID puede salir a internet (usync), así que solo se hace
 * cuando `red` es true: el comando .lid, nunca el camino caliente.
 *
 * @param {string} jid
 * @param {{red?: boolean}} [opciones]
 * @returns {Promise<string>} la cara contraria, "" si no se conoce
 */
export async function resolverConector(jid, opciones = {}) {
  const limpio = normalizeJid(jid || "");
  const store = sesion?.signalRepository?.lidMapping;
  if (!limpio || !store) return "";

  try {
    if (esLid(limpio)) {
      const pn = normalizeJid((await store.getPNForLID(limpio)) || "");
      if (esTelefono(pn)) {
        aprender(limpio, pn);
        return pn;
      }
      return "";
    }
    if (esTelefono(limpio) && opciones.red) {
      const conocido = lidDePn(limpio);
      if (conocido) return conocido;
      const ultima = consultasDeRed.get(limpio);
      if (ultima !== undefined && Date.now() - ultima < REPETIR_RED_MS) return "";
      consultasDeRed.set(limpio, Date.now());
      if (consultasDeRed.size > MAX_CONSULTAS_RED) {
        consultasDeRed.delete(consultasDeRed.keys().next().value);
      }
      const lidJid = normalizeJid((await store.getLIDForPN(limpio)) || "");
      if (esLid(lidJid)) {
        aprender(lidJid, limpio);
        return lidJid;
      }
    }
  } catch (err) {
    avisarFallo("consultar al conector", err);
  }
  return "";
}

/**
 * Si el mensaje solo trae una cara, se le pregunta al conector en segundo
 * plano. Nunca bloquea ni rompe el procesado: si falla, se cuenta y ya.
 */
export function refrescarDesdeConector(key) {
  const { lid: lidJid, pn } = parejaDeClave(key);
  if (!lidJid || pn || !conectorActivo()) return;
  void resolverConector(lidJid).catch(() => {});
}

/**
 * Aprende la pareja que viaja en la clave de un mensaje. Se llama en cada
 * mensaje entrante (es barato: casi siempre son dos búsquedas en memoria).
 *
 * @returns {{lid: string, pn: string}} lo que traía la clave
 */
export function aprenderDeMensaje(key) {
  const pareja = parejaDeClave(key);
  if (pareja.lid && pareja.pn) aprender(pareja.lid, pareja.pn);
  return pareja;
}

/**
 * Aprende de una lista de participantes de grupo. Baileys entrega
 * `{ id, jid, lid, admin }`: si `id` es el LID, `jid` trae el teléfono.
 */
export function aprenderDeParticipantes(participantes) {
  if (!Array.isArray(participantes)) return 0;
  let nuevas = 0;
  for (const p of participantes) {
    if (!p) continue;
    const formas = [p.id, p.jid, p.phoneNumber, p.lid]
      .map((x) => normalizeJid(x || ""))
      .filter(Boolean);
    const elLid = formas.find((x) => esLid(x));
    const elPn = formas.find((x) => esTelefono(x));
    if (elLid && elPn && aprender(elLid, elPn)) nuevas++;
  }
  return nuevas;
}

/** Igual que arriba, pero desde los metadatos completos del grupo. */
export function aprenderDeGrupo(meta) {
  if (!meta || typeof meta !== "object") return 0;
  if (metasVistas.has(meta)) return 0;
  metasVistas.add(meta);
  let nuevas = aprenderDeParticipantes(meta.participants);
  const formas = [meta.owner, meta.ownerJid, meta.subjectOwnerJid]
    .map((x) => normalizeJid(x || ""))
    .filter(Boolean);
  const elLid = formas.find((x) => esLid(x));
  const elPn = formas.find((x) => esTelefono(x));
  if (elLid && elPn && aprender(elLid, elPn)) nuevas++;
  return nuevas;
}

/** Números para el diagnóstico (.lid) y /health. */
export function estadisticas() {
  let guardadas = null;
  if (backend && typeof backend.contar === "function") {
    try {
      guardadas = backend.contar();
    } catch (err) {
      avisarFallo("contar parejas", err);
    }
  }
  return {
    enMemoria: pnPorLid.size,
    guardadas,
    aprendidas: contador.aprendidas,
    fusiones: contador.fusiones,
    fallos: contador.fallos,
    persistencia: !!backend,
    conector: conectorActivo(),
  };
}

const api = {
  conectarBackend,
  conectarSesion,
  conectorActivo,
  resolverConector,
  refrescarDesdeConector,
  parejaDeClave,
  reiniciar,
  aprender,
  pnDeLid,
  lidDePn,
  resolver,
  clave,
  mismaPersona,
  aprenderDeMensaje,
  aprenderDeParticipantes,
  aprenderDeGrupo,
  estadisticas,
};

export default api;
