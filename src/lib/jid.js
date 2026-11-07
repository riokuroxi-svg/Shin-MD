/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  jid.js — Utilidades de JID, sin dependencias
//
//  Vive aparte de serialize.js porque lid.js las necesita y serialize
//  importa lid.js: si las dos se importaran entre sí, ESM dejaría
//  exports a medio inicializar (el clásico "Cannot access before
//  initialization", que ya mordió una vez en este repo con botJid).
//
//  Aquí no hay estado ni red: solo texto.
// ═══════════════════════════════════════════════════════════════════

export const SERVIDOR_PN = "@s.whatsapp.net";
export const SERVIDOR_GRUPO = "@g.us";
export const SERVIDOR_CANAL = "@newsletter";
export const SERVIDOR_ESTADO = "@broadcast";
/** WhatsApp ya usa dos dominios para el identificador interno. */
export const SERVIDORES_LID = ["@lid", "@hosted.lid"];

/** ¿Es un chat de grupo? */
export function esGrupo(jid) {
  return typeof jid === "string" && jid.endsWith(SERVIDOR_GRUPO);
}

/** ¿Es un canal (newsletter)? */
export function esCanal(jid) {
  return typeof jid === "string" && jid.endsWith(SERVIDOR_CANAL);
}

/**
 * ¿Es un LID? Cubre `@lid` y el nuevo `@hosted.lid` (dispositivos
 * alojados). Ambos son "la misma persona" que su teléfono.
 */
export function esLid(jid) {
  if (typeof jid !== "string") return false;
  return SERVIDORES_LID.some((s) => jid.endsWith(s));
}

/** ¿Es un teléfono (PN)? */
export function esTelefono(jid) {
  return typeof jid === "string" && jid.endsWith(SERVIDOR_PN);
}

/** Servidor del JID ("s.whatsapp.net", "lid", "g.us"…), sin la arroba. */
export function servidorDe(jid) {
  if (typeof jid !== "string") return "";
  const i = jid.lastIndexOf("@");
  return i === -1 ? "" : jid.slice(i + 1);
}

/** Parte de usuario del JID, con el dispositivo quitado. */
export function usuarioDe(jid) {
  if (typeof jid !== "string" || !jid) return "";
  const sinServidor = jid.split("@")[0];
  return sinServidor.split(":")[0];
}

/** Quita el sufijo de dispositivo (`:12`) sin tocar el servidor. */
export function sinDispositivo(jid) {
  if (typeof jid !== "string") return "";
  const i = jid.lastIndexOf("@");
  if (i === -1) return jid.split(":")[0];
  return jid.slice(0, i).split(":")[0] + jid.slice(i);
}

/**
 * México: WhatsApp conserva en muchos JID el formato móvil viejo
 * 52 + 1 + 10 dígitos (13 dígitos), mientras la numeración vigente es
 * 52 + 10 (12 dígitos). Para COMPARAR se reduce todo a 12 dígitos, así
 * "5215574370309" y "525574370309" cuentan como la misma persona.
 *
 * Solo se usa para comparar (dueño, admins, menciones). Los JID con los
 * que se envían mensajes NO se tocan: WhatsApp espera la forma original.
 * @param {string|number} digits
 * @returns {string}
 */
export function mxCanon(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  return d.length === 13 && d.startsWith("521") ? "52" + d.slice(3) : d;
}

/**
 * Parte de usuario de un JID: sin servidor (@...) ni sufijo de dispositivo
 * (:0, :1...), con la forma mexicana 521… unificada a 52… (ver mxCanon).
 */
export function userPart(jid) {
  if (!jid) return "";
  return mxCanon(usuarioDe(jid));
}

/**
 * Deja un JID en su forma comparable: sin dispositivo, sin espacios y con
 * el servidor correcto. Un @lid NUNCA se convierte en teléfono: son dos
 * identificadores distintos de la misma persona y perder esa diferencia
 * es justo lo que rompía los permisos.
 *
 * @param {string|number} jid
 * @returns {string}
 */
export function normalizeJid(jid) {
  if (!jid && jid !== 0) return "";
  const s = (typeof jid === "number" ? String(jid) : String(jid)).trim();
  if (!s) return "";

  // Chats que no son personas: se devuelven tal cual (sin dispositivo).
  if (s.endsWith(SERVIDOR_GRUPO) || s.endsWith(SERVIDOR_CANAL) || s.endsWith(SERVIDOR_ESTADO)) {
    return s;
  }
  // LID (normal o alojado): se quita el dispositivo, se conserva el dominio.
  if (esLid(s)) return sinDispositivo(s);

  if (s.endsWith(SERVIDOR_PN)) {
    const user = usuarioDe(s);
    return user ? user + SERVIDOR_PN : "";
  }
  // Cualquier JID con sufijo de dispositivo (`521…:4@servidor`).
  const conDispositivo = s.match(/^(\d+):\d+@(.+)$/);
  if (conDispositivo && conDispositivo[2] !== "s.whatsapp.net") {
    return conDispositivo[1] + "@" + conDispositivo[2];
  }

  const digits = s.replace(/\D/g, "");
  if (digits && digits.length >= 4 && digits.length <= 15) return digits + SERVIDOR_PN;
  return s;
}

/** JID de teléfono a partir de dígitos o de un número con adornos. */
export function jidDeTelefono(numero) {
  const d = String(numero || "").replace(/\D/g, "");
  return d ? d + SERVIDOR_PN : "";
}

/**
 * ¿Las dos formas son el mismo número de teléfono? Compara con la regla
 * mexicana (521… = 52…). No intenta relacionar LID con teléfono: eso lo
 * hace lid.mismaPersona() con lo aprendido.
 */
export function mismoNumero(a, b) {
  const pa = userPart(a);
  const pb = userPart(b);
  return !!pa && pa === pb;
}

export default {
  SERVIDOR_PN,
  SERVIDOR_GRUPO,
  SERVIDOR_CANAL,
  SERVIDOR_ESTADO,
  SERVIDORES_LID,
  esGrupo,
  esCanal,
  esLid,
  esTelefono,
  servidorDe,
  usuarioDe,
  sinDispositivo,
  mxCanon,
  userPart,
  normalizeJid,
  jidDeTelefono,
  mismoNumero,
};
