/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  permissions.js — Middleware de permisos
//  Controla: ownerOnly, groupOnly, adminOnly (y admin del bot en grupo).
//  Devuelve el texto de error si no pasa, o null si puede ejecutar.
// ═══════════════════════════════════════════════════════════════════

import { isAdmin } from "#serialize";

export async function checkPermissions(sock, ctx, cmd, engine) {
  const ownerJid = engine.getOwnerJid ? engine.getOwnerJid() : null;

  if (cmd.ownerOnly) {
    const isOwner = ctx.isOwner ? ctx.isOwner(ownerJid) : false;
    if (!isOwner) {
      return "🚫 *Solo el dueño* puede usar este comando.";
    }
  }

  if (cmd.groupOnly && !ctx.isGroup) {
    return "📢 Este comando solo funciona en *grupos*.";
  }

  if (cmd.adminOnly) {
    if (!ctx.isGroup) return "📢 Solo en *grupos*.";
    const admin = await isAdmin(sock, ctx.chatId, ctx.senderId);
    if (!admin) return "🔒 Solo *admins del grupo* pueden usar este comando.";
  }

  if (cmd.botAdmin) {
    if (!ctx.isGroup) return "📢 Solo en *grupos*.";
    // JID real del bot (userPart dentro de isAdmin normaliza :device/@server)
    const botJid = sock.user ? sock.user.id : "";
    const botAdmin = await isAdmin(sock, ctx.chatId, botJid);
    if (!botAdmin) return "🤖 Necesito ser *admin del grupo* para esto.";
  }

  return null;
}

export default checkPermissions;
