/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  compat.js — ¿cuál de mis mensajes no sabe leer tu WhatsApp?
//
//  Cuando un cliente no entiende un tipo de mensaje, WhatsApp no da
//  error: lo cambia por «Recibiste un mensaje que no es compatible con
//  tu versión». Desde el lado del bot todo salió bien, así que el log
//  no dice nada y uno se queda adivinando.
//
//  Este comando manda cuatro mensajes, uno por tipo, numerados. El que
//  aparezca como «no compatible» es el culpable. No adivina: mide.
//
//    .compat   (solo en privado, solo el dueño)
// ═══════════════════════════════════════════════════════════════════
import { sendNativeQuickReply } from "#lib/native-reply";
import { sendAlbum } from "#lib/album";

// Un PNG de 1×1 transparente. Sirve para que las pruebas de imagen y de
// álbum no dependan de ninguna web: si la red falla, el diagnóstico no.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const HOJA = JSON.stringify({
  bottom_sheet: {
    title: "Prueba 3",
    divisions: [1],
  },
  has_multiple_buttons: true,
});

export default {
  command: ["compat", "diagnostico"],
  category: "owner",
  description: "Manda cuatro mensajes de prueba para ver cuál no lee tu WhatsApp.",
  isOwner: true,
  run: async ({ msg, sock }) => {
    const jid = msg.chat;

    if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) {
      return sock.reply(
        jid,
        "「✧」 Esto va por privado.\n> Escríbeme `.compat` en un chat contigo para no llenar el grupo de pruebas.",
        msg,
      );
    }

    const resultados = [];
    const anotar = (n, tipo, ok, detalle) => {
      resultados.push({ n, tipo, ok, detalle });
    };

    // 1. Texto plano. Si esto tampoco se ve, el problema no es Baileys.
    try {
      await sock.sendMessage(jid, { text: "「PRUEBA 1/4」 texto plano" }, { quoted: msg });
      anotar(1, "texto plano", true);
    } catch (e) {
      anotar(1, "texto plano", false, e.message);
    }

    // 2. Tarjeta con botones sencillos, sin adornos.
    try {
      const r = await sendNativeQuickReply({
        sock,
        jid,
        body: "「PRUEBA 2/4」 tarjeta con botones",
        footer: "si esto sale raro, el culpable es native_flow",
        buttons: [
          { text: "Botón A", id: "compat_a" },
          { text: "Botón B", id: "compat_b" },
        ],
        quoted: msg,
      });
      anotar(2, "tarjeta con botones", r.sent, r.error?.message);
    } catch (e) {
      anotar(2, "tarjeta con botones", false, e.message);
    }

    // 3. La misma tarjeta, pero con la hoja inferior (messageParamsJson).
    try {
      const r = await sendNativeQuickReply({
        sock,
        jid,
        body: "「PRUEBA 3/4」 tarjeta con hoja inferior",
        footer: "si SOLO falla esta, el culpable es bottom_sheet",
        buttons: [
          { text: "Ver todo", id: "compat_c" },
          { text: "Botón D", id: "compat_d" },
          { text: "Botón E", id: "compat_e" },
        ],
        params: HOJA,
        quoted: msg,
      });
      anotar(3, "hoja inferior", r.sent, r.error?.message);
    } catch (e) {
      anotar(3, "hoja inferior", false, e.message);
    }

    // 4. Álbum: dos imágenes en una sola tarjeta.
    try {
      const r = await sendAlbum(
        sock,
        jid,
        [
          { image: PIXEL, caption: "「PRUEBA 4/4」 álbum" },
          { image: PIXEL, caption: "segunda imagen del álbum" },
        ],
        { quoted: msg },
      );
      anotar(4, "álbum", r.sent, r.error?.message);
    } catch (e) {
      anotar(4, "álbum", false, e.message);
    }

    const lineas = resultados.map((r) => {
      const marca = r.ok ? "✅" : "❌";
      const extra = r.ok ? "" : ` ${r.detalle ? `(${r.detalle})` : ""}`;
      return `${marca} ${r.n}. ${r.tipo}${extra}`;
    });

    await sock.sendMessage(
      jid,
      {
        text:
          "「✧」 *Resultado del envío*\n\n" +
          `${lineas.join("\n")}\n\n` +
          "*Lo que buscamos*\n" +
          "> Mira los cuatro mensajes de arriba. El que salga como\n" +
          "> «no compatible con tu versión» es el que tu WhatsApp no lee,\n" +
          "> aunque aquí haya salido ✅ (enviar y poder leerlo son cosas\n" +
          "> distintas).\n\n" +
          "*Qué significa cada número*\n" +
          "> 1 → texto: si falla, no es Baileys.\n" +
          "> 2 → botones: native_flow.\n" +
          "> 3 → hoja inferior: messageParamsJson.\n" +
          "> 4 → álbum: albumMessage.\n\n" +
          "_Dime el número y lo arreglo en esa vía._",
      },
      { quoted: msg },
    );
  },
};
