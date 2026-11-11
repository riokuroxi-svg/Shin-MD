/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Las reglas que impiden que `.get` sea un proxy hacia dentro de la red.
// Todo se prueba sin red: las IP y los nombres se resuelven con un resolver
// de mentira y el `fetch` se sustituye por uno que devuelve lo que diga cada
// caso, así que la suite no depende de que internet esté de buenas.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  esIpReservada,
  assertDestinoSeguro,
  leerCuerpoConLimite,
  lookupSeguro,
  fetchSeguro,
  DestinoNoPermitido,
  CuerpoDemasiadoGrande,
} from "../src/lib/urlSegura.js";

const PUBLICO = "93.184.216.34"; // no es de nadie en particular, solo pública

/** Resolver de mentira: nombre → direcciones. */
function resolverQueDevuelve(mapa) {
  return async (host) => {
    if (mapa[host]) return mapa[host];
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  };
}

/** Respuesta con cuerpo de verdad, para probar el corte en flujo. */
function respuestaDeBytes(bytes, porTrozo = 8192) {
  let enviado = 0;
  const cuerpo = new ReadableStream({
    pull(control) {
      if (enviado >= bytes) return control.close();
      const n = Math.min(porTrozo, bytes - enviado);
      enviado += n;
      control.enqueue(new Uint8Array(n));
    },
  });
  return new Response(cuerpo, { headers: { "content-type": "application/octet-stream" } });
}

test("las direcciones internas se reconocen por número, no por texto", () => {
  const internas = [
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "255.255.255.255",
    "224.0.0.1",
    "198.18.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:192.168.0.10",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "no-es-una-ip",
  ];
  for (const ip of internas) {
    assert.equal(esIpReservada(ip), true, `${ip} debería estar bloqueada`);
  }
});

test("las direcciones públicas pasan", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(esIpReservada(ip), false, `${ip} debería poder pedirse`);
  }
});

test("solo http y https, sin credenciales dentro y con host", async () => {
  const casos = [
    "file:///etc/passwd",
    "ftp://ejemplo.com/x",
    "gopher://ejemplo.com/",
    "javascript:alert(1)",
    "http://usuario:clave@ejemplo.com/",
  ];
  for (const url of casos) {
    await assert.rejects(() => assertDestinoSeguro(url), DestinoNoPermitido, url);
  }
  await assert.rejects(() => assertDestinoSeguro("http://"), DestinoNoPermitido);
});

test("los destinos internos se rechazan sin salir a la red", async () => {
  const casos = [
    "http://127.0.0.1:3000/",
    "http://localhost:8080/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.1.2.3/",
    "http://192.168.0.1/",
    "http://0.0.0.0/",
    "http://caja.local/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://algo.localhost/",
  ];
  for (const url of casos) {
    await assert.rejects(() => assertDestinoSeguro(url), DestinoNoPermitido, url);
  }
});

test("un nombre público que resuelve a una IP interna se rechaza", async () => {
  const resolver = resolverQueDevuelve({
    "listo.example": [PUBLICO],
    "trampa.example": ["127.0.0.1"],
    "mezcla.example": [PUBLICO, "10.0.0.5"],
  });

  const ok = await assertDestinoSeguro("https://listo.example/x", { resolver });
  assert.equal(ok.hostname, "listo.example");

  for (const host of ["trampa.example", "mezcla.example"]) {
    await assert.rejects(
      () => assertDestinoSeguro(`https://${host}/x`, { resolver }),
      DestinoNoPermitido,
      host
    );
  }
});

test("un nombre que no resuelve no llega a pedirse", async () => {
  await assert.rejects(
    () => assertDestinoSeguro("https://no-existe.example/", { resolver: resolverQueDevuelve({}) }),
    DestinoNoPermitido
  );
});

test("lookupSeguro corta la conexión si el DNS devuelve una IP interna", async () => {
  const intentar = (host) =>
    new Promise((resolve, reject) => {
      lookupSeguro(host, { all: false }, (err, address) => (err ? reject(err) : resolve(address)));
    });

  // localhost resuelve a 127.0.0.1 en cualquier máquina: no hace falta red.
  await assert.rejects(() => intentar("localhost"), DestinoNoPermitido);
});

test("fetchSeguro sigue una redirección, pero no hacia dentro", async () => {
  const pedidas = [];
  const fetchImpl = async (url) => {
    pedidas.push(url);
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secreto" } });
  };

  await assert.rejects(
    () =>
      fetchSeguro("https://publico.example/x", {
        fetchImpl,
        resolver: resolverQueDevuelve({ "publico.example": [PUBLICO] }),
      }),
    DestinoNoPermitido
  );
  assert.deepEqual(pedidas, ["https://publico.example/x"], "no debe pedirse el destino interno");
});

test("fetchSeguro no da más de las redirecciones permitidas", async () => {
  const fetchImpl = async (url) =>
    new Response(null, { status: 302, headers: { location: new URL("paso", url).toString() } });

  await assert.rejects(
    () =>
      fetchSeguro("https://publico.example/0", {
        fetchImpl,
        maxRedirecciones: 2,
        resolver: resolverQueDevuelve({ "publico.example": [PUBLICO] }),
      }),
    /demasiadas redirecciones/
  );
});

test("fetchSeguro devuelve el cuerpo cuando el destino es público", async () => {
  const fetchImpl = async () =>
    new Response("hola", { status: 200, headers: { "content-type": "text/plain" } });

  const { respuesta, urlFinal, leer } = await fetchSeguro("https://publico.example/saludo", {
    fetchImpl,
    resolver: resolverQueDevuelve({ "publico.example": [PUBLICO] }),
  });
  assert.equal(respuesta.status, 200);
  assert.equal(urlFinal, "https://publico.example/saludo");
  assert.equal((await leer()).toString("utf8"), "hola");
});

test("el cuerpo se corta al pasarse del máximo, aunque Content-Length mienta", async () => {
  const maximo = 512 * 1024;

  // 1) Cuerpo grande con un Content-Length pequeño: miente.
  const mentirosa = respuestaDeBytes(3 * 1024 * 1024);
  mentirosa.headers.set("content-length", "10");
  await assert.rejects(() => leerCuerpoConLimite(mentirosa, maximo), CuerpoDemasiadoGrande);

  // 2) Content-Length grande y cuerdo: se corta antes de leer nada.
  const declarada = respuestaDeBytes(10);
  declarada.headers.set("content-length", String(2 * 1024 * 1024));
  await assert.rejects(() => leerCuerpoConLimite(declarada, maximo), CuerpoDemasiadoGrande);

  // 3) Por debajo del tope se lee entero.
  const pequena = respuestaDeBytes(1024);
  const leido = await leerCuerpoConLimite(pequena, maximo);
  assert.equal(leido.length, 1024);
});

test(".get y .fetch: solo el dueño, y con la petición vigilada", async () => {
  const cmd = (await import("../cmds/utils/get.js")).default;
  assert.deepEqual(cmd.command, ["get", "fetch"]);
  assert.equal(cmd.ownerOnly, true, "un comando que pide URLs no puede quedar abierto a cualquiera");
  assert.equal(typeof cmd.run, "function");
});
