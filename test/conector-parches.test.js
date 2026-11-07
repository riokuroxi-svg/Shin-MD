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
import { createRequire } from "node:module";

import { downloadMediaMessage, buildAckStanza } from "baileys";
import { addTransactionCapability } from "baileys/lib/Utils/auth-utils.js";

const require = createRequire(import.meta.url);
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

// ─── Atomicidad del instalador ─────────────────────────────────────
//
// El riesgo real no es que un parche suelto se equivoque, sino que el
// instalador aplique seis, falle en el séptimo y deje el conector a medias:
// eso se ve sano y falla de formas raras. Estas pruebas montan un árbol
// prístino de Baileys en un temporal y comprueban que el resultado siempre es
// "los ocho o ninguno".

const PAQUETE = "@whiskeysockets/baileys@7.0.0-rc14";

/** Baja el tarball de Baileys y lo descomprime en un temporal. */
function arbolPristino() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shin-baileys-"));
  const packDir = path.join(dir, "pack");
  fs.mkdirSync(packDir);

  const intentos = [
    ["npm", ["pack", "--offline", "--pack-destination", packDir, PAQUETE]],
    ["npm", ["pack", "--pack-destination", packDir, PAQUETE]],
  ];
  let tgz = null;
  for (const [cmd, args] of intentos) {
    const r = spawnSync(cmd, args, { encoding: "utf8", cwd: dir });
    if (r.status === 0) {
      tgz = fs.readdirSync(packDir).find((f) => f.endsWith(".tgz"));
      if (tgz) break;
    }
  }
  if (!tgz) {
    fs.rmSync(dir, { recursive: true, force: true });
    return null;
  }

  const r = spawnSync("tar", ["xzf", path.join(packDir, tgz), "-C", dir], { encoding: "utf8" });
  if (r.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    return null;
  }
  return { dir, lib: path.join(dir, "package", "lib") };
}

/** Huella de los cinco archivos que toca el instalador. */
function huellas(lib) {
  const rutas = {
    utils: path.join(lib, "Utils", "companion-reg-client-utils.js"),
    socket: path.join(lib, "Socket", "socket.js"),
    recv: path.join(lib, "Socket", "messages-recv.js"),
    messages: path.join(lib, "Utils", "messages.js"),
    auth: path.join(lib, "Utils", "auth-utils.js"),
  };
  return Object.fromEntries(Object.entries(rutas).map(([k, f]) => [k, hash(f)]));
}

function correrInstalador(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("si un parche falla, NINGUNO queda escrito (todo o nada)", (t) => {
  const arbol = arbolPristino();
  if (!arbol) return t.skip("no hay tarball de Baileys disponible");

  try {
    // El parche 8 es el último de la fila: con el diseño anterior, los siete
    // primeros ya estarían en disco cuando este fallara.
    const auth = path.join(arbol.lib, "Utils", "auth-utils.js");
    const original = fs.readFileSync(auth, "utf8");
    const roto = original.replace(
      "const txStorage = new AsyncLocalStorage();",
      "const txStorage = new AsyncLocalStorageQueYaNoSeLlamaAsi();"
    );
    assert.notEqual(roto, original, "el ancla del parche 8 debe existir en el árbol prístino");
    fs.writeFileSync(auth, roto, "utf8");

    const antes = huellas(arbol.lib);
    const r = correrInstalador(["--lib", arbol.lib]);

    assert.equal(r.status, 1, "el install debía fallar");
    assert.match(r.stderr, /no se escribió ningún archivo/);
    assert.deepEqual(huellas(arbol.lib), antes, "ninguno de los cinco archivos puede cambiar");
  } finally {
    fs.rmSync(arbol.dir, { recursive: true, force: true });
  }
});

test("un parche que rompería la sintaxis tampoco escribe nada", (t) => {
  const arbol = arbolPristino();
  if (!arbol) return t.skip("no hay tarball de Baileys disponible");

  try {
    // Los anclas siguen ahí, pero el archivo no parsea: la fase de validación
    // corre ANTES de escribir, así que la instalación debe quedar intacta.
    const socket = path.join(arbol.lib, "Socket", "socket.js");
    fs.appendFileSync(socket, "\nfunction (\n", "utf8");

    const antes = huellas(arbol.lib);
    const r = correrInstalador(["--lib", arbol.lib]);

    assert.equal(r.status, 1);
    assert.match(r.stderr, /sintaxis inválida/);
    assert.deepEqual(huellas(arbol.lib), antes);
  } finally {
    fs.rmSync(arbol.dir, { recursive: true, force: true });
  }
});

test("si la prueba de humo falla después de escribir, se revierte todo", (t) => {
  const arbol = arbolPristino();
  if (!arbol) return t.skip("no hay tarball de Baileys disponible");

  try {
    // Árbol aislado: no puede importar sus dependencias, así que el humo se
    // omite por diseño. Se fuerza un fallo para ejercitar la reversión.
    const antes = huellas(arbol.lib);
    const r = correrInstalador(["--lib", arbol.lib], { SHIN_PATCH_TEST_FALLO_SMOKE: "1" });

    assert.equal(r.status, 1, "debía fallar");
    assert.match(r.stderr, /se revirtieron 5 archivo/);
    assert.deepEqual(huellas(arbol.lib), antes, "la instalación debe quedar byte a byte como estaba");
  } finally {
    fs.rmSync(arbol.dir, { recursive: true, force: true });
  }
});

test("en un árbol prístino aplica los ocho y la segunda pasada no toca nada", (t) => {
  const arbol = arbolPristino();
  if (!arbol) return t.skip("no hay tarball de Baileys disponible");

  try {
    const antes = huellas(arbol.lib);

    const r1 = correrInstalador(["--lib", arbol.lib]);
    assert.equal(r1.status, 0, r1.stderr || r1.stdout);
    assert.match(r1.stdout, /escritos 5 de 5 archivos/);

    const despues = huellas(arbol.lib);
    for (const k of Object.keys(antes)) {
      assert.notEqual(despues[k], antes[k], `${k} debía cambiar`);
    }

    // --check reconoce el estado…
    const check = correrInstalador(["--check", "--lib", arbol.lib]);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /los 8 parches están aplicados/);

    // …y una segunda aplicación no escribe ni un byte.
    const r2 = correrInstalador(["--lib", arbol.lib]);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /no hay nada que escribir/);
    assert.deepEqual(huellas(arbol.lib), despues);
  } finally {
    fs.rmSync(arbol.dir, { recursive: true, force: true });
  }
});

// ─── El reemplazo, en pequeño ──────────────────────────────────────

test("replaceOnce trabaja en memoria: nunca toca el disco por su cuenta", (t) => {
  const { abrirAlmacen, replaceOnce, ErrorDeParche } = require(script);
  const arbol = arbolPristino();
  if (!arbol) return t.skip("no hay tarball de Baileys disponible");

  try {
    const almacen = abrirAlmacen(arbol.lib);
    const ruta = almacen.FILES.socket;
    const enDisco = fs.readFileSync(ruta, "utf8");

    // Ancla que no existe: lanza y no escribe.
    assert.throws(
      () => replaceOnce(ruta, "ESTA_CADENA_NO_EXISTE_EN_BAILEYS", "x", "prueba"),
      (e) => e instanceof ErrorDeParche && /ancla no encontrada/.test(e.message)
    );
    assert.equal(fs.readFileSync(ruta, "utf8"), enDisco, "el archivo del disco no se toca");

    // Ancla repetida: tampoco adivina cuál reemplazar.
    assert.throws(() => replaceOnce(ruta, "ws.on(", "x", "ambigua"), /ancla ambigua/);
    assert.equal(fs.readFileSync(ruta, "utf8"), enDisco);

    // Ancla real: el cambio queda EN MEMORIA hasta confirmar().
    const ancla = "getNextPreKeysNode, makeEventBuffer, makeNoiseHandler, promiseTimeout";
    assert.ok(enDisco.includes(ancla), "el árbol prístino debe traer el ancla");
    replaceOnce(ruta, ancla, ancla + ", marcaDePrueba", "prueba");
    assert.equal(fs.readFileSync(ruta, "utf8"), enDisco, "seguimos sin escribir en disco");
    assert.ok(almacen.leer(ruta).includes("marcaDePrueba"), "el cambio vive en memoria");
    assert.equal(almacen.modificados().length, 1);
  } finally {
    fs.rmSync(arbol.dir, { recursive: true, force: true });
  }
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
