// ═══════════════════════════════════════════════════════════════════
//  events.js — Manejador de eventos del bot
//  Se ejecuta al conectar el socket.
// ═══════════════════════════════════════════════════════════════════

import log from "#lib/logger";

export default async function events(sock) {
  if (!sock) return;

  sock.ev.on("presence.update", () => {});
  sock.ev.on("chats.upsert", () => {});
  sock.ev.on("contacts.upsert", () => {});

  log.debug("Eventos del socket registrados");
}