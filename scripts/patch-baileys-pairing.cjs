// Hook de instalación (postinstall): parchea la vinculación de dispositivos
// de @whiskeysockets/baileys@6.7.24 (oficial).
//
// ── POR QUÉ ─────────────────────────────────────────────────────────────────
// El 2026-07-28 WhatsApp añadió una etapa al flujo de vinculación: después de
// escanear el QR el servidor envía
//     <notification type="companion_reg_refresh">
// Ninguna versión publicada de Baileys la maneja: la ackean y la ignoran → el
// pair-success nunca llega y el teléfono muestra "No se pudo vincular el
// dispositivo". (WhiskeySockets/Baileys issue #2737)
//
// El fix existe solo en PRs sin merge:
//   · PR #2765 — rota la clave secreta (adv secret) y re-emplaza el QR sin
//     consumir un ref (consumir uno agota el pool y mata el flujo).
//   · PR #2602 — ignora notificaciones link_code_companion_reg que llegan sin
//     datos de vinculación (crash "Invalid buffer" en el flujo por código).
//
// ── CÓMO ────────────────────────────────────────────────────────────────────
// Aplica esos parches sobre node_modules/baileys DESPUÉS del npm install.
// Es IDEMPOTENTE (si ya está parcheado no hace nada) y se AUTO-VERIFICA:
//   1. node --check sobre cada archivo modificado (sintaxis válida).
//   2. Smoke-test funcional de las nuevas funciones (renderer + rotación).
// Si NO puede parchear (la versión cambió), FALLA CON ERROR para que no quede
// oculto un bot que no puede vincular.
//
// Uso: node scripts/patch-baileys-pairing.cjs (lo invoca el "postinstall")
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ok = (m) => console.log(`[patch-baileys] ✅ ${m}`);
const info = (m) => console.log(`[patch-baileys] ${m}`);
function fail(m) {
  console.error(`[patch-baileys] ❌ ${m}`);
  console.error('[patch-baileys] El bot NO podrá vincular nuevos dispositivos hasta resolver esto.');
  process.exit(1);
}

const lib = path.join(__dirname, '..', 'node_modules', 'baileys', 'lib');
const FILES = {
  utils: path.join(lib, 'Utils', 'companion-reg-client-utils.js'),
  barrel: path.join(lib, 'Utils', 'index.js'),
  socket: path.join(lib, 'Socket', 'socket.js'),
  recv: path.join(lib, 'Socket', 'messages-recv.js'),
};

for (const p of [FILES.barrel, FILES.socket, FILES.recv]) {
  if (!fs.existsSync(p)) fail(`no existe ${p}. ¿Se ejecutó "npm install" completo?`);
}

// Reemplaza exactamente UNA ocurrencia; falla si el ancla no está o está duplicada.
function replaceOnce(file, find, replace, label) {
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(find).length - 1;
  if (count === 0) fail(`ancla no encontrada en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  if (count > 1) fail(`ancla ambigua (${count}x) en ${path.basename(file)}: ${label}. La versión de Baileys cambió; hay que actualizar este script.`);
  fs.writeFileSync(file, text.replace(find, replace), 'utf8');
  ok(`parcheado ${path.basename(file)} (${label})`);
}

function check(file, marker) {
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(marker);
}

// ═══════════════════════════════════════════════════════════════════════════
// A) lib/Utils/companion-reg-client-utils.js  (archivo NUEVO: el 6.7.24
//    oficial no trae este refactor del companion client)
//    · makePairingQRRenderer: maneja el ref que está en pantalla y permite
//      RE-RENDERIZARLO (refresh) sin consumir un ref nuevo (next).
//    · handleCompanionRegRefresh: rota la adv secret cuando el servidor pide
//      retirar la material de registro; respeta sesiones ya registradas.
// ═══════════════════════════════════════════════════════════════════════════
if (!check(FILES.utils, 'handleCompanionRegRefresh')) {
  if (fs.existsSync(FILES.utils)) fail('companion-reg-client-utils.js existe pero sin el marcador; estado inesperado (¿parche a medio aplicar?).');
  const utilsFile = `import { randomBytes } from 'crypto';
import { getBinaryNodeChild } from '../WABinary/index.js';

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
  fs.writeFileSync(FILES.utils, utilsFile, 'utf8');
  ok('creado companion-reg-client-utils.js (renderer + handleCompanionRegRefresh)');
} else {
  info('companion-reg-client-utils.js ya parcheado.');
}

// Barril Utils: exponer el módulo nuevo
if (!check(FILES.barrel, "companion-reg-client-utils.js")) {
  const barrel = fs.readFileSync(FILES.barrel, 'utf8');
  fs.writeFileSync(FILES.barrel, barrel.replace(/\/\/# sourceMappingURL=index\.js\.map/, "export * from './companion-reg-client-utils.js';\n//# sourceMappingURL=index.js.map"), 'utf8');
  if (!check(FILES.barrel, 'companion-reg-client-utils.js')) fail('no se pudo insertar el export en Utils/index.js');
  ok('parcheado Utils/index.js (barrel)');
} else {
  info('Utils/index.js ya expone el módulo.');
}

// ═══════════════════════════════════════════════════════════════════════════
// B) lib/Socket/socket.js
//    · import de las funciones nuevas (vienen por el barrel Utils/index.js)
//    · genPairQR usa el renderer (la adv secret se lee POR RENDER)
//    · nuevo handler CB:notification,type:companion_reg_refresh
// ═══════════════════════════════════════════════════════════════════════════
if (!check(FILES.socket, 'CB:notification,type:companion_reg_refresh')) {
  replaceOnce(
    FILES.socket,
    'getNextPreKeysNode, getPlatformId, makeEventBuffer, makeNoiseHandler, promiseTimeout',
    'getNextPreKeysNode, getPlatformId, handleCompanionRegRefresh, makeEventBuffer, makeNoiseHandler, makePairingQRRenderer, promiseTimeout',
    'imports'
  );
  replaceOnce(
    FILES.socket,
    "    // QR gen\n    ws.on('CB:iq,type:set,pair-device', async (stanza) => {",
    "    // Re-renderiza el QR que está en pantalla. Solo se asigna mientras\n" +
      "    // un flujo de vinculación por QR está vivo en esta conexión.\n" +
      "    let refreshPairingQR;\n" +
      "    // QR gen\n    ws.on('CB:iq,type:set,pair-device', async (stanza) => {",
    'refreshPairingQR'
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
                end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            const ref = refNode.content.toString('utf-8');
            const qr = [ref, noiseKeyB64, identityKeyB64, advB64].join(',');
            ev.emit('connection.update', { qr });
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();
    });`,
    `        // creds.advSecretKey se lee POR RENDER (no se captura una vez):
        // un companion_reg_refresh la rota en medio del flujo y todo QR
        // emitido después debe publicar el valor nuevo.
        const renderer = makePairingQRRenderer(refNodes.map((refNode) => refNode.content.toString('utf-8')), (ref) => ev.emit('connection.update', {
            qr: [ref, noiseKeyB64, identityKeyB64, creds.advSecretKey].join(',')
        }));
        refreshPairingQR = () => void renderer.refresh();
        let qrMs = qrTimeout || 60000; // time to let a QR live
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            if (!renderer.next()) {
                end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();
    });
    // El servidor retira la material de registro de un companion aún no
    // vinculado: rota la adv secret y re-emplaza el QR sin consumir un ref
    // (consumir uno agotaría el pool que dio el servidor y el flujo moriría
    // con 'QR refs attempts ended').
    ws.on('CB:notification,type:companion_reg_refresh', (node) => {
        handleCompanionRegRefresh(node, {
            creds,
            emitCredsUpdate: (update) => ev.emit('creds.update', update),
            refreshQR: () => refreshPairingQR?.(),
            logger
        });
    });`,
    'genPairQR con renderer + handler companion_reg_refresh'
  );
} else {
  info('socket.js ya parcheado.');
}

// ═══════════════════════════════════════════════════════════════════════════
// C) lib/Socket/messages-recv.js
//    · PR #2602: ignorar link_code_companion_reg sin primary_identity_pub
//      (llegan así con la nueva etapa del servidor → crash "Invalid buffer")
// ═══════════════════════════════════════════════════════════════════════════
if (!check(FILES.recv, 'without pairing data, skipping')) {
  replaceOnce(
    FILES.recv,
    `            case 'link_code_companion_reg':
                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                const ref = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_ref'));`,
    `            case 'link_code_companion_reg': {
                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');
                if (!getBinaryNodeChildBuffer(linkCodeCompanionReg, 'primary_identity_pub')) {
                    logger.debug({ node }, 'link_code_companion_reg notification without pairing data, skipping');
                    break;
                }
                const ref = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_ref'));`,
    'guard de entrada'
  );
  replaceOnce(
    FILES.recv,
    `                authState.creds.registered = true;
                ev.emit('creds.update', authState.creds);
        }`,
    `                authState.creds.registered = true;
                ev.emit('creds.update', authState.creds);
            }
        }`,
    'cierre del block scope'
  );
} else {
  info('messages-recv.js ya parcheado.');
}

// ═══════════════════════════════════════════════════════════════════════════
// Verificación 1: sintaxis de los archivos modificados
// ═══════════════════════════════════════════════════════════════════════════
for (const p of Object.values(FILES)) {
  try {
    execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
  } catch (e) {
    fail(`node --check falló en ${path.basename(p)}:\n${e.stderr ? e.stderr.toString() : e.message}`);
  }
}
ok('sintaxis válida en los 4 archivos');

// ═══════════════════════════════════════════════════════════════════════════
// Verificación 2: smoke-test funcional de las funciones nuevas
// ═══════════════════════════════════════════════════════════════════════════
const smoke = `
import { makePairingQRRenderer, handleCompanionRegRefresh } from ${JSON.stringify(FILES.utils.replace(/\\/g, '/'))};
const assert = (cond, msg) => { if (!cond) { console.error('SMOKE-FAIL: ' + msg); process.exit(1); } };

// makePairingQRRenderer: next consume, refresh no consume
const rendered = [];
const r = makePairingQRRenderer(['r1', 'r2'], (ref) => rendered.push(ref));
assert(r.next() === true && rendered[0] === 'r1', 'next 1');
assert(r.refresh() === true && rendered[1] === 'r1', 'refresh re-renderiza el mismo ref');
assert(r.next() === true && rendered[2] === 'r2', 'next 2');
assert(r.next() === false, 'pool agotado → false');

// handleCompanionRegRefresh: rota la adv secret y re-renderiza
const logs = [];
const logger = { warn: () => {}, debug: () => {}, info: (o, m) => logs.push(m) };
const creds = { advSecretKey: 'AAAA' };
const emitted = [];
let refreshed = 0;
const node = { tag: 'notification', attrs: { id: 'x1' }, content: [{ tag: 'companion_reg_refresh', attrs: {} }] };
const out = handleCompanionRegRefresh(node, {
  creds,
  emitCredsUpdate: (u) => emitted.push(u),
  refreshQR: () => refreshed++,
  logger
});
assert(out === 'rotated', 'resultado rotated');
assert(creds.advSecretKey !== 'AAAA' && creds.advSecretKey.length === 44, 'adv secret rotada (32 bytes base64)');
assert(emitted.length === 1 && emitted[0].advSecretKey === creds.advSecretKey, 'creds.update emitido');
assert(refreshed === 1, 'QR re-renderizado');

// sesión registrada → NO rota
const credsReg = { advSecretKey: 'BBBB', me: { id: '1@s.whatsapp.net' } };
const out2 = handleCompanionRegRefresh(node, {
  creds: credsReg,
  emitCredsUpdate: () => {},
  refreshQR: () => refreshed++,
  logger
});
assert(out2 === 'ignored_registered' && credsReg.advSecretKey === 'BBBB' && refreshed === 1, 'registrada → no rota');

// notificación malformada (sin hijos esperados) → ignorada
const nodeBad = { tag: 'notification', attrs: { id: 'x2' }, content: [] };
const out3 = handleCompanionRegRefresh(nodeBad, {
  creds: { advSecretKey: 'CCCC' },
  emitCredsUpdate: () => {},
  refreshQR: () => refreshed++,
  logger
});
assert(out3 === 'ignored_malformed' && refreshed === 1, 'malformada → ignorada');

console.log('SMOKE-OK');
`;
try {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', smoke], { stdio: 'pipe' });
  if (!out.toString().includes('SMOKE-OK')) fail('smoke-test no devolvió SMOKE-OK');
  ok('smoke-test funcional OK (renderer + rotación + guards)');
} catch (e) {
  fail(`smoke-test falló:\n${e.stderr ? e.stderr.toString() : e.message}`);
}

ok('Baileys parcheado: la vinculación (QR y código) maneja companion_reg_refresh.');
