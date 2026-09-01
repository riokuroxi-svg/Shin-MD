// TTS — texto a voz usando Edge TTS (sin API key, sin binarios)
// Voz: es-MX-DaliaNeural (femenina, español mexicano)
import WebSocket from 'ws';
import crypto from 'crypto';

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}`;
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const VOZ = 'es-MX-DaliaNeural';
const MAX = 4500;

export default {
  name: "tts", aliases: ["voz", "speak"], category: "utility",
  description: "Texto a nota de voz (voz femenina) 🎙️",
  usage: ".tts <texto>", cooldown: 10,
  async handler(sock, ctx, engine) {
    if (!ctx.arg) return "🎙️ *TTS*\n\nUso: `.tts <texto>`\nEj: `.tts Hola, soy Shin-MD`";
    const text = ctx.arg.trim();
    if (text.length > MAX) return `❌ Texto muy largo (máx ${MAX} caracteres).`;
    try {
      const buf = await edgeTTS(text);
      if (!buf || buf.length < 500) return '❌ No se pudo generar el audio.';
      await engine.getSendQueue().enqueue(()=>sock.sendMessage(ctx.chatId,{audio:buf,mimetype:'audio/mpeg',ptt:true},{quoted:ctx.full}),{messageLength:20});
      return null;
    } catch(e) { return `❌ Error: ${e.message}`; }
  }
};

async function edgeTTS(text) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSS);
    const audioChunks = [];
    const connKey = crypto.randomUUID().replace(/-/g, '');
    let reqId = crypto.randomUUID().toUpperCase();
    const date = new Date().toUTCString().replace(/GMT$/, 'GMT+0000 (Coordinated Universal Time)');

    ws.on('open', () => {
      // Send connect message
      ws.send(`X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"${FORMAT}"}}}}`);
      
      // Send SSML
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="es-MX"><voice name="${VOZ}"><mstts:express-as style="general">${escapeXml(text)}</mstts:express-as></voice></speak>`;
      ws.send(`X-RequestId:${reqId}\r\nX-Timestamp:${date}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', data => {
      const str = data.toString();
      if (str.startsWith('X-RequestId:')) return;
      const idx = str.indexOf('Path:audio');
      if (idx >= 0) {
        const audioStart = str.indexOf('\r\n\r\n', idx) + 4;
        if (audioStart > 4 && audioStart < str.length) {
          audioChunks.push(Buffer.from(str.slice(audioStart), 'base64'));
        }
      }
      if (str.includes('Path:turn.end')) {
        ws.close();
        resolve(Buffer.concat(audioChunks));
      }
    });
    ws.on('error', reject);
    ws.on('close', () => {
      if (audioChunks.length) resolve(Buffer.concat(audioChunks));
      else reject(new Error('Connection closed'));
    });

    setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 15000);
  });
}

function escapeXml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}