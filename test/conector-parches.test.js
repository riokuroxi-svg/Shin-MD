/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  conector-parches.test.js — El conector queda en el estado que
//  el bot espera.
//
//  `scripts/patch-baileys.cjs` aplica a Baileys los arreglos que la
//  librería todavía no publica. Esto vigila tres cosas:
//
//   1. Que los ocho parches estén puestos en la copia instalada.
//   2. Que el script sea idempotente y que se niegue a escribir a
//      medias cuando el ancla no está (versión nueva de Baileys).
//   3. Que los arreglos que se pueden ejercitar sin red funcionen de
//      verdad: el ack de los estados, el reenvío de multimedia y el
//      aislamiento de transacciones.
// ═══════════════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { downloadMediaMessage, buildAckStanza } from "baileys";
import { addTransactionCapability } from "baileys/lib/Utils/auth-utils.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(raiz, "scripts", "patch-baileys.cjs");
const lib = path.join(raiz, "node_modules", "baileys", "lib");

const ARCHIVOS = {
  utils: path.join(lib, "Utils", "companion-reg-client-utils.js"),
  socket: path.join(lib, "Socket", "socket.js"),
  recv: path.join(lib, "Socket", "messages-recv.js"),
  messages: path.join(lib, "Utils", "messages.js"),
  auth: path.join(lib, "Utils", "auth-utils.js"),
};

const leer = (f) => fs.readFileSync(f, "utf8");
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

function temporal(contenido = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-parche-"));
  const archivo = path.join(dir, "muestra.js");
  fs.writeFileSync(archivo, contenido, "utf8");
  return { archivo, dir };
}

// ─── Estado de la copia instalada ──────────────────────────────────

test("los ocho parches están aplicados en la copia instalada", () => {
  const r = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /los 8 parches están aplicados/);
});

test("cada parche deja su marca y la sintaxis sigue siendo válida", () => {
  const marcas = [
    [ARCHIVOS.utils, "handleCompanionRegRefresh"],
    [ARCHIVOS.socket, "CB:notification,type:companion_reg_refresh"],
    [ARCHIVOS.socket, "content: Buffer.alloc(1)"],
    [ARCHIVOS.socket, "if (!creds.me || !creds.registered)"],
    [ARCHIVOS.recv, "attrs?.stage !== 'primary_hello'"],
    [ARCHIVOS.recv, "ws.on('CB:status'"],
    [ARCHIVOS.messages, "const estadoHttp"],
    [ARCHIVOS.auth, "txStorageCompartido"],
  ];
  for (const [archivo, marca] of marcas) {
    assert.ok(leer(archivo).includes(marca), `falta "${marca}" en ${path.basename(archivo)}`);
    const check = spawnSync(process.execPath, ["--check", archivo], { encoding: "utf8" });
    assert.equal(check.status, 0, `${path.basename(archivo)}: ${check.stderr}`);
  }
});

test("volver a ejecutarlo no cambia ni un byte (idempotencia)", () => {
  const antes = Object.fromEntries(Object.entries(ARCHIVOS).map(([k, f]) => [k, hash(f)]));
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const despues = Object.fromEntries(Object.entries(ARCHIVOS).map(([k, f]) => [k, hash(f)]));
  assert.deepEqual(despues, antes);
  assert.match(r.stdout, /ya aplicado/);
});

// ─── El script no escribe a medias ─────────────────────────────────

function ejecutarReplaceOnce(rutaArchivo) {
  const codigo = `
    const { replaceOnce } = require(${JSON.stringify(script)});
    replaceOnce(${JSON.stringify(rutaArchivo)}, "ANCLA", "reemplazo", "prueba");
    process.stdout.write("aplicado");
  `;
  return spawnSync(process.execPath, ["-e", codigo], { encoding: "utf8" });
}

test("replaceOnce corta el install si el ancla no existe", () => {
  const { archivo, dir } = temporal("otra cosa\n");
  const r = ejecutarReplaceOnce(archivo);
  assert.equal(r.status, 1, "debía abortar");
  assert.match(r.stderr, /ancla no encontrada/);
  assert.equal(fs.readFileSync(archivo, "utf8"), "otra cosa\n", "no debe tocar el archivo");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("replaceOnce corta el install si el ancla está repetida", () => {
  const { archivo, dir } = temporal("ANCLA\nANCLA\n");
  const r = ejecutarReplaceOnce(archivo);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ancla ambigua \(2x\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("replaceOnce sustituye una sola vez y respeta el resto", () => {
  const { archivo, dir } = temporal("antes\nANCLA\ndespues\n");
  const r = ejecutarReplaceOnce(archivo);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(archivo, "utf8"), "antes\nreemplazo\ndespues\n");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ─── Ack de los estados ────────────────────────────────────────────

test("un <status> se ackea con class=status, que es lo que espera el servidor", () => {
  const stanza = buildAckStanza(
    { tag: "status", attrs: { id: "3A2069ED", from: "5215574370309@s.whatsapp.net", type: "media" } },
    undefined,
    "5215500000000:4@s.whatsapp.net"
  );
  assert.equal(stanza.tag, "ack");
  assert.equal(stanza.attrs.id, "3A2069ED");
  assert.equal(stanza.attrs.to, "5215574370309@s.whatsapp.net");
  assert.equal(stanza.attrs.class, "status");
  assert.equal(stanza.attrs.type, "media");
});

// ─── Reenvío de multimedia caducada ────────────────────────────────

/** Servidor local que responde lo que se le pida y cuenta las visitas. */
async function servidorDeMedios(estado) {
  const visitas = [];
  const srv = http.createServer((req, res) => {
    visitas.push(req.url);
    res.statusCode = estado;
    res.end("no");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  return {
    url: `http://127.0.0.1:${port}/media.enc`,
    visitas,
    cerrar: () => new Promise((r) => srv.close(r)),
  };
}

function mensajeConImagen(url) {
  return {
    key: { remoteJid: "120363000000000000@g.us", id: "M1", fromMe: false },
    message: {
      imageMessage: {
        url,
        mediaKey: crypto.randomBytes(32),
        mimetype: "image/jpeg",
        fileEncSha256: crypto.randomBytes(32),
        fileSha256: crypto.randomBytes(32),
        fileLength: 3,
      },
    },
  };
}

for (const estado of [404, 410, 403]) {
  test(`con la URL caducada (${estado}) se pide el reenvío en vez de fallar`, async () => {
    const srv = await servidorDeMedios(estado);
    try {
      let pedidos = 0;
      const ctx = {
        logger: { info() {}, warn() {}, error() {}, debug() {}, trace() {} },
        reuploadRequest: async () => {
          pedidos++;
          throw new Error("reenvío pedido");
        },
      };

      await assert.rejects(
        () => downloadMediaMessage(mensajeConImagen(srv.url), "buffer", {}, ctx),
        /reenvío pedido/
      );
      assert.equal(pedidos, 1, "debía pedir el reenvío de la multimedia");
      assert.equal(srv.visitas.length, 1);
    } finally {
      await srv.cerrar();
    }
  });
}

test("un error que no es de URL caducada no pide reenvío", async () => {
  const srv = await servidorDeMedios(500);
  try {
    let pedidos = 0;
    const ctx = {
      logger: { info() {}, warn() {}, error() {}, debug() {}, trace() {} },
      reuploadRequest: async () => {
        pedidos++;
        return mensajeConImagen(srv.url);
      },
    };

    await assert.rejects(() => downloadMediaMessage(mensajeConImagen(srv.url), "buffer", {}, ctx));
    assert.equal(pedidos, 0);
  } finally {
    await srv.cerrar();
  }
});

// ─── Transacciones de la sesión ────────────────────────────────────

function almacenDePrueba() {
  const datos = {};
  return {
    datos,
    async get() {
      return {};
    },
    async set(obj) {
      Object.assign(datos, obj);
    },
  };
}

const loggerMudo = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };

test("dos almacenes no comparten la transacción (aislamiento del AsyncLocalStorage)", async () => {
  const A = almacenDePrueba();
  const B = almacenDePrueba();
  const storeA = addTransactionCapability(A, loggerMudo, { maxCommitRetries: 1, delayBetweenTriesMs: 1 });
  const storeB = addTransactionCapability(B, loggerMudo, { maxCommitRetries: 1, delayBetweenTriesMs: 1 });

  await storeA.transaction(async () => {
    // B abre su propia transacción DENTRO de la de A.
    await storeB.transaction(async () => {
      await storeB.set({ session: { "1.1": { de: "B" } } });
    }, "kb");
    await storeA.set({ session: { "2.2": { de: "A" } } });
  }, "ka");

  assert.deepEqual(Object.keys(B.datos.session), ["1.1"], "B guarda lo suyo en su almacén");
  assert.deepEqual(Object.keys(A.datos.session), ["2.2"], "A no se queda con lo de B");
});

test("la transacción anidada del MISMO almacén sigue reutilizando el contexto", async () => {
  const A = almacenDePrueba();
  const store = addTransactionCapability(A, loggerMudo, { maxCommitRetries: 1, delayBetweenTriesMs: 1 });

  await store.transaction(async () => {
    await store.set({ session: { "1.1": { x: 1 } } });
    await store.transaction(async () => {
      await store.set({ session: { "2.2": { y: 2 } } });
    }, "k2");
  }, "k1");

  // Si la anidada no reutilizara el contexto, el segundo set iría por el
  // camino sin transacción y el primero se perdería al commitear.
  assert.deepEqual(Object.keys(A.datos.session).sort(), ["1.1", "2.2"]);
});
