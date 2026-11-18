/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clasificarDesconexion as clasificar} from '../src/core/politica-sesion.js';
const r={loggedOut:401,forbidden:403,multideviceMismatch:411,badSession:500,connectionReplaced:440,restartRequired:515,connectionClosed:428,connectionLost:408};
test('revocación y sesión inválida requieren intervención sin reconexión',()=>{for(const code of [401,403,411,500])assert.equal(clasificar(code,r),'revision')});
test('desconexiones normales e inesperadas siguen reconectando',()=>{for(const code of [408,428,999])assert.equal(clasificar(code,r),'reconectar');assert.equal(clasificar(440,r),'reemplazada')});
test('reinicios normales permiten reintento y tormenta exige revisión',()=>{for(const code of [0,515]){assert.equal(clasificar(code,r,1),'restart');assert.equal(clasificar(code,r,5),'restart');assert.equal(clasificar(code,r,6),'revision')}});
test('integración estática: no hay borrado de sesión y bloqueo precede guardado de cierre',()=>{const s=fs.readFileSync(new URL('../src/core/socket.js',import.meta.url),'utf8');assert.doesNotMatch(s,/clearSession\s*\(|unlinkSync\s*\(/);const rev=s.indexOf('if (motivoInicial === "revision")');const end=s.indexOf('// Última escritura de credenciales',rev);assert.ok(rev>0&&end>rev);const block=s.slice(rev,end);assert.match(block,/sesionRequiereRevision = true/);assert.match(block,/watchdog\?\.stop/);assert.doesNotMatch(block,/await sc\(|scheduleReconnect\(/);assert.match(s,/if \(sesionRequiereRevision\) return;/)});
