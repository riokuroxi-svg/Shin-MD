/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  consola.js — la cara del bot en la terminal.
//
//  Todo lo que el bot escribe **antes** de conectar (banner, menú,
//  vinculación, filas de estado) se dibuja aquí. Es un módulo puro: entra
//  un objeto, sale texto. Eso permite probarlo sin abrir una terminal y
//  que la misma pieza se vea en Termux (60 columnas), en un VPS (80) o en
//  una ventana ancha.
//
//  Reglas que sigue, y por qué:
//
//   · Ancho máximo 58 columnas. La mitad de un móvil en vertical son ~40,
//     pero 58 entra en todas las terminales de verdad sin partir nada.
//   · Nada de arte que ocupe media pantalla: el panel se lee de un vistazo
//     y deja sitio al registro del bot.
//   · Los colores son de la casa (sakura, ciruela y menta). Si la salida
//     no es una terminal, `chalk` los apaga solo y queda texto limpio —
//     importante para los logs de systemd y pm2.
//   · Los bordes son de una sola columna (│ ╭ ╮ ╰ ╯) y no de bloque: los
//     bloques (█) se ven mal en las fuentes de Termux y rompen el ancho.
// ═══════════════════════════════════════════════════════════════════

import chalk from "chalk";

// ─────────────────────────── la paleta ───────────────────────────
// Los mismos tonos que el perfil y las imágenes del README, para que la
// terminal y GitHub hablen el mismo idioma.
export const COLOR = {
  sakura: chalk.hex("#F28FB4"),
  sakuraFuerte: chalk.hex("#E4668F"),
  lila: chalk.hex("#9B7BD4"),
  lilaFuerte: chalk.hex("#7A5BC0"),
  menta: chalk.hex("#5FC6A9"),
  ambar: chalk.hex("#E0A34E"),
  tinta: chalk.hex("#CFC6E0"),
  tenue: chalk.hex("#8B82A3"),
  papel: chalk.hex("#F6F1FA"),
};

/** Quita los códigos de color: sirve para medir anchos y para las pruebas. */
export function sinColor(texto) {
  // eslint-disable-next-line no-control-regex -- los códigos ANSI son el objetivo
  return String(texto).replace(/\x1b\[[0-9;]*m/g, "");
}

/** Largo visible de un texto coloreado. */
export function anchoVisible(texto) {
  return [...sinColor(texto)].length;
}

/** Rellena por la derecha hasta `ancho` visibles. */
export function rellenar(texto, ancho) {
  const hueco = ancho - anchoVisible(texto);
  return hueco > 0 ? texto + " ".repeat(hueco) : texto;
}

/** Centra dentro de `ancho` visibles. */
export function centrar(texto, ancho) {
  const hueco = Math.max(0, ancho - anchoVisible(texto));
  const izq = Math.floor(hueco / 2);
  return " ".repeat(izq) + texto + " ".repeat(hueco - izq);
}

/** Parte un texto largo en varias líneas sin cortar palabras. */
export function envolver(texto, ancho) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (anchoVisible(prueba) <= ancho) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

// ─────────────────────────── piezas ───────────────────────────

/** El ancho de las cajas. Configurable por si algún día hace falta. */
export const ANCHO = 58;

/**
 * Una caja con título.
 *
 * @param {object} opciones
 * @param {string} [opciones.titulo]   texto que va en el borde de arriba
 * @param {string[]} [opciones.lineas] contenido, ya coloreado si hace falta
 * @param {number} [opciones.ancho]
 * @param {Function} [opciones.color]  color del borde
 * @returns {string[]}
 */
export function caja({ titulo = "", lineas = [], ancho = ANCHO, color = COLOR.lila } = {}) {
  const interior = ancho - 4;
  const rotulo = titulo ? ` ${titulo} ` : "";
  const relleno = "─".repeat(Math.max(0, ancho - 2 - anchoVisible(rotulo)));
  const arriba = color(`╭${rotulo}${relleno}╮`);
  const abajo = color(`╰${"─".repeat(ancho - 2)}╯`);
  const cuerpo = lineas.map((linea) => {
    if (linea === "") return `${color("│")}${" ".repeat(ancho - 2)}${color("│")}`;
    // Si cabe tal cual, se respeta el espaciado (centrados, sangrías): por
    // eso solo se envuelve lo que de verdad no entra. Sin esto, `envolver`
    // se comía los espacios de la izquierda y el código quedaba pegado al
    // borde.
    const trozos = anchoVisible(linea) <= interior ? [linea] : envolver(linea, interior);
    return trozos.map((t) => `${color("│")} ${rellenar(t, interior)} ${color("│")}`).join("\n");
  });
  return [arriba, ...cuerpo.flatMap((c) => String(c).split("\n")), abajo];
}

/** Una fila «etiqueta · valor» alineada a la derecha, dentro de una caja. */
export function fila(etiqueta, valor, ancho = ANCHO) {
  const interior = ancho - 4;
  const izq = COLOR.tenue(etiqueta);
  const der = COLOR.papel(String(valor));
  const hueco = Math.max(1, interior - anchoVisible(izq) - anchoVisible(der));
  return `${izq}${" ".repeat(hueco)}${der}`;
}

/** Separa secciones sin dibujar una línea entera. */
export function separador(ancho = ANCHO) {
  return COLOR.tenue("· ".repeat(Math.ceil(ancho / 2)).trim());
}

/**
 * El banner de arranque.
 *
 * Va dibujado con caracteres de una columna (no con `cfonts` de bloque):
 * ocupa seis líneas, se lee igual en Termini, en Fuente y en la fuente
 * por defecto de Termux, y no se sale de 58 columnas.
 *
 * @param {object} [datos]
 * @param {string} [datos.version]
 * @param {string} [datos.node]
 * @param {string} [datos.plataforma]
 * @returns {string}
 */
export function banner({ version = "dev", node = "", plataforma = "" } = {}) {
  const nombre = "S H I N - M D";
  const lineas = [
    "",
    "  " + COLOR.sakura("❀") + COLOR.tenue("  ─────────────────────────────────────────"),
    "",
    "  " + COLOR.sakuraFuerte(chalk.bold("S H I N - M D")),
    "  " + COLOR.lila("反魂") + COLOR.tenue("  ·  bot de WhatsApp multi-device"),
    "",
    "  " + COLOR.tenue("─────────────────────────────────────────────"),
    "",
    "  " + COLOR.tenue("versión ") + COLOR.papel(version) +
      (node ? COLOR.tenue("  ·  node ") + COLOR.papel(node) : "") +
      (plataforma ? COLOR.tenue("  ·  ") + COLOR.papel(plataforma) : ""),
    "  " + COLOR.tenue("hecho por ") + COLOR.sakura("riokuroxi-svg") + COLOR.tenue("  ·  AGPL-3.0-only"),
    "",
  ];
  void nombre;
  return lineas.join("\n");
}

/**
 * El panel de vinculación: lo primero que ve quien arranca el bot por
 * primera vez. Explica qué va a pasar **antes** de pedir nada.
 *
 * @param {object} [datos]
 * @param {number} [datos.ancho]
 * @returns {string[]}
 */
export function panelVinculacion({ ancho = ANCHO } = {}) {
  return caja({
    titulo: COLOR.sakuraFuerte("vinculación"),
    ancho,
    color: COLOR.sakura,
    lineas: [
      "",
      COLOR.papel("Vamos a vincular tu WhatsApp con el bot."),
      COLOR.tenue("No hay que escanear nada: WhatsApp te da un") ,
      COLOR.tenue("código de 8 letras y lo escribes en el teléfono."),
      "",
      COLOR.tenue("Ajustes › Dispositivos vinculados ›"),
      COLOR.tenue("Vincular un dispositivo › Vincular con número"),
      "",
    ],
  });
}

/**
 * Pide el número. Devuelve el texto de la pregunta, ya con el formato.
 *
 * @param {object} [opciones]
 * @param {string} [opciones.ejemplo]
 * @returns {string}
 */
export function preguntaNumero({ ejemplo = "+52 1 55 1234 5678" } = {}) {
  return (
    "  " + COLOR.sakura("❯ ") + COLOR.papel("Número de WhatsApp ") +
    COLOR.tenue(`(ej. ${ejemplo}): `)
  );
}

/**
 * El panel del código: el momento importante de todo el arranque.
 * Se dibuja grande, aparte del resto, para que nadie tenga que buscarlo
 * entre líneas de registro.
 *
 * @param {object} datos
 * @param {string} datos.numero   el número, enmascarado o no
 * @param {string} datos.codigo   el código, ya con guion (ABCD-1234)
 * @param {number} [datos.segundos] cuánto suele tardar en caducar
 * @param {number} [datos.ancho]
 * @returns {string}
 */
export function panelCodigo({ numero = "", codigo = "", segundos = 60, ancho = ANCHO }) {
  const lineas = [
    "",
    ...caja({
      titulo: COLOR.menta("tu código"),
      ancho,
      color: COLOR.menta,
      lineas: [
        "",
        centrar(COLOR.tenue("escríbelo en el teléfono"), ancho - 4),
        "",
        centrar(COLOR.sakuraFuerte(chalk.bold(espaciar(codigo))), ancho - 4),
        "",
        centrar(COLOR.tenue(`caduca en ~${segundos} s · si expira, vuelve a arrancar`), ancho - 4),
        "",
      ],
    }),
    "",
    "  " + COLOR.tenue("cuenta: ") + COLOR.papel(numero),
    "  " + COLOR.tenue("1. ") + COLOR.papel("abre WhatsApp en ese teléfono"),
    "  " + COLOR.tenue("2. ") + COLOR.papel("Ajustes › Dispositivos vinculados"),
    "  " + COLOR.tenue("3. ") + COLOR.papel("Vincular un dispositivo › con número"),
    "  " + COLOR.tenue("4. ") + COLOR.papel("teclea el código de arriba"),
    "",
  ];
  return lineas.join("\n");
}

/**
 * Mete un espacio fino entre los caracteres del código para que se lea
 * sin confundir 8 con B. No cambia lo que hay que teclear.
 */
export function espaciar(codigo) {
  return String(codigo).split("").join(" ");
}

/**
 * El panel de «ya está conectado». Cierra el arranque con los cuatro datos
 * que se miran después de vincular: con qué cuenta, cuántos comandos hay,
 * el prefijo y dónde está el panel web.
 *
 * @param {object} datos
 * @param {number} [datos.ancho]
 * @returns {string}
 */
export function panelListo({
  version = "?",
  nombre = "?",
  comandos = 0,
  alias = 0,
  prefijo = ".",
  web = "",
  ancho = ANCHO,
} = {}) {
  const lineas = [
    "",
    COLOR.menta("cuenta   ") + COLOR.papel(nombre),
    COLOR.tenue("versión  ") + COLOR.papel(`v${version}`),
    COLOR.tenue("comandos ") + COLOR.papel(alias ? `${comandos} (${alias} alias)` : String(comandos)),
    COLOR.tenue("prefijo  ") + COLOR.papel(prefijo),
  ];
  if (web) lineas.push(COLOR.tenue("panel    ") + COLOR.papel(web));
  lineas.push("");
  return caja({
    titulo: COLOR.menta("en línea"),
    ancho,
    color: COLOR.menta,
    lineas,
  }).join("\n");
}

/**
 * Una línea de estado con su icono, alineada con el resto de la consola.
 *
 * @param {"ok"|"info"|"aviso"|"error"} tipo
 * @param {string} texto
 * @returns {string}
 */
export function estado(tipo, texto) {
  const iconos = {
    ok: COLOR.menta("✓"),
    info: COLOR.lila("◐"),
    aviso: COLOR.ambar("!"),
    error: COLOR.sakuraFuerte("✕"),
  };
  const color = {
    ok: COLOR.papel,
    info: COLOR.tinta,
    aviso: COLOR.ambar,
    error: COLOR.sakuraFuerte,
  }[tipo] || COLOR.tinta;
  return "  " + iconos[tipo] + " " + color(texto);
}

/**
 * Una línea por mensaje, en vez del cuadro de siete filas que se imprimía
 * antes por cada texto que entraba. Se lee el registro de un vistazo:
 * hora, quién, dónde y qué.
 *
 * @param {object} datos
 * @param {string} [datos.hora]     HH:mm:ss
 * @param {string} [datos.quien]    nombre de quien escribe
 * @param {string} [datos.donde]    grupo o «privado»
 * @param {string} [datos.texto]    el mensaje o el nombre del comando
 * @param {boolean} [datos.comando] true si lo escrito era un comando
 * @param {number|null} [datos.ms]  lo que tardó, si es un comando
 * @param {number} [datos.ancho]
 * @returns {string}
 */
export function mensaje({ hora = "", quien = "", donde = "", texto = "", comando = false, ms = null, ancho = ANCHO } = {}) {
  const marca = comando ? COLOR.sakuraFuerte("▸") : COLOR.lila("▸");
  const cabecera = COLOR.tenue(hora) + COLOR.tenue(" ") + COLOR.papel(quien) +
    (donde ? COLOR.tenue(" · ") + COLOR.lila(donde) : "");
  const tiempo = ms === null || ms === undefined ? "" : COLOR.tenue(" · ") + COLOR.menta(ms + " ms");

  // Se recorta el texto a lo que queda de ancho, con puntos suspensivos:
  // mejor una línea corta que una que rompa la alineación del registro.
  // Lo que ya ocupa la línea: marca, hora, quién, dónde, los dos espacios
  // del medio, el tiempo y las comillas (que también cuentan).
  const comillas = comando ? 0 : 2;
  const fijo = anchoVisible(cabecera) + anchoVisible(tiempo) + 6 + comillas;
  const hueco = Math.max(12, ancho - fijo);
  let cuerpo = String(texto).replace(/\s+/g, " ").trim();
  if (cuerpo.length > hueco) cuerpo = cuerpo.slice(0, hueco - 1).trimEnd() + "…";
  const pintado = comando ? COLOR.sakuraFuerte(cuerpo) : COLOR.tinta("«" + cuerpo + "»");

  return "  " + marca + " " + cabecera + "  " + pintado + tiempo;
}

/**
 * El pie con las teclas disponibles. Deja claro cómo salir y cómo
 * reiniciar: es lo que más se pregunta en Termux.
 */
export function pieTeclas() {
  return (
    "  " +
    COLOR.tenue("Ctrl+C ") + COLOR.tinta("parar") +
    COLOR.tenue(" · ") + COLOR.tenue("r ") + COLOR.tinta("reiniciar") +
    COLOR.tenue(" · ") + COLOR.tenue("? ") + COLOR.tinta("ayuda")
  );
}

export default {
  ANCHO,
  COLOR,
  banner,
  caja,
  centrar,
  envolver,
  espaciar,
  estado,
  fila,
  panelCodigo,
  panelListo,
  panelVinculacion,
  pieTeclas,
  preguntaNumero,
  rellenar,
  separador,
  sinColor,
  anchoVisible,
};
