/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Riokuroxi — ensayos locales sin YouTube ni proveedor real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createPoDownloader } from '../src/lib/po-audio.js';
import { obtenerAudioProcesado, resolverAudioPoDirecto } from '../src/lib/play-fuentes.js';

const ffmpeg=process.env.TEST_FFMPEG || 'ffmpeg', ffprobe=process.env.TEST_FFPROBE || 'ffprobe';
const disponible=spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status===0 && spawnSync(ffprobe,['-version'],{stdio:'ignore'}).status===0;
async function preparar(t, modo='ok') {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shin-po-test-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const src=path.join(dir,'source.webm');
 assert.equal(spawnSync(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=500:duration=2','-c:a','libopus',src],{stdio:'ignore'}).status,0);
 const plugin=path.join(dir,'plugin'); await fs.mkdir(plugin);
 for (const n of ['getpot_bgutil.py','getpot_bgutil_http.py','getpot_bgutil_script.py']) await fs.writeFile(path.join(plugin,n),'# simulación sin tokens\n');
 let activos=0,pico=0,comienzos=0,pings=0;
 const server=http.createServer((req,res)=>{
  if(req.url==='/ping'){pings++; if(modo==='ping429')res.statusCode=429; res.end(JSON.stringify({version:'2.0.2'}));return;}
  if(req.url==='/begin'){activos++;comienzos++;pico=Math.max(pico,activos);res.end('ok');return;}
  if(req.url==='/end'){activos--;res.end('ok');return;} res.writeHead(404).end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const port=server.address().port;
 const fake=path.join(dir,'yt-falso');
 const script=`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');const a=process.argv.slice(2);const has=(f,v)=>a.some((x,i)=>x===f&&a[i+1]===v);
if(!a.includes('--no-plugin-dirs')||!has('--extractor-args','youtube:player_client=mweb')||!has('--retries','0')||!has('--fragment-retries','0'))process.exit(5);
const p=a[a.indexOf('--plugin-dirs')+1];for(const n of ['getpot_bgutil.py','getpot_bgutil_http.py','getpot_bgutil_script.py'])if(!fs.existsSync(path.join(p,'bgutil','yt_dlp_plugins','extractor',n)))process.exit(6);
if(${JSON.stringify(modo)}==='429'){process.stderr.write('ERROR: HTTP Error 429: Too Many Requests');process.exit(1)}
if(${JSON.stringify(modo)}==='hipotetico'){process.stderr.write('WARNING: may yield HTTP Error 429\\n');process.exit(1)}
if(${JSON.stringify(modo)}==='fallo'){process.exit(1)}
function get(p,cb){http.get({host:'127.0.0.1',port:${port},path:p},r=>{r.resume();r.on('end',cb)}).on('error',()=>process.exit(8))}
get('/begin',()=>setTimeout(()=>{const o=a[a.indexOf('-o')+1];fs.copyFileSync(${JSON.stringify(src)},path.join(path.dirname(o),'audio.webm'));get('/end',()=>process.exit(0))},40));`;
 await fs.writeFile(fake,script,{mode:0o700});
 return {dir,app:createPoDownloader({ytdlp:fake,pluginSource:plugin,ffmpeg,ffprobe,providerPort:port,concurrency:2}),stats:()=>({pico,comienzos,pings})};
}
const req=(dir,n)=>({video:'NYHCX4H8-QM',output:path.join(dir,`- salida ñ ${n}.mp3`),maxBytes:1_000_000,maxInputBytes:1_000_000,timeoutMs:30_000});
const limpia=async dir=>assert.deepEqual((await fs.readdir(dir)).filter(n=>n.startsWith('.riokuroxi-')),[]);

test('15 simulaciones: cola de dos, flags y MP3 válido',{skip:!disponible},async t=>{
 const {dir,app,stats}=await preparar(t);const rs=await Promise.all(Array.from({length:15},(_,i)=>app.download(req(dir,i))));
 for(const r of rs){assert.equal(r.codec,'mp3');assert.ok(r.bytes>256);assert.ok(Math.abs(r.decodedDuration-2)<0.3)}
 assert.equal(stats().comienzos,15);assert.ok(stats().pico<=2);assert.equal(stats().pings,15);
 await assert.rejects(app.download(req(dir,0)),e=>e.code==='DESTINATION');await limpia(dir);
});
test('429 explícito pausa la instancia',{skip:!disponible},async t=>{const {dir,app}=await preparar(t,'429');for(let i=0;i<2;i++)await assert.rejects(app.download(req(dir,i)),e=>e.code==='RATE_LIMIT');await limpia(dir)});
test('advertencia hipotética no es respuesta 429',{skip:!disponible},async t=>{const {dir,app,stats}=await preparar(t,'hipotetico');for(let i=0;i<2;i++)await assert.rejects(app.download(req(dir,i)),e=>e.code==='DOWNLOAD');assert.equal(stats().pings,2)});
test('fallo de descarga no usa otra fuente',{skip:!disponible},async t=>{const {dir,app}=await preparar(t,'fallo');await assert.rejects(app.download(req(dir,1)),e=>e.code==='DOWNLOAD');await assert.rejects(fs.stat(req(dir,1).output),e=>e.code==='ENOENT')});
test('configuración ausente falla sin alternativas',async()=>{
 const values=['SHIN_PO_MODE','SHIN_PO_YTDLP','SHIN_PO_PLUGIN_DIR'].map(k=>process.env[k]);process.env.SHIN_PO_MODE='bgutil';delete process.env.SHIN_PO_YTDLP;delete process.env.SHIN_PO_PLUGIN_DIR;
 try{await assert.rejects(obtenerAudioProcesado({videoId:'NYHCX4H8-QM'}),e=>e.code==='CONFIG')}finally{['SHIN_PO_MODE','SHIN_PO_YTDLP','SHIN_PO_PLUGIN_DIR'].forEach((k,i)=>{if(values[i]===undefined)delete process.env[k];else process.env[k]=values[i]})}
});
test('429 de ping activa pausa',{skip:!disponible},async t=>{const {dir,app}=await preparar(t,'ping429');for(let i=0;i<2;i++)await assert.rejects(app.download(req(dir,i)),e=>e.code==='RATE_LIMIT')});
test('búsqueda directa se resuelve a un ID',async()=>{const j={title:'canción'};const r=await resolverAudioPoDirecto(j,async()=>({videoId:'NYHCX4H8-QM',title:'título'}));assert.equal(r.videoId,'NYHCX4H8-QM');await assert.rejects(resolverAudioPoDirecto(j,async()=>null))});
test('timeout y cancelación limpian',{skip:!disponible},async t=>{const {dir,app}=await preparar(t);await assert.rejects(app.download({...req(dir,1),timeoutMs:1}),e=>e.code==='TIMEOUT');const c=new AbortController();c.abort();await assert.rejects(app.download({...req(dir,2),signal:c.signal}),e=>e.code==='CANCELLED');await limpia(dir)});
test('proveedor ausente falla sin salida',{skip:!disponible},async t=>{const {dir}=await preparar(t);const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));const app=createPoDownloader({ytdlp:path.join(dir,'yt-falso'),pluginSource:path.join(dir,'plugin'),ffmpeg,ffprobe,providerPort:port});await assert.rejects(app.download(req(dir,1)),e=>e.code==='PROVIDER');await limpia(dir)});
