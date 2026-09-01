// ═══════════════════════════════════════════════════════════════════
//  errors.js — Separación de errores de USUARIO vs TÉCNICOS
//  Los errores de usuario se muestran tal cual.
//  Los errores técnicos se registran y resumen (sin stacks al chat).
// ═══════════════════════════════════════════════════════════════════

export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
    this.isUserError = true;
  }
}

export function userError(message) {
  return new UserError(message);
}

export function isUserError(e) {
  return !!(e && (e instanceof UserError || e.isUserError === true));
}

export function logBotError(command, error) {
  console.error(`[BOT ERROR] ${command}: ${error?.stack || error?.message || error}`);
}

export function truncateError(msg, max = 260) {
  const s = String(msg || "");
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export function formatCommandError(e, command, { isOwner = false } = {}) {
  const name = String(command || "comando");

  if (isUserError(e)) {
    return `《✧》 ${String(e.message || "Dato inválido.").trim()}`;
  }

  logBotError(command || "comando", e);

  if (isOwner) {
    const detail = truncateError(e?.stack || e?.message || String(e), 260);
    return `> Ocurrió un error interno al ejecutar *${name}*.\n> [Detalle: ${detail}]`;
  }

  return `> Ocurrió un error interno al ejecutar *${name}*. Por favor inténtalo de nuevo o contacta al creador del bot.`;
}