/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync as spawnSyncForTest} from 'node:child_process';
process.env.SHIN_SQLITE_FALLBACK = '1';
const { DatabaseSync } = await import('../src/storage/sqlite-compat.js');
function setup(t) { const d=fs.mkdtempSync(path.join(os.tmpdir(),'shin-a1-')); t.after(()=>fs.rmSync(d,{recursive:true,force:true})); return path.join(d,'data.db'); }
const create=db=>db.exec('CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY, data TEXT)');
const put=(db,k,v)=>db.prepare('INSERT OR REPLACE INTO t (id, data) VALUES (?, ?)').run(k,v);
const get=(db,k)=>db.prepare('SELECT data FROM t WHERE id = ?').get(k)?.data;
test('escritura, rollback y commit sobreviven reapertura',t=>{const f=setup(t), d=new DatabaseSync(f);create(d);put(d,'a','antes');d.exec('BEGIN');put(d,'a','nuevo');put(d,'b','otro'); assert.equal(get(new DatabaseSync(f),'a'),'antes');d.exec('ROLLBACK');assert.equal(get(d,'a'),'antes');d.exec('BEGIN');put(d,'a','confirmado');put(d,'b','otro');d.exec('COMMIT');assert.equal(get(new DatabaseSync(f),'a'),'confirmado');assert.equal(get(new DatabaseSync(f),'b'),'otro')});
test('fallo escritura no informa éxito y restaura memoria y disco',t=>{const f=setup(t),d=new DatabaseSync(f);create(d);put(d,'a','antes');const old=fs.renameSync;fs.renameSync=()=>{throw Object.assign(new Error('disco'),{code:'EIO'})};try{assert.throws(()=>put(d,'a','nuevo'),/persistir/);assert.equal(d.degraded,true);assert.equal(get(d,'a'),'antes');assert.equal(get(new DatabaseSync(f),'a'),'antes')}finally{fs.renameSync=old}put(d,'a','recuperado');assert.equal(d.degraded,false);assert.equal(get(new DatabaseSync(f),'a'),'recuperado')});
test('fallo commit revierte lote y no modifica archivo',t=>{const f=setup(t),d=new DatabaseSync(f);create(d);put(d,'a','antes');d.exec('BEGIN');put(d,'a','nuevo');put(d,'b','otro');const old=fs.fsyncSync;fs.fsyncSync=()=>{throw new Error('interrupción')};try{assert.throws(()=>d.exec('COMMIT'),/persistir/)}finally{fs.fsyncSync=old}assert.equal(get(d,'a'),'antes');assert.equal(get(new DatabaseSync(f),'b'),undefined)});
test('lectura corrupta y falla I/O no se tratan como base vacía',t=>{const f=setup(t);fs.writeFileSync(f+'.json','{');assert.throws(()=>new DatabaseSync(f),/leer almacenamiento/);assert.equal(fs.readFileSync(f+'.json','utf8'),'{'); const old=fs.readFileSync;fs.readFileSync=(p,...args)=>{if(p===f+'.json')throw new Error('EIO');return old(p,...args)};try{assert.throws(()=>new DatabaseSync(f),/leer almacenamiento/)}finally{fs.readFileSync=old}});
test('fallback rechaza base SQLite existente',t=>{const f=setup(t);fs.writeFileSync(f,'sqlite sintético');assert.throws(()=>new DatabaseSync(f),/divergencia/)});
test('interrupción antes de rename conserva versión anterior y close revierte transacción',t=>{const f=setup(t),d=new DatabaseSync(f);create(d);put(d,'a','antes');d.exec('BEGIN');put(d,'a','pendiente');d.close();assert.equal(get(new DatabaseSync(f),'a'),'antes');assert.equal(get(d,'a'),'antes')});
test('proceso interrumpido antes de rename deja el JSON anterior legible',t=>{const f=setup(t),d=new DatabaseSync(f);create(d);put(d,'a','original');const code=`import fs from 'node:fs'; const {DatabaseSync}=await import(${JSON.stringify(new URL('../src/storage/sqlite-compat.js',import.meta.url).href)}); const db=new DatabaseSync(${JSON.stringify(f)}); fs.renameSync=()=>process.kill(process.pid,'SIGKILL'); db.prepare('INSERT OR REPLACE INTO t (id, data) VALUES (?, ?)').run('a','nuevo');`;const {spawnSync}=requireForSpawn();const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,SHIN_SQLITE_FALLBACK:'1'}});assert.equal(child.signal,'SIGKILL');assert.equal(get(new DatabaseSync(f),'a'),'original')});
function requireForSpawn(){return {spawnSync: spawnSyncForTest}}
