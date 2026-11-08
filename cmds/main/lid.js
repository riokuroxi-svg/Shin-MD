/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lid.js — Diagnóstico de identidad
//
//  WhatsApp puede presentar a la misma persona con dos identificadores:
//  el teléfono (`521…@s.whatsapp.net`) y el LID (`123…@lid`). Este
//  comando enseña cuál está viendo el bot en este chat, si ya conoce la
//  pareja y si tú (y el bot) sois administradores.
//
//  Para qué sirve: si en un grupo sale la llave del LID y en privado la
//  del teléfono, todavía no se había visto esa pareja en el tráfico. En
//  cuanto llegue un mensaje con el identificador alternativo se aprende
//  sola, las cuentas se fusionan y las dos formas muestran la misma
//  llave. Es la comprobación de 10 segundos, sin mirar la base.
// ═══════════════════════════════════════════════════════════════════

import * as lid from "#lib/lid";
import { userPart, normalizeJid } from "#lib/jid";

const guion = "╭───────────────────";
const pie = "╰────「 反魂 」────";

function fila(icono, etiqueta, valor) {
  return "│  " + icono + " *" + etiqueta + ":* " + valor + "\n";
}

export default {
  command: ["lid", "miid", "identidad"],
  category: "main",
  description: "Muestra cómo ve el bot tu identidad (teléfono y LID).",
  run: async ({ msg, sock, isAdmins, isBotAdmins }) => {
    // El conector guarda las parejas en el auth state. Se le pregunta ANTES
    // de resolver: si contesta, la llave y el teléfono salen ya unidos y el
    // resto del diagnóstico no depende de haber visto ese mensaje.
    const delConector = await lid.resolverConector(msg.sender, { red: true });

    const identidad = lid.resolver(msg.sender, msg.senderLid || delConector || "");
    const parejaConocida = !!(identidad.pn && identidad.lid);

    const telefono = identidad.pn ? "+" + userPart(identidad.pn) : "";
    const lidVisible = identidad.lid || "";
    const numeros = lid.estadisticas();

    let texto = "🪪 *Identidad · 反魂 Shin-MD*\n" + guion + "\n";
    texto += fila("🔑", "Llave", "`" + (identidad.key || msg.sender || "—") + "`");
    texto += fila("📱", "Teléfono", telefono ? "`" + telefono + "`" : "_todavía no se conoce_");
    texto += fila("🆔", "LID", lidVisible ? "`" + lidVisible + "`" : "_WhatsApp no lo ha mandado en este chat_");
    texto += fila(
      "🧩",
      "Pareja",
      parejaConocida
        ? "aprendida: las dos formas son la misma cuenta"
        : "pendiente: en cuanto llegue el identificador alternativo se une sola"
    );

    if (delConector) {
      texto += fila("🔌", "Conector", "`" + delConector + "` (lo tenía guardado Baileys)");
    } else {
      texto += fila("🔌", "Conector", "_sin dato nuevo: sigue con lo visto en el tráfico_");
    }

    if (msg.isGroup) {
      texto += fila("👤", "Aquí", isAdmins ? "administrador" : "miembro");
      texto += fila("🤖", "El bot", isBotAdmins ? "administrador" : "no es administrador");
    } else {
      texto += fila("💬", "Chat", "privado");
    }

    const propioLid = lid.lidDePn(msg.sender) || normalizeJid(sock?.user?.lid || "");
    if (propioLid) texto += fila("📇", "Tu LID guardado", "`" + propioLid + "`");

    texto += fila(
      "🗂️",
      "Parejas",
      numeros.enMemoria + " en memoria" +
        (numeros.guardadas !== null && numeros.guardadas !== undefined
          ? " · " + numeros.guardadas + " en la base"
          : " · sin persistencia activa") +
        (numeros.conector ? " · conector activo" : "")
    );
    texto += pie;

    return texto;
  },
};
