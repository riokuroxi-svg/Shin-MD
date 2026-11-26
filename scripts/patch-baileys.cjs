/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Hook de instalación (postinstall): aplica a @whiskeysockets/baileys los
// arreglos que la librería todavía no tiene publicados.
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
// Cada parche resuelve un fallo real, con su issue/PR de origen. Ninguno es
// cosmético: sin ellos el bot no vincula (o vincula algo y falla), se cae
// cada 50 minutos o deja de descargar multimedia.
//
//   1. companion_reg_refresh sin manejar (issue #2737, PR #2765)
//      El QR caduca, el servidor pide rotar la adv secret y nadie contesta.
//      El teléfono dice "No se pudo vincular el dispositivo".
//   2. link_code_companion_reg sin filtro de stage (PR #2602, #2872)
//      Llega una notificación sin claves; parsearla lanza "Invalid buffer"
//      y mata la vinculación por CÓDIGO.
//   3. nonce del pairing code en ASCII '0' en vez de un byte nulo (#2872)
//      El teléfono compara el nonce y rechaza el código.
//   4. reconexión con creds.me puesto pero sin registrar (#2872)
//      requestPairingCode() deja creds.me listo; al reconectar se elige el
//      nodo de LOGIN en vez del de REGISTRO y la vinculación nunca cierra.
//   5. <status> de primer nivel sin ack (issue #2858, PR #2883/#2866)
//      El servidor cierra el stream con <ack class="status"/> a los ~50 min.
//      Síntoma: "Stream Errored (ack)" en bucle, y el mismo estado vuelve.
//   6. reenvío de multimedia con URL caducada (issue #2767, PR #2834/#2835)
//      El error es un Boom y el código HTTP está en output.statusCode, no en
//      status: la comprobación nunca acertaba y no se pedía el reenvío.
//   7. un AsyncLocalStorage por socket (issue #2806, PR #2722)
//      Node lo engancha en una lista global con referencia fuerte y nadie
//      llama a disable(): cada reconexión deja memoria atrapada.
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
// Se aplica sobre node_modules/baileys DESPUÉS del npm install. Es
// IDEMPOTENTE: si un parche ya está, no lo repite.
//
// ── ES TODO O NADA ──────────────────────────────────────────────────────────
// Aplicar siete parches y dejar el octavo a medias sería peor que no aplicar
// ninguno: una sesión con la mitad de los arreglos se ve sana y falla de
// formas raras. Por eso el script trabaja en tres fases:
//
//   1. PLANIFICAR  — los ocho parches se aplican sobre una copia EN MEMORIA
//                    de los archivos. Aquí no se escribe nada en disco.
//   2. VALIDAR     — si algún ancla falta o está repetida, se aborta con los
//                    archivos intactos. El contenido resultante se parsea con
//                    `node --check` (también en memoria, vía temporal) y, si
//                    hay un error de sintaxis, tampoco se escribe nada.
//   3. CONFIRMAR   — recién aquí se escribe: cada archivo va a un temporal y
//                    se renombra (rename atómico), así un corte de luz no
//                    deja un archivo truncado. Se guardan los originales.
//
// Si la prueba de humo posterior falla, se RESTAURAN los originales: el
// resultado siempre es "los ocho o ninguno". Si el proceso muere en medio del
// paso 3, la siguiente ejecución vuelve a planificar desde cero y converge
// (cada parche es independiente e idempotente).
//
// Uso: node scripts/patch-baileys.cjs          (lo invoca "npm install")
//      node scripts/patch-baileys.cjs --check  solo comprueba, no escribe
//      node scripts/patch-baileys.cjs --lib <ruta>/baileys/lib
//                                              trabaja sobre otra copia
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ok = (m) => console.log(`[patch-baileys] ✅ ${m}`);
const info = (m) => console.log(`[patch-baileys] ·  ${m}`);
function fail(m) {
  console.error(`[patch-baileys] ❌ ${m}`);
  console.error('[patch-baileys] El bot NO podrá vincular nuevos dispositivos hasta resolver esto.');
  process.exit(1);
}

const LIB_POR_DEFECTO = path.join(__dirname, '..', 'node_modules', 'baileys', 'lib');
const os = require('os');

/** Un error de parcheo: quien llama decide si aborta el proceso o no. */
class ErrorDeParche extends Error {}

/**
 * Almacén virtual: los archivos se leen una vez y todos los cambios viven en
 * memoria hasta `confirmar()`. Es lo que hace que el proceso sea atómico.
 *
 * @param {string} dirLib  ruta a node_modules/baileys/lib
 */
function crearAlmacen(dirLib) {
  const FILES = {
    utils: path.join(dirLib, 'Utils', 'companion-reg-client-utils.js'),
    socket: path.join(dirLib, 'Socket', 'socket.js'),
    recv: path.join(dirLib, 'Socket', 'messages-recv.js'),
    messages: path.join(dirLib, 'Utils', 'messages.js'),
    auth: path.join(dirLib, 'Utils', 'auth-utils.js'),
  };

  for (const ruta of Object.values(FILES)) {
    if (!fs.existsSync(ruta)) {
      throw new ErrorDeParche(`no existe ${ruta}. ¿Se ejecutó "npm install" completo?`);
    }
  }

  /** ruta → { original, actual } */
  const archivos = new Map();
  const cargar = (ruta) => {
    if (!archivos.has(ruta)) {
      archivos.set(ruta, { original: fs.readFileSync(ruta, 'utf8'), actual: null });
    }
    return archivos.get(ruta);
  };
  const actualDe = (ruta) => {
    const f = cargar(ruta);
    return f.actual === null ? f.original : f.actual;
  };

  return {
    FILES,
    dirLib,

    leer: (ruta) => actualDe(ruta),

    tiene: (ruta, marca) => actualDe(ruta).includes(marca),

    /** Escribe en MEMORIA. No toca el disco. */
    escribir(ruta, texto) {
      const f = cargar(ruta);
      f.actual = texto;
    },

    /** Archivos cuyo contenido cambió, con su texto final. */
    modificados() {
      return [...archivos.entries()]
        .filter(([, f]) => f.actual !== null && f.actual !== f.original)
        .map(([ruta, f]) => ({ ruta, original: f.original, final: f.actual }));
    },

    /**
     * Escribe de verdad. Cada archivo va a un temporal y se renombra: si el
     * proceso muere a mitad, ningún archivo queda truncado (o está el viejo
     * o está el nuevo).
     */
    confirmar() {
      for (const { ruta, final } of this.modificados()) {
        const temporal = `${ruta}.shin-patch-${process.pid}`;
        fs.writeFileSync(temporal, final, 'utf8');
        fs.renameSync(temporal, ruta);
      }
    },

    /** Devuelve todo a como estaba antes de `confirmar()`. */
    revertir() {
      let devueltos = 0;
      for (const { ruta, original } of this.modificados()) {
        const temporal = `${ruta}.shin-revert-${process.pid}`;
        try {
          fs.writeFileSync(temporal, original, 'utf8');
          fs.renameSync(temporal, ruta);
          devueltos++;
        } catch {
          try { fs.unlinkSync(temporal); } catch { /* nada que limpiar */ }
        }
      }
      return devueltos;
    },
  };
}

// El almacén activo. Se rellena con abrirAlmacen() antes de parchear.
let ALMACEN = null;
let FILES = null;

function abrirAlmacen(dirLib) {
  ALMACEN = crearAlmacen(dirLib);
  FILES = ALMACEN.FILES;
  return ALMACEN;
}

const leer = (f) => ALMACEN.leer(f);
const tiene = (f, marcador) => ALMACEN.tiene(f, marcador);

/**
 * Reemplaza exactamente UNA ocurrencia EN MEMORIA. Si el ancla no está, o
 * está repetida, el parche no se puede aplicar con garantías: se lanza
 * ErrorDeParche y el proceso entero se aborta sin haber escrito nada.
 *
 * @param {string} file
 * @param {string} find
 * @param {string} replace
 * @param {string} label
 */
function replaceOnce(file, find, replace, label) {
  const texto = leer(file);
  const veces = texto.split(find).length - 1;
  if (veces === 0) throw new ErrorDeParche(`ancla no encontrada en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  if (veces > 1) throw new ErrorDeParche(`ancla ambigua (${veces}x) en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  ALMACEN.escribir(file, texto.replace(find, replace));
  return file;
}

/** Aplica un parche solo si su marca no está ya; comprueba el resultado. */
function parchear(titulo, archivo, marcador, aplicar) {
  if (tiene(archivo, marcador)) {
    info(`${titulo}: ya aplicado`);
    return false;
  }
  aplicar();
  if (!tiene(archivo, marcador)) throw new ErrorDeParche(`${titulo}: el parche no dejó su marca en ${path.basename(archivo)}`);
  ok(`${titulo}`);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 y 2. Vinculación: QR que caduca y código que no llega
// ═══════════════════════════════════════════════════════════════════════════
const MARCA_RENDERER = 'handleCompanionRegRefresh';

function parchearRenderer() {
  if (tiene(FILES.utils, MARCA_RENDERER)) {
    info('1. renderer del QR y rotación de la adv secret: ya aplicado');
    return;
  }
  const extra = `
// ── Parche (scripts/patch-baileys.cjs, PR #2765) ──────────────────────────
// Renderiza el pool de refs de vinculación por QR. "next" consume el
// siguiente ref; "refresh" re-renderiza el ref que YA está en pantalla sin
// consumir refs: el ref no expiró, solo cambió la secret que el QR publica.
export const makePairingQRRenderer = (refs, render) => {
    let index = 0;
    let current;
    return {
        next() {
            const ref = refs[index];
            if (ref === undefined) {
                return false;
            }
            index += 1;
            current = ref;
            render(ref);
            return true;
        },
        refresh() {
            if (current === undefined) {
                return false;
            }
            render(current);
            return true;
        }
    };
};

// Los dos hijos que el parser de WA Web acepta en esta notificación.
const COMPANION_REG_REFRESH_CHILDREN = ['companion_reg_refresh', 'pair-device-rotate-qr'];

// El servidor retira la material de registro de un companion aún no
// vinculado: se rota la adv secret (misma construcción que initAuthCreds y
// WA Web: 32 bytes CSPRNG en base64) y se re-renderiza el QR en pantalla.
// Una sesión ya registrada (creds.me) NUNCA se rota: rompería el flujo.
export const handleCompanionRegRefresh = (node, { creds, emitCredsUpdate, refreshQR, logger }) => {
    if (!COMPANION_REG_REFRESH_CHILDREN.some((tag) => getBinaryNodeChild(node, tag))) {
        logger.warn({ node }, 'companion_reg_refresh carries neither expected child; ignoring');
        return 'ignored_malformed';
    }
    if (creds.me) {
        logger.debug({ id: node.attrs.id }, 'companion_reg_refresh on a registered session; keeping the adv secret');
        return 'ignored_registered';
    }
    creds.advSecretKey = randomBytes(32).toString('base64');
    emitCredsUpdate({ advSecretKey: creds.advSecretKey });
    logger.info({ id: node.attrs.id }, 'rotated the adv secret the server asked to retire; re-rendering the pairing QR');
    refreshQR();
    return 'rotated';
};
`;
  let texto = leer(FILES.utils);
  if (!/import\s*\{[^}]*\brandomBytes\b[^}]*\}\s*from\s*['"]crypto['"]/.test(texto)) {
    texto = `import { randomBytes } from 'crypto';\n` + texto;
  }
  if (!/import\s*\{[^}]*\bgetBinaryNodeChild\b[^}]*\}/.test(texto)) {
    texto = `import { getBinaryNodeChild } from '../WABinary/index.js';\n` + texto;
  }
  ALMACEN.escribir(FILES.utils, texto.trimEnd() + '\n' + extra);
  if (!tiene(FILES.utils, MARCA_RENDERER)) throw new ErrorDeParche('1. no se pudo añadir el renderer del QR');
  ok('1. renderer del QR y rotación de la adv secret');
}

function parchearSocketQR() {
  parchear('2a. import del renderer y del handler', FILES.socket, 'makePairingQRRenderer', () => {
    replaceOnce(
      FILES.socket,
      'getNextPreKeysNode, makeEventBuffer, makeNoiseHandler, promiseTimeout',
      'getNextPreKeysNode, handleCompanionRegRefresh, makeEventBuffer, makeNoiseHandler, makePairingQRRenderer, promiseTimeout',
      'imports'
    );
  });

  parchear('2b. QR re-renderizable', FILES.socket, 'refreshPairingQR = () => renderer.refresh();', () => {
    replaceOnce(
      FILES.socket,
      `    // QR gen
    ws.on('CB:iq,type:set,pair-device', async (stanza) => {`,
      `    // Re-renderiza el QR que está en pantalla. Solo se asigna mientras un
    // flujo de vinculación por QR está vivo en esta conexión.
    let refreshPairingQR;
    // QR gen
    ws.on('CB:iq,type:set,pair-device', async (stanza) => {`,
      'declaración de refreshPairingQR'
    );
    replaceOnce(
      FILES.socket,
      `        const advB64 = creds.advSecretKey;
        let qrMs = qrTimeout || 60000; // time to let a QR live
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            const refNode = refNodes.shift();
            if (!refNode) {
                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            const ref = refNode.content.toString('utf-8');
            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser);
            ev.emit('connection.update', { qr });
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();`,
      `        let qrMs = qrTimeout || 60000; // time to let a QR live
        // creds.advSecretKey se lee POR RENDER (no se captura una vez): un
        // companion_reg_refresh la rota en medio del flujo y todo QR emitido
        // después debe publicar el valor nuevo.
        const renderer = makePairingQRRenderer(
            refNodes.map((refNode) => refNode.content.toString('utf-8')),
            (ref) => {
                const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, creds.advSecretKey, browser);
                ev.emit('connection.update', { qr });
                clearTimeout(qrTimer);
                qrTimer = setTimeout(genPairQR, qrMs);
                qrMs = qrTimeout || 20000; // shorter subsequent qrs
            }
        );
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            if (!renderer.next()) {
                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
            }
        };
        refreshPairingQR = () => renderer.refresh();
        genPairQR();`,
      'renderer del QR'
    );
  });

  parchear('2c. handler de companion_reg_refresh', FILES.socket, 'CB:notification,type:companion_reg_refresh', () => {
    replaceOnce(
      FILES.socket,
      `    // device paired for the first time`,
      `    // El servidor retiró la material de registro (el QR caducó): se rota
    // la adv secret y se re-renderiza el QR sin gastar otro ref del pool.
    ws.on('CB:notification,type:companion_reg_refresh', (node) => {
        try {
            handleCompanionRegRefresh(node, {
                creds: authState.creds,
                emitCredsUpdate: (update) => ev.emit('creds.update', update),
                refreshQR: () => refreshPairingQR?.(),
                logger
            });
        }
        catch (error) {
            logger.warn({ error }, 'failed to handle companion_reg_refresh');
        }
    });
    // device paired for the first time`,
      'handler companion_reg_refresh'
    );
  });
}

function parchearStageGuard() {
  parchear('3. filtro de stage en link_code_companion_reg', FILES.recv, "attrs?.stage !== 'primary_hello'", () => {
    replaceOnce(
      FILES.recv,
      `            case 'link_code_companion_reg':
                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                const ref = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_ref'));`,
      `            case 'link_code_companion_reg':
                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                // El servidor manda dos: una al conectar (solo el ref) y otra
                // cuando el teléfono escribe el código (con las claves). Solo
                // la segunda sirve; parsear la primera lanza "Invalid buffer".
                if (linkCodeCompanionReg?.attrs?.stage !== 'primary_hello')
                    break;
                const ref = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_ref'));`,
      'stage guard del código de vinculación'
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 y 4. Código de vinculación: nonce y nodo de registro
// ═══════════════════════════════════════════════════════════════════════════
function parchearNonce() {
  parchear('4. nonce del pairing code en byte nulo', FILES.socket, 'content: Buffer.alloc(1)', () => {
    replaceOnce(
      FILES.socket,
      `                        {
                            tag: 'link_code_pairing_nonce',
                            attrs: {},
                            content: '0'
                        }`,
      `                        {
                            tag: 'link_code_pairing_nonce',
                            attrs: {},
                            // WA Web manda Uint8Array(1) = [0x00]. Con el
                            // carácter '0' (0x30) el teléfono rechaza el
                            // código y no hay mensaje de error que lo diga.
                            content: Buffer.alloc(1)
                        }`,
      'nonce del pairing code'
    );
  });
}

function parchearRegistro() {
  parchear('5. reconexión: registro en vez de login', FILES.socket, 'if (!creds.me || !creds.registered)', () => {
    replaceOnce(
      FILES.socket,
      `        if (!creds.me) {`,
      `        // requestPairingCode() deja creds.me puesto antes de que el
        // dispositivo exista: si solo se mira creds.me, la reconexión manda
        // el nodo de LOGIN y la vinculación por código nunca termina.
        if (!creds.me || !creds.registered) {`,
      'nodo de registro'
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. <status> sin ack → stream cerrado cada 50 minutos
// ═══════════════════════════════════════════════════════════════════════════
function parchearAckStatus() {
  parchear('6. ack de los estados (<status>)', FILES.recv, "ws.on('CB:status'", () => {
    replaceOnce(
      FILES.recv,
      `    ws.on('CB:notification', async (node) => {
        await processNode('notification', node, 'handling notification', handleNotification);
    });`,
      `    ws.on('CB:notification', async (node) => {
        await processNode('notification', node, 'handling notification', handleNotification);
    });
    // Algunas cuentas reciben los estados como <status> de primer nivel en
    // vez de <message from="status@broadcast">. No hay nada que decodificar,
    // pero SÍ hay que ackearlo: si no, ~50 minutos después el servidor cierra
    // el stream con <ack class="status"/> y vuelve a mandar el mismo estado
    // tras reconectar (issue #2858). sendMessageAck ya usa el tag del nodo
    // como class, que es justo lo que espera el servidor.
    ws.on('CB:status', (node) => {
        sendMessageAck(node).catch((error) => {
            try { onUnexpectedError(error, 'acking status'); }
            catch { /* el logger del socket puede no existir todavía */ }
        });
    });`,
      'ack de <status>'
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Multimedia caducada: pedir el reenvío
// ═══════════════════════════════════════════════════════════════════════════
function parchearReenvioMedia() {
  parchear('7. reenvío de multimedia caducada', FILES.messages, 'const estadoHttp', () => {
    replaceOnce(
      FILES.messages,
      `const REUPLOAD_REQUIRED_STATUS = [410, 404];`,
      `// 403 añadido: el CDN también responde 403 cuando la URL ya no sirve.
const REUPLOAD_REQUIRED_STATUS = [410, 404, 403];`,
      'estados que piden reenvío'
    );
    replaceOnce(
      FILES.messages,
      `        if (ctx &&
            typeof error?.status === 'number' && // treat errors with status as HTTP failures requiring reupload
            REUPLOAD_REQUIRED_STATUS.includes(error.status)) {`,
      `        // El fallo llega como Boom: el código HTTP está en output.statusCode,
        // no en status. Comprobando "status" la condición nunca se cumplía y
        // la URL caducada se quedaba sin pedir reenvío (issue #2767).
        const estadoHttp = error?.output?.statusCode ?? error?.status;
        if (ctx &&
            typeof estadoHttp === 'number' &&
            REUPLOAD_REQUIRED_STATUS.includes(estadoHttp)) {`,
      'condición de reenvío'
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Fuga de memoria: un AsyncLocalStorage por socket
// ═══════════════════════════════════════════════════════════════════════════
function parchearTxStorage() {
  if (tiene(FILES.auth, 'txStorageCompartido')) {
    info('8. AsyncLocalStorage compartido: ya aplicado');
    return;
  }

  // Primero las lecturas (con el archivo todavía prístino) y después la
  // cabecera: así el conteo no se contamina con las líneas que añade el
  // propio parche.
  let texto = leer(FILES.auth);
  const lecturas = texto.split('txStorage.getStore()').length - 1;
  if (lecturas !== 4) throw new ErrorDeParche(`8. se esperaban 4 lecturas de txStorage.getStore() y hay ${lecturas}; la versión de Baileys cambió.`);

  texto = texto
    .replaceAll('txStorage.getStore()', 'contexto()')
    .replace('await txStorage.run(ctx, work)', 'await txStorage.run(conContexto(ctx), work)');

  const cabecera = `export const addTransactionCapability = (state, logger, { maxCommitRetries, delayBetweenTriesMs }) => {
    const txStorage = new AsyncLocalStorage();`;
  const reemplazo = `// Un solo AsyncLocalStorage por proceso (issue #2806). Node lo engancha en
// una lista global con referencia fuerte en cuanto se usa run() y nada llama
// a disable(): con una instancia por socket, cada reconexión deja memoria
// atrapada. El valor va indexado por token para que dos almacenes no se vean
// el contexto de transacción del otro.
const txStorageCompartido = new AsyncLocalStorage();

export const addTransactionCapability = (state, logger, { maxCommitRetries, delayBetweenTriesMs }) => {
    const txStorage = txStorageCompartido;
    const txStoreToken = Symbol('signalTxStore');
    /** Contexto de ESTE almacén, aunque otro almacén abra su transacción dentro. */
    const contexto = () => txStorage.getStore()?.get(txStoreToken);
    /** Mapa nuevo que conserva los contextos externos y añade el propio. */
    const conContexto = (ctx) => {
        const mapa = new Map(txStorage.getStore() || []);
        mapa.set(txStoreToken, ctx);
        return mapa;
    };`;

  const veces = texto.split(cabecera).length - 1;
  if (veces !== 1) throw new ErrorDeParche(`8. cabecera de addTransactionCapability encontrada ${veces} veces; la versión de Baileys cambió.`);
  texto = texto.replace(cabecera, reemplazo);
  ALMACEN.escribir(FILES.auth, texto);

  if (!tiene(FILES.auth, 'txStorageCompartido')) throw new ErrorDeParche('8. el parche no dejó su marca en auth-utils.js');
  ok('8. AsyncLocalStorage compartido');
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIÓN Y EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════

/** Opciones de línea de comandos. */
function leerArgumentos(argv = process.argv.slice(2)) {
  const opciones = { soloComprobar: argv.includes('--check'), lib: null };
  const i = argv.indexOf('--lib');
  if (i !== -1 && argv[i + 1]) opciones.lib = path.resolve(argv[i + 1]);
  else if (process.env.SHIN_BAILEYS_LIB) opciones.lib = path.resolve(process.env.SHIN_BAILEYS_LIB);
  return opciones;
}

/** Las ocho marcas: una por parche. Si falta una, el install está a medias. */
const MARCAS = () => [
  [FILES.utils, 'handleCompanionRegRefresh', 'renderer del QR'],
  [FILES.socket, 'CB:notification,type:companion_reg_refresh', 'handler companion_reg_refresh'],
  [FILES.socket, 'content: Buffer.alloc(1)', 'nonce del pairing code'],
  [FILES.socket, 'if (!creds.me || !creds.registered)', 'nodo de registro'],
  [FILES.recv, "attrs?.stage !== 'primary_hello'", 'filtro de stage'],
  [FILES.recv, "ws.on('CB:status'", 'ack de <status>'],
  [FILES.messages, 'const estadoHttp', 'reenvío de multimedia'],
  [FILES.auth, 'txStorageCompartido', 'AsyncLocalStorage compartido'],
];

/** Qué parches faltan, por su nombre legible. */
function faltantes() {
  return MARCAS().filter(([archivo, marca]) => !tiene(archivo, marca)).map(([, , titulo]) => titulo);
}

/**
 * Parsea el contenido que va a quedar en disco, SIN escribirlo: se copia a un
 * temporal con extensión .mjs (el código de Baileys es ESM) y se pasa
 * `node --check`. Si algo no parsea, no se toca la instalación.
 */
function verificarSintaxis(almacen) {
  const pendientes = almacen.modificados();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shin-baileys-check-'));
  try {
    for (const { ruta, final } of pendientes) {
      const copia = path.join(tmpDir, path.basename(ruta).replace(/\.js$/, '') + '-' + process.pid + '.mjs');
      fs.writeFileSync(copia, final, 'utf8');
      try {
        execFileSync(process.execPath, ['--check', copia], { stdio: 'pipe' });
      } catch (e) {
        throw new ErrorDeParche(`sintaxis inválida tras parchear ${path.basename(ruta)}: ${e.stderr?.toString?.() || e.message}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  ok(`sintaxis válida en ${pendientes.length} archivo(s) (verificada antes de escribir)`);
}

/** Aplica los ocho parches sobre el almacén. No escribe nada en disco. */
function aplicarTodo(almacen) {
  const resumen = { aplicados: [], saltados: [] };
  const pasos = [
    ['1. renderer del QR', () => { parchearRenderer(); }],
    ['2. socket del QR', () => { parchearSocketQR(); }],
    ['3. filtro de stage', () => { parchearStageGuard(); }],
    ['4. nonce del pairing code', () => { parchearNonce(); }],
    ['5. nodo de registro', () => { parchearRegistro(); }],
    ['6. ack de <status>', () => { parchearAckStatus(); }],
    ['7. reenvío de multimedia', () => { parchearReenvioMedia(); }],
    ['8. AsyncLocalStorage compartido', () => { parchearTxStorage(); }],
  ];

  const cambiosIniciales = almacen.modificados().length;
  for (const [titulo, ejecutar] of pasos) {
    ejecutar();
    resumen.aplicados.push(titulo);
  }
  const cambioFinal = almacen.modificados().length;
  if (cambioFinal === cambiosIniciales) resumen.saltados = resumen.aplicados.slice();
  return resumen;
}

/** Pruebas de humo sobre lo que ya está en disco. */
async function humo(almacen) {
  // Escotilla de prueba: permite ejercitar la reversión sin romper la librería.
  if (process.env.SHIN_PATCH_TEST_FALLO_SMOKE === '1') {
    throw new ErrorDeParche('fallo de humo forzado por SHIN_PATCH_TEST_FALLO_SMOKE');
  }

  let utils;
  let auth;
  try {
    utils = await import(path.join('file://', almacen.FILES.utils));
    auth = await import(path.join('file://', almacen.FILES.auth));
  } catch (e) {
    // Un árbol aislado (--lib) puede no tener las dependencias a mano; en la
    // instalación real, en cambio, no poder importar es un fallo de verdad.
    if (almacen.dirLib !== LIB_POR_DEFECTO && /ERR_MODULE_NOT_FOUND|Cannot find package/.test(String(e.message))) {
      info('prueba de humo omitida: el árbol indicado no tiene sus dependencias instaladas');
      return;
    }
    throw new ErrorDeParche(`no se pudo cargar el conector parcheado: ${e.message.split('\n')[0]}`);
  }

  if (typeof utils.makePairingQRRenderer !== 'function') throw new ErrorDeParche('makePairingQRRenderer no exportada');
  if (typeof utils.handleCompanionRegRefresh !== 'function') throw new ErrorDeParche('handleCompanionRegRefresh no exportada');

  const vistos = [];
  const r = utils.makePairingQRRenderer(['a', 'b'], (ref) => vistos.push(ref));
  if (!r.next() || !r.next() || r.next() !== false) throw new ErrorDeParche('el renderer no respeta el pool de refs');
  if (!r.refresh()) throw new ErrorDeParche('el renderer no puede refrescar');
  if (vistos.join(',') !== 'a,b,b') throw new ErrorDeParche(`orden de renders inesperado: ${vistos.join(',')}`);

  const creds = { advSecretKey: 'vieja' };
  const nodo = { attrs: { id: 'x' }, content: [{ tag: 'companion_reg_refresh', attrs: {} }] };
  const logger = { warn() {}, info() {}, debug() {} };
  let refrescos = 0;
  const base = { emitCredsUpdate: () => {}, refreshQR: () => refrescos++, logger };
  if (utils.handleCompanionRegRefresh(nodo, { ...base, creds }) !== 'rotated') throw new ErrorDeParche('no rotó la adv secret');
  if (creds.advSecretKey === 'vieja' || refrescos !== 1) throw new ErrorDeParche('la rotación no hizo efecto');
  creds.me = { id: 'x@s.whatsapp.net' };
  if (utils.handleCompanionRegRefresh(nodo, { ...base, creds }) !== 'ignored_registered') {
    throw new ErrorDeParche('rotó la adv secret de una sesión ya vinculada');
  }

  const almacen_ = () => {
    const datos = {};
    return { datos, async get() { return {}; }, async set(obj) { Object.assign(datos, obj); } };
  };
  const A = almacen_();
  const B = almacen_();
  const silencioso = { trace() {}, debug() {}, info() {}, warn() {}, error() {} };
  const storeA = auth.addTransactionCapability(A, silencioso, { maxCommitRetries: 1, delayBetweenTriesMs: 1 });
  const storeB = auth.addTransactionCapability(B, silencioso, { maxCommitRetries: 1, delayBetweenTriesMs: 1 });
  await storeA.transaction(async () => {
    await storeB.transaction(async () => {
      await storeB.set({ 'pre-key': { 9: { id: 9 } } });
    });
  }, 'k');
  if (!B.datos['pre-key'] || A.datos['pre-key']) {
    throw new ErrorDeParche('el AsyncLocalStorage compartido mezcla transacciones entre almacenes');
  }

  ok('humo: renderer del QR, rotación de la adv secret y transacciones aisladas');
}

function main() {
  const opciones = leerArgumentos();

  try {
    const almacen = abrirAlmacen(opciones.lib || LIB_POR_DEFECTO);

    if (opciones.soloComprobar) {
      const faltan = faltantes();
      if (faltan.length) {
        console.error('[patch-baileys] faltan parches: ' + faltan.join(', '));
        process.exit(1);
      }
      ok(`los ${MARCAS().length} parches están aplicados`);
      return;
    }

    // ── Fase 1 y 2: planificar y validar, sin escribir ──
    aplicarTodo(almacen);
    const pendientes = almacen.modificados();

    if (pendientes.length === 0) {
      info('todo estaba ya parcheado; no hay nada que escribir');
      const faltan = faltantes();
      if (faltan.length) throw new ErrorDeParche(`quedaron marcas sin poner: ${faltan.join(', ')}`);
      return;
    }

    verificarSintaxis(almacen);

    // ── Fase 3: escribir ──
    almacen.confirmar();
    ok(`escritos ${pendientes.length} de ${Object.keys(almacen.FILES).length} archivos`);

    // ── Humo: si falla, se devuelve TODO a como estaba ──
    return humo(almacen).catch((error) => {
      const devueltos = almacen.revertir();
      fail(`${error.message} → se revirtieron ${devueltos} archivo(s); la instalación quedó como estaba`);
    });
  } catch (error) {
    if (error instanceof ErrorDeParche) {
      fail(error.message + ' → no se escribió ningún archivo');
    }
    fail(error?.message || String(error));
  }
}

if (require.main === module) main();

module.exports = {
  crearAlmacen,
  abrirAlmacen,
  aplicarTodo,
  replaceOnce,
  parchear,
  tiene,
  humo,
  main,
  leerArgumentos,
  ErrorDeParche,
};
