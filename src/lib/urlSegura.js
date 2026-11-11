/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  urlSegura.js — pedir una URL que escribe otra persona sin abrirle
//  la puerta de la red donde vive el bot.
//
//  El problema (SSRF): un comando que hace `fetch(url)` con lo que le
//  manda cualquiera convierte al bot en un proxy hacia dentro. Con
//  `http://127.0.0.1:3000/`, `http://192.168.1.1/` o
//  `http://169.254.169.254/latest/meta-data/` el que escribe el
//  mensaje lee servicios que solo existen en esa máquina o en su red,
//  y recibe la respuesta por el chat.
//
//  Qué se comprueba aquí:
//    · solo `http://` y `https://`, y sin credenciales dentro de la URL
//    · ni IP privada, reservada, loopback, link-local ni multicast
//    · tampoco después de resolver el nombre por DNS (un dominio
//      público puede apuntar a 127.0.0.1)
//    · la comprobación se repite en CADA salto de redirección
//    · la dirección se valida otra vez al conectar (lookup del agente),
//      que es lo único que cubre el DNS que cambia de respuesta entre
//      la comprobación y la conexión (rebinding)
//    · el cuerpo se lee en flujo y se corta al pasar del máximo:
//      `Content-Length` puede faltar, mentir o crecer al descomprimir
// ═══════════════════════════════════════════════════════════════════

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import fetchNativo from "node-fetch";

/** El destino no es alcanzable desde fuera: es la red de la máquina. */
export class DestinoNoPermitido extends Error {
  constructor(detalle) {
    super("destino no permitido: " + detalle);
    this.name = "DestinoNoPermitido";
    this.code = "SSRF";
  }
}

/** El cuerpo pasó del máximo permitido y se cortó la descarga. */
export class CuerpoDemasiadoGrande extends Error {
  constructor(bytes, maximo) {
    super(`respuesta demasiado grande (más de ${maximo} bytes; se cortó en ${bytes})`);
    this.name = "CuerpoDemasiadoGrande";
    this.code = "CUERPO_GRANDE";
    this.bytes = bytes;
    this.maximo = maximo;
  }
}

/** Nombres que nunca apuntan a un servicio público. */
const NOMBRES_PROHIBIDOS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "nomad",
  "consul",
]);

/**
 * ¿La dirección IPv4 cae en un rango que no se puede alcanzar desde internet?
 * Se compara por número, no por texto: así no hay atajos con `0177.0.0.1`
 * ni con `127.1`.
 *
 * @param {string} ip
 * @returns {boolean}
 */
function ipv4Reservada(ip) {
  const partes = ip.split(".");
  if (partes.length !== 4) return true; // algo raro: se trata como no permitido
  const [a, b, c, d] = partes.map((p) => Number(p));
  if ([a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;

  if (a === 0) return true; // 0.0.0.0/8 "esta red"
  if (a === 10) return true; // 10/8 privada
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local (metadatos de nube)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 privada
  if (a === 192 && b === 168) return true; // 192.168/16 privada
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0/24, 192.0.2/24
  if (a === 192 && b === 88 && c === 99) return true; // relevo 6to4
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100/24
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113/24
  if (a >= 224) return true; // multicast (224/4) y reservado (240/4), incluido el broadcast
  return false;
}

/**
 * Parte una IPv6 en sus ocho grupos. Devuelve `null` si no es IPv6.
 * @param {string} ip
 * @returns {number[] | null}
 */
function gruposV6(ip) {
  let texto = ip;
  const zona = texto.indexOf("%");
  if (zona !== -1) texto = texto.slice(0, zona); // fe80::1%en0
  if (!texto.includes(":")) return null;

  // Una IPv4 al final ("::ffff:127.0.0.1") se convierte en dos grupos.
  const ultimaV4 = texto.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (ultimaV4) {
    const [a, b, c, d] = ultimaV4[1].split(".").map(Number);
    texto = texto.slice(0, -ultimaV4[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }

  const [izquierda, derecha] = texto.split("::");
  const cabeza = izquierda ? izquierda.split(":") : [];
  const cola = derecha ? derecha.split(":") : [];
  const relleno = texto.includes("::") ? 8 - cabeza.length - cola.length : 0;
  const grupos = [...cabeza, ...Array(Math.max(0, relleno)).fill("0"), ...cola];
  if (grupos.length !== 8) return null;
  const numeros = grupos.map((g) => parseInt(g || "0", 16));
  if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) return null;
  return numeros;
}

/** IPv4 incrustada en los dos últimos grupos, en notación decimal. */
function v4DesdeGrupos(grupos) {
  const alto = grupos[6];
  const bajo = grupos[7];
  return [alto >> 8, alto & 0xff, bajo >> 8, bajo & 0xff].join(".");
}

/**
 * ¿La IP (v4 o v6) es de las que no deben alcanzarse desde un comando?
 * @param {string} ip
 * @returns {boolean}
 */
export function esIpReservada(ip) {
  const limpia = String(ip || "").trim().replace(/^\[|\]$/g, "");
  if (!limpia) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(limpia)) return ipv4Reservada(limpia);

  const grupos = gruposV6(limpia);
  if (!grupos) return true; // no es una IP: por si acaso, no se permite

  const [g0, g1, g2, g3, g4, g5] = grupos;
  if (grupos.every((g) => g === 0)) return true; // ::
  if (grupos.slice(0, 7).every((g) => g === 0) && grupos[7] === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 única local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentación
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 descartable
  if (g0 === 0x0064 && g1 === 0xff9b) return ipv4Reservada(v4DesdeGrupos(grupos)); // NAT64
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return ipv4Reservada(v4DesdeGrupos(grupos)); // ::ffff:a.b.c.d (IPv4 mapeada)
  }
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    // ::a.b.c.d (IPv4 compatible, obsoleta pero se sigue usando)
    return ipv4Reservada(v4DesdeGrupos(grupos));
  }
  return false;
}

/** Resolver por defecto: el del sistema, con todas las respuestas. */
async function resolverPorDefecto(hostname) {
  const r = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return r.map((x) => x.address);
}

/**
 * Comprueba que la URL se puede pedir. Lanza `DestinoNoPermitido` si no.
 *
 * @param {string | URL} destino
 * @param {{resolver?: (hostname: string) => Promise<string[]>}} [opciones]
 * @returns {Promise<URL>}
 */
export async function assertDestinoSeguro(destino, { resolver = resolverPorDefecto } = {}) {
  let url;
  try {
    url = new URL(String(destino));
  } catch {
    throw new DestinoNoPermitido("no es una URL válida");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DestinoNoPermitido("solo http y https (" + url.protocol + ")");
  }
  if (url.username || url.password) {
    throw new DestinoNoPermitido("la URL lleva credenciales dentro");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new DestinoNoPermitido("la URL no tiene host");
  if (NOMBRES_PROHIBIDOS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new DestinoNoPermitido("nombre interno: " + host);
  }

  // Si ya es una IP, no hay DNS que consultar.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    if (esIpReservada(host)) throw new DestinoNoPermitido("IP interna: " + host);
    return url;
  }

  let direcciones;
  try {
    direcciones = await resolver(host);
  } catch (err) {
    throw new DestinoNoPermitido("no se pudo resolver " + host + ": " + (err?.message || err));
  }
  if (!Array.isArray(direcciones) || direcciones.length === 0) {
    throw new DestinoNoPermitido("el nombre " + host + " no resuelve a ninguna dirección");
  }
  for (const ip of direcciones) {
    if (esIpReservada(ip)) {
      throw new DestinoNoPermitido(host + " resuelve a " + ip + ", que es una dirección interna");
    }
  }
  return url;
}

/**
 * `lookup` para los agentes de http/https: la dirección se comprueba en el
 * momento de conectar, así un DNS que cambia de respuesta entre la
 * comprobación y la conexión tampoco cuela.
 */
export function lookupSeguro(hostname, opciones, callback) {
  const opc = typeof opciones === "object" && opciones ? opciones : {};
  dns.lookup(hostname, { ...opc, all: true }, (err, direcciones) => {
    if (err) return callback(err);
    const lista = Array.isArray(direcciones) ? direcciones : [{ address: direcciones, family: opc.family || 0 }];
    for (const d of lista) {
      if (esIpReservada(d?.address)) {
        return callback(new DestinoNoPermitido(hostname + " → " + d?.address));
      }
    }
    if (opc.all) return callback(null, lista);
    const primera = lista[0] || {};
    return callback(null, primera.address, primera.family);
  });
}

/**
 * Agentes con el lookup vigilado. Se crean una vez y se reutilizan: cada
 * agente mantiene su propio grupo de conexiones.
 */
const AGENTES = {
  "http:": new http.Agent({ keepAlive: false, lookup: lookupSeguro }),
  "https:": new https.Agent({ keepAlive: false, lookup: lookupSeguro }),
};

/** Códigos que significan "esto está en otro sitio". */
const REDIRECCIONES = new Set([301, 302, 303, 307, 308]);

/**
 * Lee el cuerpo de una respuesta sin comerse la memoria: si pasa del
 * máximo, corta la descarga y lanza `CuerpoDemasiadoGrande`.
 *
 * Los bytes que se cuentan son los que llegan ya descomprimidos, que es
 * lo que de verdad ocupa memoria (una gzip de 1 KB puede soltar 1 GB).
 *
 * @param {{headers: {get(n: string): string | null}, body: any}} respuesta
 * @param {number} maximo
 * @returns {Promise<Buffer>}
 */
export async function leerCuerpoConLimite(respuesta, maximo) {
  const declarado = Number(respuesta?.headers?.get?.("content-length"));
  if (Number.isFinite(declarado) && declarado > maximo) {
    throw new CuerpoDemasiadoGrande(declarado, maximo);
  }
  const cuerpo = respuesta?.body;
  if (!cuerpo) return Buffer.alloc(0);

  const trozos = [];
  let total = 0;
  for await (const trozo of cuerpo) {
    const bytes = Buffer.isBuffer(trozo) ? trozo : Buffer.from(trozo);
    total += bytes.length;
    if (total > maximo) {
      // Que el servidor deje de mandar en cuanto se sepa que sobra.
      try {
        if (typeof cuerpo.destroy === "function") cuerpo.destroy();
        else if (typeof cuerpo.cancel === "function") await cuerpo.cancel();
      } catch {
        /* si no se puede cortar, el error de abajo ya lo dice */
      }
      throw new CuerpoDemasiadoGrande(total, maximo);
    }
    trozos.push(bytes);
  }
  return Buffer.concat(trozos, total);
}

/**
 * GET con las comprobaciones de arriba. Devuelve la respuesta y una función
 * para leer el cuerpo con tope.
 *
 * @param {string} destino
 * @param {object} [opciones]
 * @param {number} [opciones.maxBytes]        tope del cuerpo (100 MB por defecto)
 * @param {number} [opciones.timeoutMs]       tope de tiempo por salto
 * @param {number} [opciones.maxRedirecciones]
 * @param {object} [opciones.cabeceras]
 * @param {Function} [opciones.fetchImpl]     para las pruebas, sin red
 * @param {Function} [opciones.resolver]      para las pruebas, sin DNS
 * @param {object} [opciones.agentes]         para las pruebas, sin agentes
 * @returns {Promise<{respuesta: any, urlFinal: string, leer: (max?: number) => Promise<Buffer>}>}
 */
export async function fetchSeguro(destino, opciones = {}) {
  const {
    maxBytes = 100 * 1024 * 1024,
    timeoutMs = 20000,
    maxRedirecciones = 3,
    cabeceras = {},
    fetchImpl = fetchNativo,
    resolver,
    agentes = AGENTES,
  } = opciones;

  let actual = await assertDestinoSeguro(destino, { resolver });

  for (let salto = 0; salto <= maxRedirecciones; salto++) {
    const respuesta = await fetchImpl(actual.toString(), {
      redirect: "manual",
      headers: cabeceras,
      agent: (url) => agentes[url.protocol] || undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const estado = Number(respuesta.status);
    if (!REDIRECCIONES.has(estado)) {
      return {
        respuesta,
        urlFinal: actual.toString(),
        leer: (tope = maxBytes) => leerCuerpoConLimite(respuesta, tope),
      };
    }

    const destinoSiguiente = respuesta.headers?.get?.("location");
    if (!destinoSiguiente) throw new DestinoNoPermitido("redirección sin destino");
    // Cada salto se valida como si fuera el primero.
    actual = await assertDestinoSeguro(new URL(destinoSiguiente, actual).toString(), { resolver });
  }

  throw new DestinoNoPermitido("demasiadas redirecciones (más de " + maxRedirecciones + ")");
}

export default { fetchSeguro, assertDestinoSeguro, leerCuerpoConLimite, esIpReservada, lookupSeguro };
