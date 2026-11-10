/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/** La guía rápida de símbolos. */
export const LEYENDA = `〔 🔖 GUÍA RÁPIDA 〕

―――――――◆
│ Ⓓ Dueño • Ⓟ Premium • Ⓐ Admin
│ Ⓖ Grupos • Ⓛ Límite
―――――――◆

Selecciona una categoría en el botón desplegable de abajo para ver sus comandos.`;

/**
 * Crédito del menú. Va aparte para poder moverlo o quitarlo de un sitio sin
 * tocar el resto del menú.
 */
export const CREDITO = `📢 Canal: https://whatsapp.com/channel/0029Vb0VFpSGJP89hfZUe522
Shin-MD · Bot de WhatsApp Profesional
github.com/riokuroxi-svg/Shin-MD`;

/** Qué marca lleva un plugin según lo que declara (o ninguna). */
export function marcaDe(plugin) {
  if (!plugin) return "";
  if (plugin.isOwner) return "Ⓓ";
  if (plugin.isAdmin) return "Ⓐ";
  if (plugin.isPremium) return "Ⓟ";
  return "";
}

/**
 * Pone la marca delante de cada comando que aparezca en el texto.
 *
 * @param {string} texto      el menú ya escrito
 * @param {string} prefijo    el prefijo en uso (ej. ".")
 * @param {Map}    comandos   el mapa de pluginLoader (nombre → plugin)
 * @returns {string}
 */
export function marcar(texto, prefijo, comandos) {
  if (!texto || !comandos || !comandos.size) return texto;

  // Los nombres largos primero: si no, «menu» marcaría dentro de «menucat».
  const nombres = [...comandos.keys()].sort((a, b) => b.length - a.length);
  const escapado = prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(
    `${escapado}(${nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\wáéíóúñ])`,
    "gi"
  );

  return texto.replace(patron, (todo, nombre) => {
    const plugin = comandos.get(String(nombre).toLowerCase());
    const marca = marcaDe(plugin);
    return marca ? `${marca} ${todo}` : todo;
  });
}
