/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Riokuroxi — ruta experimental aislada de audio con proveedor HTTP.
 */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

export class AudioPoError extends Error {
  constructor(code, message) { super(message); this.name = 'AudioError'; this.code = code; }
}
function fail(code, message) { throw new AudioPoError(code, message); }
function videoId(value) {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  let u;
  try { u = new URL(value); } catch { return fail('INPUT', 'Identificador o enlace inválido'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return fail('INPUT', 'Enlace no admitido');
  let id;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname) && u.pathname === '/watch') id = u.searchParams.get('v');
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return fail('INPUT', 'Identificador de video inválido');
  return id;
}
function semaphore(limit) {
  let active = 0; const queue = [];
  function release() {
    const next = queue.shift();
    if (next) { next.signal.removeEventListener('abort', next.onAbort); next.resolve(release); }
    else active--;
  }
  return function acquire(signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (active < limit) { active++; return Promise.resolve(release); }
    return new Promise((resolve, reject) => {
      const item = { resolve, signal, onAbort() { const index=queue.indexOf(item); if(index>=0) queue.splice(index,1); reject(signal.reason); } };
      queue.push(item); signal.addEventListener('abort', item.onAbort, { once: true });
      if (signal.aborted) item.onAbort();
    });
  };
}
function processRun(executable, args, signal, env, capture = false, onLimit = null) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const child = spawn(executable, args, { shell:false, detached:true, stdio:['ignore', capture?'pipe':'ignore', onLimit?'pipe':'ignore'], cwd:env.HOME, env });
    let text = '', overflow = false, settled = false;
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') child.kill('SIGKILL'); } };
    const abort = () => kill(); signal.addEventListener('abort', abort, {once:true});
    if (signal.aborted) kill();
    let pending = "";
    const checkLine = line => {
      if (onLimit && /^(?:ERROR|WARNING):/i.test(line) && !/may (?:yield|cause|result)/i.test(line) && /HTTP Error\s+429|429\s+Too Many Requests/i.test(line)) onLimit();
    };
    if (onLimit) {
      child.stderr.on("data", chunk => {
        pending = (pending + chunk.toString("utf8")).slice(-16384);
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) checkLine(line);
      });
    }
    if (capture) child.stdout.on('data', chunk => { if (text.length + chunk.length > 131072) { overflow = true; kill(); } else text += chunk.toString('utf8'); });
    child.on('error', e => { if (!settled) { settled=true; signal.removeEventListener('abort',abort); reject(signal.aborted ? signal.reason : new AudioPoError(e.code === 'ENOENT' ? 'TOOL' : 'PROCESS', 'No se pudo iniciar la herramienta')); } });
    child.on('close', code => { if (settled) return; checkLine(pending); settled=true; signal.removeEventListener('abort',abort); if (signal.aborted) reject(signal.reason); else if (overflow) reject(new AudioPoError('PROCESS','Salida de herramienta demasiado extensa')); else if(code !== 0) reject(new AudioPoError('PROCESS',`Proceso falló (código ${code})`)); else resolve(text); });
  });
}
function duration(info) {
  const d = Number(info.format?.duration || info.streams?.[0]?.duration);
  if (!Number.isFinite(d) || d <= 0) return fail('VALIDATION', 'Duración inválida');
  return d;
}
const tolerance = d => Math.max(0.30, d * 0.01);
async function inspect(file, probe, signal, env) {
  const result = await processRun(probe, ['-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','stream=codec_name,duration:format=duration','-of','json',file], signal, env, true);
  try { const info = JSON.parse(result); if (!info.streams?.[0]?.codec_name) throw Error(); return { codec:info.streams[0].codec_name, duration:duration(info) }; }
  catch (e) { if (e instanceof AudioPoError) throw e; return fail('VALIDATION','Metadatos inválidos'); }
}
function pingProvider(port, signal, onLimit) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    let body = "", done = false;
    const finish = (error) => { if (done) return; done=true; signal.removeEventListener('abort',abort); if(error) reject(error); else resolve(); };
    const req=http.get({host:'127.0.0.1',port,path:'/ping',timeout:3000}, res => {
      if (res.statusCode === 429) onLimit();
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if(body.length>4096) req.destroy(); });
      res.on('end', () => { try { if(res.statusCode!==200 || JSON.parse(body).version!=='2.0.2') throw Error(); finish(); } catch { finish(new AudioPoError('PROVIDER','Proveedor local no disponible o versión inesperada')); } });
      res.on('error', () => finish(signal.aborted ? signal.reason : new AudioPoError('PROVIDER','Respuesta local interrumpida')));
      res.on('aborted', () => finish(new AudioPoError('PROVIDER','Respuesta local interrumpida')));
    });
    const abort = () => { req.destroy(); finish(signal.reason); };
    signal.addEventListener('abort',abort,{once:true});
    if (signal.aborted) abort();
    req.on('timeout',()=>req.destroy());
    req.on('error',()=>finish(signal.aborted ? signal.reason : new AudioPoError('PROVIDER','Proveedor local no disponible')));
  });
}
export function createPoDownloader({ ytdlp, pluginSource, ffmpeg='ffmpeg', ffprobe='ffprobe', nodePath=process.execPath, concurrency=2, providerPort=4416 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) return fail('INPUT','Concurrencia inválida');
  if (!ytdlp || !path.isAbsolute(ytdlp) || !pluginSource || !path.isAbsolute(pluginSource) || !Number.isInteger(providerPort) || providerPort < 1 || providerPort > 65535) return fail('CONFIG','Configura rutas absolutas de yt-dlp y plugin');
  const acquire = semaphore(concurrency);
  const circuit = new AbortController();
  const limited = () => circuit.abort(new AudioPoError('RATE_LIMIT','Pausa por posible HTTP 429; reinicia solo tras revisar el límite'));
  return { async download({ video, output, quality='192k', maxBytes=20000000, maxInputBytes=100000000, timeoutMs=300000, signal:external } = {}) {
    const id=videoId(video);
    if (typeof output !== 'string' || path.extname(output).toLowerCase() !== '.mp3' || !['vbr0','192k','320k'].includes(quality) || !Number.isSafeInteger(maxBytes) || maxBytes<256 || maxBytes===Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(maxInputBytes) || maxInputBytes<256 || !Number.isSafeInteger(timeoutMs) || timeoutMs<1) return fail('INPUT','Parámetros inválidos');
    const dst=path.resolve(output), parent=path.dirname(dst), controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new AudioPoError('TIMEOUT','Tiempo agotado')),timeoutMs);
    const abortCircuit=()=>controller.abort(circuit.signal.reason);
    if (circuit.signal.aborted) abortCircuit(); else circuit.signal.addEventListener('abort',abortCircuit,{once:true});
    const abortExternal=()=>controller.abort(new AudioPoError('CANCELLED','Cancelado'));
    if (external) { if (external.aborted) abortExternal(); else external.addEventListener('abort',abortExternal,{once:true}); }
    let release, temp;
    try {
      release=await acquire(controller.signal);
      try { await fs.lstat(dst); return fail('DESTINATION','Salida ya existe'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      temp=await fs.mkdtemp(path.join(parent,'.riokuroxi-'));
      const env={ ...process.env, HOME:temp, XDG_CONFIG_HOME:path.join(temp,'config'), XDG_CACHE_HOME:path.join(temp,'cache') };
      await pingProvider(providerPort, controller.signal, limited);
      const extractor = path.join(temp,'plugins','bgutil','yt_dlp_plugins','extractor');
      await fs.mkdir(extractor,{recursive:true,mode:0o700});
      for (const name of ['getpot_bgutil.py','getpot_bgutil_http.py','getpot_bgutil_script.py']) {
        const source = path.join(pluginSource,name);
        if (!(await fs.stat(source)).isFile()) return fail('CONFIG','Falta el plugin bgutil');
        await fs.symlink(source,path.join(extractor,name));
      }
      await fs.mkdir(path.join(temp,'sin-script'),{mode:0o700});
      const args=['--ignore-config','--no-plugin-dirs','--no-remote-components','--no-cache-dir','--proxy','','--force-ipv4','--no-playlist','--no-progress','--no-warnings','--retries','0','--fragment-retries','0','--extractor-retries','0','--file-access-retries','0','--socket-timeout','30','--max-filesize',String(maxInputBytes),'--no-overwrites'];
      args.push('--plugin-dirs',path.join(temp,'plugins'),
        '--extractor-args','youtube:player_client=mweb',
        '--extractor-args','youtubepot-bgutilscript:server_home=sin-script',
        '--extractor-args',`youtubepot-bgutilhttp:base_url=http://127.0.0.1:${providerPort}`);
      if(nodePath) args.push('--no-js-runtimes','--js-runtimes','node:'+nodePath);
      if(ffmpeg.includes(path.sep)) args.push('--ffmpeg-location',path.resolve(ffmpeg));
      args.push('-f','bestaudio','-o',path.join(temp,'audio.%(ext)s'),'https://www.youtube.com/watch?v='+id);
      try { await processRun(ytdlp,args,controller.signal,env,false,limited); } catch(e) { if(e.code==='PROCESS') throw new AudioPoError('DOWNLOAD','Falló extracción o descarga'); throw e; }
      const names=(await fs.readdir(temp)).filter(n=>/^audio\.[A-Za-z0-9]+$/.test(n));
      if(names.length !== 1) return fail('DOWNLOAD','No se encontró una única entrada completa');
      const source=path.join(temp,names[0]); const sourceStat=await fs.stat(source);
      if(!sourceStat.isFile() || sourceStat.size<=0 || sourceStat.size>maxInputBytes) return fail('SIZE','Tamaño de entrada inválido');
      const input=await inspect(source,ffprobe,controller.signal,env);
      const tmp=path.join(temp,'resultado.mp3');
      const enc=['-nostdin','-hide_banner','-v','error','-xerror','-y','-protocol_whitelist','file,pipe','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-map_chapters','-1','-codec:a','libmp3lame'];
      enc.push(...(quality==='vbr0'?['-q:a','0']:['-b:a',quality]),'-fs',String(maxBytes+1),'-f','mp3',tmp);
      try { await processRun(ffmpeg,enc,controller.signal,env); } catch(e) { if(e.code==='PROCESS') throw new AudioPoError('CONVERSION','Conversión fallida'); throw e; }
      const stat=await fs.stat(tmp); if(stat.size>maxBytes) return fail('SIZE','Salida excede límite');
      const out=await inspect(tmp,ffprobe,controller.signal,env);
      if(out.codec!=='mp3' || stat.size<256 || stat.size/out.duration<2000 || stat.size/out.duration>100000 || Math.abs(out.duration-input.duration)>tolerance(input.duration)) return fail(stat.size>=maxBytes*0.98?'SIZE':'VALIDATION','Códec, tamaño o duración inválidos');
      let progress;
      try { progress=await processRun(ffmpeg,['-nostdin','-v','error','-xerror','-protocol_whitelist','file,pipe','-i',tmp,'-map','0:a:0','-progress','pipe:1','-f','null','-'],controller.signal,env,true); }
      catch(e) { if(e.code==='PROCESS') throw new AudioPoError('VALIDATION','Decodificación fallida'); throw e; }
      const fields=Object.fromEntries(progress.trim().split('\n').map(line=>{const p=line.indexOf('=');return p<0?['',line]:[line.slice(0,p),line.slice(p+1)];}));
      const decoded=Number(fields.out_time_us)/1000000;
      if(fields.progress!=='end'||!Number.isFinite(decoded)||Math.abs(decoded-input.duration)>tolerance(input.duration)) return fail('VALIDATION','Duración decodificada inválida');
      if(controller.signal.aborted) throw controller.signal.reason;
      try { await fs.link(tmp,dst); } catch(e) { if(e.code==='EEXIST') throw new AudioPoError('DESTINATION','Salida ya existe'); throw e; }
      return { codec:'mp3', bytes:stat.size, sourceDuration:input.duration, duration:out.duration, decodedDuration:decoded, quality };
    } catch(e) { if(e instanceof AudioPoError) throw e; throw new AudioPoError('IO','Fallo de entrada/salida'); }
    finally { clearTimeout(timer); if(external) external.removeEventListener('abort',abortExternal); circuit.signal.removeEventListener('abort',abortCircuit); try { if(temp) await fs.rm(temp,{recursive:true,force:true}); } finally { if(release) release(); } }
  }};
}
export { videoId };
