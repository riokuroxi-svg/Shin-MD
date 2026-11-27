/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  lista.js — el menú de toda la vida: lista desplegable con 👍
//
//  POR QUÉ ESTE FORMATO Y NO EL MODERNO
//  `listMessage` es el campo 36 del proto: el más antiguo de las listas.
//  Los menús modernos (`nativeFlowMessage` con `single_select`) son más
//  nuevos y son los que a veces hacen que el cliente enseñe el aviso de
//  «actualiza WhatsApp». Este formato viejo se pinta igual en todos los
//  clientes y no dispara ese aviso.
//
//  Comprobado contra nuestro propio proto antes de escribir esto:
//    ListMessage existe · ListType {SINGLE_SELECT: 1}
//    el mensaje pasa por proto.Message.encode y vuelve entero.
//
//  CÓMO SE RESPONDE
//  El `rowId` de cada fila es el COMANDO tal cual. Al pulsar, WhatsApp
//  devuelve `listResponseMessage.singleSelectReply.selectedRowId`, y
//  `src/serialize.js` ya lo lee y lo trata como el texto que escribió la
//  persona. No hace falta tocar el router: `.menu main` viaja como
//  rowId y llega al ejecutor como si lo hubieran tecleado.
//
//  LÍMITES DE WHATSAPP (no son nuestros, son de Meta)
//    · 10 filas en total entre TODAS las secciones
//    · título de fila: 24 caracteres · descripción: 72
//    · texto del botón: 20 caracteres
//  Por eso los menús van en dos niveles: principal → categoría.
// ═══════════════════════════════════════════════════════════════════

import { generateWAMessageFromContent, proto } from "baileys";
import log from "#logger";

/** Los límites reales de Meta, escritos una vez para poder probarlos. */
export const LIMITES = Object.freeze({
  filasTotales: 10,
  tituloFila: 24,
  descripcionFila: 72,
  textoBoton: 20,
  tituloSeccion: 24,
});

/**
 * Recorta a `max` sin partir emojis por la mitad.
 * Un emoji de bandera son dos code points: cortar a lo bruto lo rompe.
 *
 * @param {string} texto
 * @param {number} max
 */
export function recortar(texto, max) {
  const limpio = String(texto ?? "");
  const puntos = [...limpio];
  if (puntos.length <= max) return limpio;
  return puntos.slice(0, Math.max(1, max - 1)).join("") + "…";
}

/**
 * Arma el listMessage. No envía nada: devuelve el objeto listo para
 * `generateWAMessageFromContent`.
 *
 * @param {object} op
 * @param {string} op.titulo            título (1 línea)
 * @param {string} op.texto             cuerpo del mensaje
 * @param {string} [op.pie]             texto pequeño de abajo
 * @param {string} [op.textoBoton]      lo que dice el botón que abre la lista
 * @param {Array<{titulo:string, filas:Array<{titulo:string, descripcion?:string, comando:string}>}>} op.secciones
 * @returns {object} el mensaje (`{ listMessage }`) listo para enviar
 */
export function armarLista(op = {}) {
  const secciones = (op.secciones || []).map((s) => ({
    title: recortar(s.titulo || "", LIMITES.tituloSeccion),
    rows: (s.filas || []).map((f) => {
      const fila = {
        title: recortar(f.titulo || "", LIMITES.tituloFila),
        rowId: String(f.comando || f.titulo || ""),
      };
      if (f.descripcion) fila.description = recortar(f.descripcion, LIMITES.descripcionFila);
      return fila;
    }),
  }));

  return {
    listMessage: proto.Message.ListMessage.fromObject({
      title: recortar(op.titulo || "", 60),
      description: op.texto || "",
      buttonText: recortar(op.textoBoton || "Ver menú", LIMITES.textoBoton),
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      footerText: op.pie || "",
      sections: secciones,
    }),
  };
}

/**
 * Cuenta las filas y avisa si Meta las va a rechazar. No lanza: el menú
 * tiene que salir aunque sobre una fila (mejor un menú recortado que un
 * silencio).
 *
 * @param {object} contenido resultado de `armarLista`
 * @returns {{filas:number, pasado:boolean}}
 */
export function revisarLista(contenido) {
  const secciones = contenido?.listMessage?.sections || [];
  const filas = secciones.reduce((n, s) => n + (s.rows?.length || 0), 0);
  const pasado = filas > LIMITES.filasTotales;
  if (pasado) {
    log.warn(`lista: ${filas} filas, Meta admite ${LIMITES.filasTotales}. Sobran ${filas - LIMITES.filasTotales}.`);
  }
  return { filas, pasado };
}

/**
 * Envía el menú de lista. Devuelve la `key` o null si el cliente no lo
 * aceptó (en ese caso se avisa y quien llama puede caer al menú normal).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} op  lo mismo que `armarLista`
 * @param {{cita?:object}} [extra]
 */
export async function enviarLista(sock, jid, op, { cita = null } = {}) {
  const contenido = armarLista(op);
  revisarLista(contenido);

  try {
    // Un canal no admite listas: se cae al texto con las opciones.
    if (typeof jid === "string" && jid.endsWith("@newsletter")) {
      const texto =
        (op.texto || "") +
        "\n\n" +
        (op.secciones || [])
          .flatMap((s) => (s.filas || []).map((f) => `• ${f.titulo} → ${f.comando}`))
          .join("\n");
      await sock.sendMessage(jid, { text: texto }, cita ? { quoted: cita } : {});
      return null;
    }

    const armado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock.user?.id,
      quoted: cita || undefined,
    });
    await sock.relayMessage(jid, armado.message, { messageId: armado.key.id });
    return armado.key;
  } catch (err) {
    log.warn("lista: el cliente no aceptó el menú desplegable (" + (err.message || err) + ")");
    return null;
  }
}

/** Versión sin red: arma y pasa por el protobuf (para las pruebas). */
export function armarBytesLista(op, jid = "5210000000000@s.whatsapp.net") {
  const contenido = armarLista(op);
  const armado = generateWAMessageFromContent(jid, contenido, {});
  const bytes = proto.Message.encode(armado.message).finish();
  return { bytes, decodificado: proto.Message.decode(bytes), contenido };
}

export default { armarLista, revisarLista, enviarLista, armarBytesLista, recortar, LIMITES };
