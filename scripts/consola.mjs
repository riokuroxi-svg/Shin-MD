#!/usr/bin/env node
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  consola.mjs — El panel arriba, el bot hablando abajo
//
//  Esto es lo que arranca `npm start`. Hace dos cosas a la vez, en el
//  mismo proceso, y por eso el panel no parpadea ni se reinicia cuando
//  el bot se reinicia:
//
//    1. VIGILA al bot (misma lógica que vigia.mjs, en supervisor.mjs):
//       lo levanta, escucha su "restart", lo recoge si se cae.
//    2. DIBUJA una cabecera fija con estado, grupos, memoria, disco, y
//       DEBAJO el flujo de lo que el bot va diciendo.
//
//  La pantalla se redibuja entera cada segundo en el búfer alternativo.
//  Eso es a propósito: así el panel nunca se descuadra, y aunque alguien
//  escriba `clear` en otra ventana (o pulse Ctrl+L), al segundo siguiente
//  vuelve a estar ahí. La terminal normal queda intacta al salir.
//
//  Si no hay terminal (systemd, pm2, nohup, docker logs) NO se dibuja
//  nada: se cae al modo del vigía, con líneas de texto normales. Eso es
//  lo que hace que sirva igual en un VPS.
//
//  Uso:
//    npm start                 (panel + bot)
//    npm start -- --code       (igual, pidiendo código de vinculación)
//    npm start -- --code 5215…  (con el número ya puesto, sin preguntar)
//
//  Teclas:  r reiniciar el bot   ·   q o Ctrl+C salir
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crearSupervisor, VENTANA_MS } from "./supervisor.mjs";
import { parseArgs } from "../src/lib/cli-args.js";
import { estadoSesion, planDeVinculacion } from "../src/lib/vinculacion.js";
import * as ui from "../src/services/consola.js";
import { datosAndroid, bateria, disco, memoriaSistema, ipLocal, hace, gb } from "./datos-equipo.mjs";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARGS = process.argv.slice(2);

const AZUL = "\x1b[38;5;111m";
const VERDE = "\x1b[38;5;79m";
const AMBAR = "\x1b[38;5;179m";
const ROJO = "\x1b[38;5;174m";
const GRIS = "\x1b[38;5;245m";
const NEGRITA = "\x1b[1m";
const RESET = "\x1b[0m";

const MARCA = "SHIN-MD";
const HISTORIAL = 400;          // líneas de log que se guardan en memoria
const TICK_MS = 1000;           // cada cuánto se repinta la cabecera
const PINTAR_MIN_MS = 120;      // no repintar más seguido que esto

const URL_BASE = process.env.SHIN_PANEL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

// ─────────────────────────── utilidades ───────────────────────────

const sinColor = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");

/** Largo en pantalla: sin códigos de color, contando anchos como uno. */
export const visible = (s) => [...sinColor(s)].length;

/**
 * ¿Es arte de bloques (un QR viejo, una tabla ASCII enorme) más ancho que
 * la pantalla? Partirlo lo convierte en basura ilegible; es mejor decirlo
 * que fingir que se está enseñando algo.
 *
 * Desde que la vinculación es solo por código no debería aparecer nada
 * así, pero el bot puede imprimir arte de un comando (`.ascii`, `figlet`)
 * y el panel no debe descuadrarse por eso.
 */
export function esArteAncho(linea, ancho) {
  const t = sinColor(linea);
  if ([...t].length <= ancho) return false;
  // Un QR es puro bloque; una línea de texto normal no lleva ni uno.
  const bloques = (t.match(/[▀▄█▓▒░▚▞▛▜▟▙■]/g) || []).length;
  return bloques >= 8;
}

/**
 * Corta a `max` caracteres visibles sin partir un código de color (partirlo
 * deja la terminal coloreada hasta que alguien escriba un reset).
 */
export function recortar(texto, max) {
  let salida = "";
  let cuenta = 0;
  const s = String(texto);
  for (let i = 0; i < s.length; ) {
    if (s[i] === "\x1b") {
      const fin = s.indexOf("m", i);
      if (fin === -1) break;
      salida += s.slice(i, fin + 1);
      i = fin + 1;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i));
    if (cuenta + 1 > max) break;
    salida += ch;
    cuenta++;
    i += ch.length;
  }
  return salida + RESET;
}

/** Rellena hasta `ancho` visibles para que los bordes de la caja cuadren. */
export function rellenar(texto, ancho) {
  const hueco = ancho - visible(texto);
  return hueco > 0 ? texto + " ".repeat(hueco) : recortar(texto, ancho);
}

/**
 * Deja el texto apto para una línea del panel: conserva los colores y
 * tira todo lo demás (mover el cursor, borrar la pantalla, títulos de
 * ventana). Sin esto, un solo `\x1b[2J` del bot desarma el dibujo.
 */
export function limpiarSalida(texto) {
  return String(texto)
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC: títulos, portapapeles
    .replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, "")       // todo CSI menos ...m (color)
    .replace(/\x1b[()][A-Z0-9]/g, "")                // juego de caracteres
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, "") // controles sueltos (sin el ESC)
    .replace(/\r/g, "");
}

/** Parte un texto con colores en trozos de `ancho` visibles. */
export function ajustar(texto, ancho) {
  const limite = Math.max(1, ancho);
  if (visible(texto) <= limite) return [texto];

  // Se parte por PALABRAS, no por caracteres. Partir por caracteres deja
  // renglones que empiezan con «, tope de hoy 20 mensajes»: se lee fatal y
  // hace parecer que el registro está roto. Una palabra que sola no cabe
  // (una URL larga) sí se parte, porque si no se saldría de la caja.
  const piezas = [];
  const s = String(texto);
  let ansi = "";
  let palabra = "";
  const cerrarPalabra = () => {
    if (palabra) {
      piezas.push({ tipo: "palabra", texto: palabra, ansi });
      palabra = "";
      ansi = "";
    }
  };
  for (let i = 0; i < s.length; ) {
    if (s[i] === "\x1b") {
      const finAnsi = s.indexOf("m", i);
      if (finAnsi === -1) break;
      ansi += s.slice(i, finAnsi + 1);
      i = finAnsi + 1;
      continue;
    }
    const ch = String.fromCodePoint(s.codePointAt(i));
    if (ch === " ") {
      cerrarPalabra();
      piezas.push({ tipo: "espacio" });
    } else {
      palabra += ch;
    }
    i += ch.length;
  }
  cerrarPalabra();

  const lineas = [];
  let actual = "";
  let cuenta = 0;
  for (const pieza of piezas) {
    if (pieza.tipo === "espacio") {
      // Los espacios del principio de renglón no se dibujan.
      if (cuenta > 0) {
        actual += " ";
        cuenta += 1;
      }
      continue;
    }
    const anchoPalabra = visible(pieza.texto);
    if (cuenta + anchoPalabra > limite && cuenta > 0) {
      lineas.push(actual.replace(/ +$/, "") + RESET);
      actual = "";
      cuenta = 0;
    }
    if (anchoPalabra > limite) {
      // Palabra imposible: se corta a lo bruto, con sus colores delante.
      const trozos = [];
      let resto = pieza.texto;
      let previo = pieza.ansi;
      while (visible(resto) > limite) {
        trozos.push(previo + [...resto].slice(0, limite).join("") + RESET);
        resto = [...resto].slice(limite).join("");
        previo = pieza.ansi;
      }
      for (const trozo of trozos) lineas.push(trozo);
      actual = previo + resto;
      cuenta = visible(resto);
      continue;
    }
    actual += pieza.ansi + pieza.texto;
    cuenta += anchoPalabra;
  }
  if (actual.trim()) lineas.push(actual + RESET);
  return lineas.length ? lineas : [RESET];
}

const colorEstado = (estado) =>
  estado === "activo" ? VERDE : estado === "rendido" ? ROJO : estado === "esperando" ? AMBAR : AZUL;

const NOMBRE_ESTADO = {
  detenido: "PARADO",
  arrancando: "ARRANCANDO",
  activo: "ACTIVO",
  reiniciando: "REINICIANDO",
  esperando: "SE CAYÓ",
  rendido: "RENDIDO",
};

// ─────────────────────────── la cabecera ───────────────────────────

/**
 * Arma las líneas de contenido de la cabecera (sin bordes).
 * Los campos se acomodan solos: en un móvil de 46 columnas caben menos
 * por línea y lo que sobra baja a la siguiente. Nada se corta a la mitad.
 *
 * @param {object} o
 * @param {string} o.estado     activo | reiniciando | esperando | rendido…
 * @param {number} o.reinicios
 * @param {number} [o.pid]
 * @param {object|null} [o.salud]  Lo que contesta /health
 * @param {object|null} [o.equipo] Lo que se sabe del aparato
 * @param {number} o.ancho
 * @param {string} o.url
 * @returns {string[]}
 */
export function construirCabecera({ estado = "detenido", reinicios = 0, pid = 0, salud = null, equipo = null, ancho = 72, url = "" }) {
  const color = colorEstado(estado);
  const campos = [];

  campos.push(`${color}●${RESET} ${NEGRITA}${NOMBRE_ESTADO[estado] || estado.toUpperCase()}${RESET}`);

  if (estado === "reiniciando") campos.push(`${GRIS}espera un momento…${RESET}`);
  if (estado === "arrancando") campos.push(`${GRIS}levantando…${RESET}`);
  if (estado === "esperando") campos.push(`${GRIS}lo levanto solo en un momento${RESET}`);
  if (estado === "rendido") campos.push(`${ROJO}5 caídas en ${VENTANA_MS / 1000}s${RESET}`);

  if (salud) {
    const grupos = Number(salud.groups ?? 0);
    campos.push(`${GRIS}${grupos} grupo${grupos === 1 ? "" : "s"}${RESET}`);
    campos.push(`${GRIS}↑ ${hace(Number(salud.uptimeSec) || 0)}${RESET}`);
  }
  if (reinicios > 0) campos.push(`${GRIS}⟳ ${reinicios}${RESET}`);
  if (pid) campos.push(`${GRIS}pid ${pid}${RESET}`);

  const metricas = [];
  if (salud) {
    metricas.push(`${GRIS}mem${RESET} ${salud.memoryMB ?? salud.memoria ?? "?"}M`);
    metricas.push(`${GRIS}cola${RESET} ${salud.queue ?? 0}`);
    const riesgo = Number(salud.risk?.score ?? salud.risk ?? 0);
    metricas.push(`${GRIS}riesgo${RESET} ${riesgo}`);
    // Solo si hay: un cero permanente no informa de nada.
    const inciertos = Number(salud.uncertain ?? 0);
    if (inciertos > 0) metricas.push(`${AMBAR}sin acuse${RESET} ${inciertos}`);
  }
  // Compacto a propósito: en un móvil cada columna cuenta.
  if (equipo?.disco) metricas.push(`${GRIS}disco${RESET} ${gb(equipo.disco.libre).replace(" GB", "G")}`);
  if (equipo?.bateria) metricas.push(`${GRIS}bat${RESET} ${equipo.bateria.pct}%`);
  if (equipo?.memoria) {
    const m = equipo.memoria;
    metricas.push(`${GRIS}ram${RESET} ${(m.usadoMB / 1024).toFixed(1)}/${(m.totalMB / 1024).toFixed(1)}G`);
  }

  // Acomodo voraz: lo que no cabe en la línea actual pasa a la siguiente.
  const lineas = [];
  let actual = "";
  const meter = (pieza, separador = "  ") => {
    const candidato = actual ? actual + separador + pieza : pieza;
    if (visible(candidato) <= ancho) {
      actual = candidato;
    } else {
      if (actual) lineas.push(actual);
      actual = pieza;
    }
  };

  for (const c of campos) meter(c, "  ");
  if (actual) {
    lineas.push(actual);
    actual = "";
  }
  for (const m of metricas) meter(m, " · ");
  if (actual) lineas.push(actual);

  if (url) {
    const texto = `${GRIS}web${RESET} ${url}`;
    lineas.push(visible(texto) <= ancho ? texto : `${GRIS}web${RESET} ${recortar(url, Math.max(4, ancho - 4))}`);
  }

  return lineas;
}

/** Dibuja la caja alrededor de las líneas ya armadas. */
export function enmarcar(lineas, ancho, titulo = MARCA) {
  const interior = Math.max(1, ancho - 4);
  const tituloTxt = ` ${titulo} `;
  const cabecera = `${AZUL}╭${tituloTxt}${"─".repeat(Math.max(0, ancho - 2 - visible(tituloTxt)))}╮${RESET}`;
  const cuerpo = lineas.map((l) => `${AZUL}│${RESET} ${rellenar(l, interior)} ${AZUL}│${RESET}`);
  const pie = `${AZUL}╰${"─".repeat(Math.max(0, ancho - 2))}╯${RESET}`;
  return [cabecera, ...cuerpo, pie];
}

/**
 * Arma la pantalla entera: caja fija arriba, registro debajo, pie.
 * Es pura a propósito (entra estado, sale texto) para poder probarla sin
 * abrir una terminal.
 *
 * @returns {{lineas: string[], pie: string}} lineas ya ajustadas al ancho
 */
export function componerPantalla({
  estado = "detenido",
  reinicios = 0,
  pid = 0,
  salud = null,
  equipo = null,
  url = "",
  version = "?",
  registro = [],
  ancho = 72,
  alto = 24,
} = {}) {
  const cabecera = enmarcar(
    construirCabecera({ estado, reinicios, pid, salud, equipo, ancho: ancho - 4, url }),
    ancho,
    `${MARCA} ${version}`,
  );
  const pie = `${GRIS}Ctrl+C parar · r reiniciar${RESET}`;
  const hueco = Math.max(1, alto - cabecera.length - 1);

  const envueltas = [];
  let avisadoElQr = false;
  for (const l of registro) {
    if (esArteAncho(l, ancho)) {
      if (!avisadoElQr) {
        envueltas.push(`${GRIS}▚ ese dibujo no cabe en el panel: mira el registro con npm run vigia${RESET}`);
        avisadoElQr = true;
      }
      continue;
    }
    envueltas.push(...ajustar(l, ancho));
  }
  const cola = envueltas.slice(-hueco);

  // El registro se pega debajo de la caja y se rellena por abajo: así no
  // queda un hueco raro entre el panel y lo que va diciendo el bot.
  const lineas = [...cabecera, ...cola];
  while (lineas.length < alto - 1) lineas.push("");

  return { lineas, pie };
}

// ─────────────────────────── ejecución ───────────────────────────

const esPrincipal = () => {
  const entrada = process.argv[1];
  if (!entrada) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entrada)).href;
  } catch {
    return false;
  }
};

const SESSION_DIR = process.env.SESSION_DIR || "./Sessions/Owner";

/**
 * Decide qué número lleva el bot y lo deja en los argumentos del hijo.
 *
 * Devuelve los argumentos que hay que pasarle al bot, o `null` si no se
 * puede arrancar (en cuyo caso ya se ha explicado el motivo).
 *
 * @param {boolean} tty  si la salida es una terminal (la del panel)
 * @returns {Promise<string[]|null>}
 */
async function resolverVinculacion(tty) {
  const args = parseArgs(ARGS);
  const plan = planDeVinculacion({
    args,
    env: process.env,
    sesion: estadoSesion(SESSION_DIR),
    // Para preguntar hace falta poder ESCRIBIR: la entrada tiene que ser
    // una terminal, no basta con que la salida lo sea.
    hayTerminal: tty && Boolean(process.stdin.isTTY),
  });

  if (plan.accion === "salir") {
    const lineas = [
      "",
      ui.estado("error", `no hay una terminal donde preguntarte el número (${plan.motivo}).`),
      "  " + ui.COLOR.tenue("Se arranca sin preguntar de dos maneras:"),
      "",
      "    " + ui.COLOR.papel("npm start -- --code 521XXXXXXXXXX"),
      "    " + ui.COLOR.papel("PAIRING_NUMBER=521XXXXXXXXXX npm start"),
      "",
      "  " + ui.COLOR.tenue("El número es el tuyo, el de la cuenta de WhatsApp que va a llevar el bot."),
      "",
    ];
    console.log(lineas.join("\n"));
    return null;
  }

  if (plan.accion !== "preguntar") return ARGS;

  // Panel primero y pregunta después: se explica qué va a pasar antes de
  // pedir nada, que es justo lo que faltaba cuando el bot se iba directo
  // al QR.
  console.log("");
  console.log(ui.panelVinculacion().join("\n"));
  const numero = await preguntarLinea(ui.preguntaNumero());
  const limpio = parseArgs(["--code", numero.trim()]).phone;
  if (!limpio) {
    console.log("");
    console.log(ui.estado("error", "ese número no tiene dígitos usables."));
    console.log("  " + ui.COLOR.tenue("Escríbelo con el país delante: +52 1 55 1234 5678."));
    console.log("");
    return null;
  }
  console.log(ui.estado("ok", `vinculando con el número ${limpio}.`));
  return [...ARGS, "--code", limpio];
}

/** Una línea de la terminal, sin romper el modo normal ni dejar residuos. */
function preguntarLinea(pregunta) {
  return new Promise((listo) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pregunta, (respuesta) => {
      rl.close();
      listo(respuesta);
    });
  });
}

async function principal() {
  const tty = Boolean(process.stdout.isTTY);
  const props = { version: leeVersion() };
  const estado = { nombre: "arrancando", salud: null, reinicios: 0, pid: 0, ultimoAviso: "" };
  let lineas = [];
  let parcial = "";
  let pintando = false;
  let ultimoPintado = 0;
  let timer = null;

  // ── el bot ────────────────────────────────────────────────────
  // ── la vinculación, antes de nada ─────────────────────────────
  // El bot NO puede preguntar por su cuenta: se lanza con la entrada
  // cerrada para que el panel sea lo único que escribe en pantalla. Por
  // eso la pregunta se hace aquí, en el proceso que sí tiene la
  // terminal, y el número se le pasa al bot ya resuelto. Antes no se
  // hacía: el bot arrancaba a ciegas y acababa enseñando un QR.
  const vinculacion = await resolverVinculacion(tty);
  if (vinculacion === null) {
    // Todavía no hay panel, ni supervisor, ni temporizadores: se sale sin
    // más y con código 1 para que un servicio sepa que no arrancó.
    process.exitCode = 1;
    return;
  }

  const supervisor = crearSupervisor({
    raiz: RAIZ,
    argumentos: vinculacion,
    capturar: tty,
    ganchos: {
      arrancado: ({ pid }) => {
        estado.pid = pid;
        estado.nombre = "activo";
        anotar("bot arrancado");
        pintar();
      },
      pidioReiniciar: ({ reinicios }) => {
        estado.reinicios = reinicios;
        estado.nombre = "reiniciando";
        estado.salud = null;
        estado.pid = 0;
        anotar(`pidió reiniciar (nº ${reinicios})`);
        pintar();
      },
      reiniciando: () => {
        estado.nombre = "arrancando";
        pintar();
      },
      cayo: ({ code, signal, esperaMs }) => {
        estado.nombre = "esperando";
        estado.salud = null;
        estado.pid = 0;
        const como = signal ? `señal ${signal}` : `código ${code}`;
        anotar(`se cayó (${como}); vuelvo en ${(esperaMs / 1000).toFixed(1)}s`);
        pintar();
      },
      rendido: ({ caidas }) => {
        estado.nombre = "rendido";
        anotar(`se cayó ${caidas} veces en ${VENTANA_MS / 1000}s; dejo de intentarlo`);
        pintar();
      },
      salida: (texto) => tragar(texto),
    },
  });

  // ── el flujo de texto del bot ─────────────────────────────────
  function anotar(texto) {
    const hora = new Date().toTimeString().slice(0, 8);
    for (const trozo of String(texto).split("\n")) {
      lineas.push(`${GRIS}${hora}${RESET}  ${trozo}`);
      // Sin panel dibujado (VPS, journalctl, nohup) esto es todo lo que se ve.
      if (!tty) console.log(`${hora}  ${trozo}`);
    }
    if (lineas.length > HISTORIAL) lineas = lineas.slice(-HISTORIAL);
  }

  function tragar(texto) {
    const limpio = limpiarSalida(texto);
    const todo = parcial + limpio;
    const partes = todo.split("\n");
    parcial = partes.pop() || "";
    for (const p of partes) {
      lineas.push(p);
    }
    if (lineas.length > HISTORIAL) lineas = lineas.slice(-HISTORIAL);
    pintar();
  }

  // ── el panel ──────────────────────────────────────────────────
  async function leerSalud() {
    try {
      const r = await fetch(`${URL_BASE}/health`, { signal: AbortSignal.timeout(800) });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  // La batería y el disco cambian despacio: con leerlos en cada repintado
  // basta, y son tres lecturas de /sys que no cuestan nada.
  const datosEquipo = () => ({ disco: disco(), bateria: bateria(), memoria: memoriaSistema(), android: datosAndroid() });

  function pintar(forzar = false) {
    if (!tty || pintando) return;
    const ahora = Date.now();
    if (!forzar && ahora - ultimoPintado < PINTAR_MIN_MS) return;
    pintando = true;
    ultimoPintado = ahora;

    const ancho = Math.max(40, Math.min(process.stdout.columns || 80, 100));
    const alto = Math.max(12, process.stdout.rows || 24);

    const { lineas: marco_lineas, pie } = componerPantalla({
      estado: estado.nombre,
      reinicios: estado.reinicios,
      pid: estado.pid,
      salud: estado.salud,
      equipo: datosEquipo(),
      url: estado.url,
      version: props.version,
      registro: lineas,
      ancho,
      alto,
    });

    // Redibujo completo: home, cada línea con borrado hasta el final, y
    // limpieza de lo que sobre. El cursor se queda al final del pie.
    const marco = [
      "\x1b[?2026h", // salida sincronizada si la terminal la entiende; si no, se ignora
      "\x1b[H",
      ...marco_lineas.map((l) => `${l}\x1b[K\r\n`),
      `${pie}\x1b[K`,
      "\x1b[J",
      "\x1b[?2026l",
    ].join("");

    process.stdout.write(marco);
    pintando = false;
  }

  function urlVisible() {
    const puerto = process.env.PORT || 3000;
    // LOOPBACK=0 significa que el panel se abre a la red: entonces la
    // dirección útil es la de la wifi, no la de loopback.
    if (process.env.LOOPBACK === "0") {
      const ip = ipLocal();
      if (ip) return `http://${ip}:${puerto}`;
    }
    return `http://127.0.0.1:${puerto}`;
  }

  function entrarPantalla() {
    if (!tty) return;
    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J");
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch {
        /* sin teclado no pasa nada: se para con Ctrl+C */
      }
      process.stdin.resume();
      process.stdin.on("data", (buf) => {
        const t = buf.toString();
        if (t === "\u0003" || t === "q") return salir();
        if (t === "r") {
          if (supervisor.reiniciar()) anotar("reinicio pedido desde la consola");
          pintar(true);
        }
      });
    }
  }

  function salirPantalla() {
    if (!tty) return;
    try {
      process.stdin.setRawMode(false);
    } catch {
      /* nada que devolver */
    }
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  }

  // Se marca y se deja que el bucle termine solo: así el bot cierra
  // limpio en vez de quedar a medias. El temporizador es solo la red de
  // seguridad por si el bot se niega a morir.
  let saliendo = false;
  function salir(codigo = 0) {
    if (saliendo) return;
    saliendo = true;
    anotar("parando…");
    if (tty) {
      estado.nombre = "detenido";
      pintar(true);
    }
    supervisor.parar();
    setTimeout(() => {
      salirPantalla();
      process.exit(codigo);
    }, 4000).unref();
  }

  process.on("SIGINT", () => salir(0));
  process.on("SIGTERM", () => salir(0));
  process.on("SIGWINCH", () => pintar(true));

  estado.url = urlVisible();
  entrarPantalla();

  if (tty) {
    timer = setInterval(async () => {
      estado.salud = await leerSalud();
      pintar();
    }, TICK_MS);
  } else {
    // Sin terminal: líneas normales, como el vigía. Es lo que se ve en
    // `journalctl`, en pm2 o en un archivo con nohup.
    console.log(`${MARCA} ${props.version} · sin terminal, no dibujo el panel`);
    console.log(`panel web: ${estado.url}`);
    console.log("vigía activo: si el bot se cae o pide reiniciar, lo levanto solo");
    timer = setInterval(() => {
      if (estado.nombre === "activo") {
        console.log(`[${new Date().toTimeString().slice(0, 8)}] activo · pid ${estado.pid} · reinicios ${estado.reinicios}`);
      }
    }, 60_000);
    timer.unref();
  }

  anotar("consola lista");
  pintar(true);

  const final = await supervisor.ejecutar();
  clearInterval(timer);
  salirPantalla();
  console.log(final === "rendido" ? `${MARCA}: me rendí, revisa el error de arriba.` : `${MARCA}: parado.`);
  process.exit(final === "rendido" ? 1 : 0);
}

function leeVersion() {
  try {
    // JSON.parse del archivo, no `import ... with { type: "json" }`, que
    // cambió de sintaxis entre versiones de Node.
    return JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8")).version || "?";
  } catch {
    return "?";
  }
}

if (esPrincipal()) {
  principal().catch((e) => {
    try {
      process.stdout.write("\x1b[?25h\x1b[?1049l");
    } catch {
      /* da igual */
    }
    console.error("consola:", e.message);
    process.exit(1);
  });
}

export default principal;
