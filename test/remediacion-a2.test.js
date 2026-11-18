/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {importJsonFallbackToDatabase as migrate} from '../src/storage/sqlite-compat.js';
// Simula la API transaccional SQLite: no sustituye pruebas con SQLite real.
class FakeDB {
 constructor(){this.tables={creds:[],signal_keys:[]};this.markers={};this.fail=0;this.n=0}
 exec(sql){if(sql.startsWith('BEGIN'))this.snapshot=structuredClone({tables:this.tables,markers:this.markers});else if(sql.startsWith('ROLLBACK'))Object.assign(this,this.snapshot);else if(sql.startsWith('COMMIT')){if(this.fail==='commit')throw Error('fallo commit');this.snapshot=null}}
 prepare(sql){const self=this;return {get(...v){if(sql.startsWith('SELECT digest'))return self.markers[v[0]]?{digest:self.markers[v[0]]}:undefined;if(sql.includes('sqlite_master'))return self.tables[v[0]]?{name:v[0]}:undefined;const table=sql.match(/FROM "([^"]+)"/)?.[1];if(!table)throw Error('SQL get no esperado '+sql);if(!sql.includes('WHERE'))return self.tables[table].length?{hay:1}:undefined;const cols=[...sql.matchAll(/"([^"]+)" IS \?/g)].map(x=>x[1]);return self.tables[table].some(row=>cols.every((c,i)=>row[c]===v[i]))?{hay:1}:undefined},run(...v){if(sql.startsWith('INSERT INTO shin_json_imports')){self.markers[v[0]]=v[1];return {changes:1}};const m=sql.match(/INSERT INTO "([^"]+)" \((.*?)\) VALUES/);if(!m)throw Error('SQL run no esperado');self.n++;if(self.fail===self.n)throw Error('fallo sintético');const cols=[...m[2].matchAll(/"([^"]+)"/g)].map(x=>x[1]);self.tables[m[1]].push(Object.fromEntries(cols.map((c,i)=>[c,v[i]])));return {changes:1}}}}
}
function setup(t,raw){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shin-a2-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const f=path.join(dir,'auth.db.json');fs.writeFileSync(f,JSON.stringify(raw));return f}
const data={creds:{1:{id:1,data:'{"registered":true}'}},signal_keys:{'a':{category:'key',id:'id',data:'{}'}},__claves_primarias__:{creds:['id']}};
test('migra todo, verifica y conserva formato original; reintento idempotente',t=>{const f=setup(t,data),original=fs.readFileSync(f,'utf8'),db=new FakeDB();assert.equal(migrate(db,f),2);assert.equal(fs.readFileSync(f,'utf8'),original);assert.equal(migrate(db,f),0);assert.equal(db.tables.signal_keys.length,1)});
test('fallo entre filas revierte todas y permite recuperación',t=>{const f=setup(t,data),db=new FakeDB();db.fail=2;assert.throws(()=>migrate(db,f),/cancelada/);assert.deepEqual(db.tables.creds,[]);assert.deepEqual(db.tables.signal_keys,[]);assert.ok(fs.existsSync(f));db.fail=0;db.n=0;assert.equal(migrate(db,f),2)});
test('fallo commit revierte y conserva original',t=>{const f=setup(t,data),db=new FakeDB();db.fail='commit';assert.throws(()=>migrate(db,f),/cancelada/);assert.deepEqual(db.tables.creds,[]);assert.ok(fs.existsSync(f))});
test('destino ocupado, tabla ausente o fila inválida no ocasionan migración parcial',t=>{const f=setup(t,data);for(const mode of ['busy','missing','bad']){const db=new FakeDB();if(mode==='busy')db.tables.signal_keys.push({x:1});if(mode==='missing')delete db.tables.signal_keys;if(mode==='bad')fs.writeFileSync(f,JSON.stringify({...data,signal_keys:{a:null}}));assert.throws(()=>migrate(db,f),/cancelada/);assert.deepEqual(db.tables.creds,[]);assert.ok(fs.existsSync(f))}});
test('respaldo cambiado después de importar exige revisión',t=>{const f=setup(t,data),db=new FakeDB();migrate(db,f);fs.writeFileSync(f,JSON.stringify({...data,extra:{}}));assert.throws(()=>migrate(db,f),/cancelada/);assert.equal(db.tables.creds.length,1)});
test('JSON corrupto no se reemplaza',t=>{const f=setup(t,data),db=new FakeDB();fs.writeFileSync(f,'{');assert.throws(()=>migrate(db,f));assert.equal(fs.readFileSync(f,'utf8'),'{');assert.deepEqual(db.tables.creds,[])});
