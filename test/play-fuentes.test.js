/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  play-fuentes.test.js — Las piezas de `.play` que se pueden probar
//  sin internet: nombres de archivo, duraciones, validación de MP4 y
//  lectura de enlaces de YouTube.
//
//  Al partir play.js (753 líneas) en dos, estas cuatro funciones
//  cambiaron de casa; las pruebas son la garantía de que se mudaron
//  con el mismo comportamiento.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeFilename,
  parseDurationSeconds,
  esMp4Valido,
  getVideoId,
  descargarAudioSmart,
} from "../src/lib/play-fuentes.js";

test("sanitizeFilename deja un nombre de archivo usable", () => {
  assert.equal(sanitizeFilename("Funk Mambo.mp3"), "Funk Mambo");
  assert.equal(sanitizeFilename("a/b\\c:d*e?f\"g<h>i|j"), "abcdefghij");
  assert.equal(sanitizeFilename("   muchos    espacios   "), "muchos espacios");
  assert.equal(sanitizeFilename(""), "audio", "sin nombre cae a 'audio'");
  assert.equal(sanitizeFilename("%%%"), "%%%", "solo se quitan los caracteres prohibidos");
  assert.equal(sanitizeFilename("x".repeat(500)).length, 100, "se corta a 100");
});

test("parseDurationSeconds entiende mm:ss y hh:mm:ss", () => {
  assert.equal(parseDurationSeconds("1:30"), 90);
  assert.equal(parseDurationSeconds("1:02:03"), 3723);
  assert.equal(parseDurationSeconds(212), 212, "si ya es número, se respeta");
  assert.equal(parseDurationSeconds(""), 0);
  assert.equal(parseDurationSeconds("basura"), 0);
  assert.equal(parseDurationSeconds("1:xx"), 0);
});

test("esMp4Valido reconoce la firma ftyp", () => {
  const bueno = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.alloc(8)]);
  assert.equal(esMp4Valido(bueno), true);
  assert.equal(esMp4Valido(Buffer.from("no soy un mp4")), false);
  assert.equal(esMp4Valido(Buffer.alloc(4)), false, "demasiado corto");
  assert.equal(esMp4Valido(null), false);
  assert.equal(esMp4Valido(undefined), false);
});

test("getVideoId acepta id suelto y todos los formatos de enlace", () => {
  const id = "dQw4w9WgXcQ";
  assert.equal(getVideoId(id), id, "el id pelado vale");
  assert.equal(getVideoId(`https://youtu.be/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/watch?v=${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/shorts/${id}`), id);
  assert.equal(getVideoId(`https://www.youtube.com/live/${id}`), id);
  assert.equal(getVideoId(`https://m.youtube.com/watch?list=PLx&v=${id}&t=30`), id);
  assert.equal(getVideoId(""), null);
  assert.equal(getVideoId("buscar funk mambo"), null, "una búsqueda no es un id");
  assert.equal(getVideoId(null), null);
});

test("descargarAudioSmart invalida un stream 502 y prueba otro proveedor", async () => {
  const query = "RUXXS Echidna";
  const sources = [
    { url: "https://cdn.invalid/expired", provider: "Spotify Turbo CDN" },
    { url: "https://cdn.invalid/working", provider: "Nexray Turbo CDN", seconds: 91 },
  ];
  const calls = [];
  const urls = [];
  const invalidated = [];
  const getAudioUrl = async (q, options) => {
    calls.push({ q, options });
    return sources.find(source => !options.excludeProviders.includes(source.provider)) || null;
  };
  const fastFetch = async url => {
    urls.push(url);
    return url.endsWith("expired")
      ? new Response("Bad Gateway", { status: 502 })
      : new Response(Buffer.alloc(32 * 1024, 0x49), { status: 200 });
  };

  const result = await descargarAudioSmart(
    { title: "RUXXS", channel: "Echidna", url: "https://youtu.be/dQw4w9WgXcQ" },
    { getAudioUrl, fastFetch, invalidateAudioUrl: async q => invalidated.push(q) },
  );

  assert.deepEqual(urls, ["https://cdn.invalid/expired", "https://cdn.invalid/working"]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].options.excludeProviders, ["Spotify Turbo CDN"]);
  assert.equal(calls[1].options.refresh, true);
  assert.deepEqual(invalidated, [query]);
  assert.equal(result.origen, "Nexray Turbo CDN");
  assert.equal(result.seconds, 91);
  assert.equal(result.buffer.length, 32 * 1024);
});

test("descargarAudioSmart agota tres CDNs y devuelve el último error HTTP", async () => {
  const providers = ["Spotify Turbo CDN", "Nexray Turbo CDN", "SoundCloud Progressive CDN"];
  const calls = [];
  const invalidated = [];
  const getAudioUrl = async (_query, options) => {
    calls.push(options.excludeProviders);
    const provider = providers.find(name => !options.excludeProviders.includes(name));
    return provider ? { url: `https://cdn.invalid/${provider}`, provider } : null;
  };
  const fastFetch = async () => new Response("Bad Gateway", { status: 502 });

  await assert.rejects(
    descargarAudioSmart(
      { title: "tema", channel: "artista" },
      { getAudioUrl, fastFetch, invalidateAudioUrl: async query => invalidated.push(query) },
    ),
    /HTTP 502 al descargar stream/,
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(invalidated, ["tema artista", "tema artista", "tema artista"]);
  assert.deepEqual(calls[2], providers.slice(0, 2));
});
