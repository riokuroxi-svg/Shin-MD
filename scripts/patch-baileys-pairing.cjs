/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// Hook de instalación (postinstall): completa la vinculación de dispositivos
// de @whiskeysockets/baileys@7.0.0-rc14.
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
// 1) El 2026-07-28 WhatsApp añadió una etapa al flujo de vinculación: después
//    de escanear el QR el servidor envía
//        <notification type="companion_reg_refresh">
//    La librería la ackea y la ignora → el pair-success nunca llega y el
//    teléfono muestra "No se pudo vincular el dispositivo".
//    (WhiskeySockets/Baileys issue #2737, PR sin merge #2765.)
//
// 2) En el flujo por CÓDIGO, el servidor manda DOS notificaciones
//    link_code_companion_reg: la primera (tras companion_hello) solo trae el
//    ref; la segunda (tras escribir el código) trae las claves. Procesar la
//    primera revienta con "Invalid buffer" y mata la vinculación.
//    (PR sin merge #2602.)
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
// Se aplica sobre node_modules/baileys DESPUÉS del npm install. Es
// IDEMPOTENTE: si ya está aplicado no toca nada. Se AUTO-VERIFICA con
// node --check sobre cada archivo modificado y con un smoke-test de las
// funciones nuevas. Si un ancla no aparece (la versión cambió) FALLA CON
// ERROR: mejor un install rojo que un bot que no puede vincular en silencio.
//
// Uso: node scripts/patch-baileys-pairing.cjs (lo invoca el "postinstall")
'use strict';

const fs = require('fs');
const path = require('path');

const ok = (m) => console.log(`[patch-baileys] ✅ ${m}`);
const info = (m) => console.log(`[patch-baileys] ${m}`);
function fail(m) {
  console.error(`[patch-baileys] ❌ ${m}`);
  console.error('[patch-baileys] El bot NO podrá vincular nuevos dispositivos hasta resolver esto.');
  process.exit(1);
}

const LIB = path.join(__dirname, '..', 'node_modules', 'baileys', 'lib');
const FILES = {
  utils: path.join(LIB, 'Utils', 'companion-reg-client-utils.js'),
  socket: path.join(LIB, 'Socket', 'socket.js'),
  recv: path.join(LIB, 'Socket', 'messages-recv.js'),
};

for (const p of Object.values(FILES)) {
  if (!fs.existsSync(p)) fail(`no existe ${p}. ¿Se ejecutó "npm install" completo?`);
}

const leer = (f) => fs.readFileSync(f, 'utf8');
const tiene = (f, marcador) => leer(f).includes(marcador);

// Reemplaza exactamente UNA ocurrencia; falla si el ancla no está o está duplicada.
function replaceOnce(file, find, replace, label) {
  const texto = leer(file);
  const veces = texto.split(find).length - 1;
  if (veces === 0) fail(`ancla no encontrada en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  if (veces > 1) fail(`ancla ambigua (${veces}x) en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  fs.writeFileSync(file, texto.replace(find, replace), 'utf8');
  ok(`parcheado ${path.basename(file)} (${label})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// A) lib/Utils/companion-reg-client-utils.js
//    La 7.0.0-rc14 ya trae buildPairingQRData; le faltan las dos piezas que
//    resuelven la vinculación real:
//    · makePairingQRRenderer: mantiene el ref que está EN PANTALLA y permite
//      re-renderizarlo sin gastar otro ref del pool.
//    · handleCompanionRegRefresh: rota la adv secret cuando el servidor pide
//      retirar la material de registro; a una sesión ya vinculada no la toca.
// ═══════════════════════════════════════════════════════════════════════════
const MARCADOR_UTILS = 'handleCompanionRegRefresh';

if (!tiene(FILES.utils, MARCADOR_UTILS)) {
  const extra = `
// ── Parche Shin-MD (scripts/patch-baileys-pairing.cjs, PR #2765) ──────────
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
  // El módulo necesita randomBytes y getBinaryNodeChild; no se asume que los
  // tenga importados porque cambian entre versiones.
  if (!/import\s*\{[^}]*\brandomBytes\b[^}]*\}\s*from\s*['"]crypto['"]/.test(texto)) {
    texto = `import { randomBytes } from 'crypto';\n` + texto;
  }
  if (!/import\s*\{[^}]*\bgetBinaryNodeChild\b[^}]*\}/.test(texto)) {
    texto = `import { getBinaryNodeChild } from '../WABinary/index.js';\n` + texto;
  }
  fs.writeFileSync(FILES.utils, texto.trimEnd() + '\n' + extra, 'utf8');
  ok('añadido el renderer del QR y handleCompanionRegRefresh');
} else {
  info('companion-reg-client-utils.js ya está parcheado.');
}

// ═══════════════════════════════════════════════════════════════════════════
// B) lib/Socket/socket.js
//    · importar las dos funciones nuevas
//    · genPairQR usa el renderer y lee la adv secret EN CADA RENDER
//    · handler para CB:notification,type:companion_reg_refresh
// ═══════════════════════════════════════════════════════════════════════════
if (!tiene(FILES.socket, 'CB:notification,type:companion_reg_refresh')) {
  replaceOnce(
    FILES.socket,
    'getNextPreKeysNode, makeEventBuffer, makeNoiseHandler, promiseTimeout',
    'getNextPreKeysNode, handleCompanionRegRefresh, makeEventBuffer, makeNoiseHandler, makePairingQRRenderer, promiseTimeout',
    'imports'
  );

  // refreshPairingQR vive en el ámbito del socket: el handler de la
  // notificación y el generador del QR tienen que ver la MISMA variable.
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
} else {
  info('socket.js ya está parcheado.');
}

// ═══════════════════════════════════════════════════════════════════════════
// C) lib/Socket/messages-recv.js
//    Solo la notificación con stage="primary_hello" trae claves utilizables.
// ═══════════════════════════════════════════════════════════════════════════
if (!tiene(FILES.recv, "attrs?.stage !== 'primary_hello'") && !tiene(FILES.recv, 'stage !== "primary_hello"')) {
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
} else {
  info('messages-recv.js ya está parcheado.');
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICACIÓN: sintaxis válida + las funciones nuevas existen y se comportan
// ═══════════════════════════════════════════════════════════════════════════
const { execFileSync } = require('child_process');
for (const f of [FILES.utils, FILES.socket, FILES.recv]) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(`sintaxis inválida tras parchear ${path.basename(f)}: ${e.stderr?.toString?.() || e.message}`);
  }
}
ok('sintaxis válida en los tres archivos');

(async () => {
  const utils = await import(path.join('file://', FILES.utils));
  if (typeof utils.makePairingQRRenderer !== 'function') fail('makePairingQRRenderer no exportada');
  if (typeof utils.handleCompanionRegRefresh !== 'function') fail('handleCompanionRegRefresh no exportada');

  // Renderer: "next" avanza, "refresh" repite el mismo ref.
  const vistos = [];
  const r = utils.makePairingQRRenderer(['a', 'b'], (ref) => vistos.push(ref));
  if (!r.next() || !r.next() || r.next() !== false) fail('el renderer no respeta el pool de refs');
  if (!r.refresh()) fail('el renderer no puede refrescar');
  if (vistos.join(',') !== 'a,b,b') fail(`orden de renders inesperado: ${vistos.join(',')}`);

  // Refresh: sesión sin vincular rota la secret; sesión vinculada no la toca.
  const creds = { advSecretKey: 'vieja' };
  const nodo = { attrs: { id: 'x' }, content: [{ tag: 'companion_reg_refresh', attrs: {} }] };
  const logger = { warn() {}, info() {}, debug() {} };
  let refrescos = 0;
  const eventos = [];
  const base = { emitCredsUpdate: (u) => eventos.push(u), refreshQR: () => refrescos++, logger };
  const rotado = utils.handleCompanionRegRefresh(nodo, { ...base, creds });
  if (rotado !== 'rotated' || creds.advSecretKey === 'vieja' || refrescos !== 1) fail('no rotó la adv secret');
  if (creds.me === undefined) creds.me = { id: 'x@s.whatsapp.net' };
  const ignorado = utils.handleCompanionRegRefresh(nodo, { ...base, creds });
  if (ignorado !== 'ignored_registered') fail('rotó la adv secret de una sesión ya vinculada');
  ok('smoke-test del renderer y de la rotación: correcto');
})();
