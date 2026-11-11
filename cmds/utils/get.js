/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import log from "#logger";
import { format } from 'util';
import { state } from '#lib/theme';
import { fetchSeguro, DestinoNoPermitido, CuerpoDemasiadoGrande } from '#lib/urlSegura';

// Tope del cuerpo. Antes se comprobaba DESPUÉS de tenerlo entero en memoria:
// si no había Content-Length (o el cuerpo crecía al descomprimir) el límite
// llegaba tarde. Ahora se lee en flujo y se corta al pasarse.
const MAXIMO_BYTES = 100 * 1024 * 1024;

export default {
  command: ['get', 'fetch'],
  category: 'utils',
  // El comando pide una URL y devuelve lo que responda el servidor: en manos
  // de cualquiera eso es un proxy hacia dentro de la red donde vive el bot
  // (localhost, 192.168.x, metadatos de la nube...). Solo el dueño.
  ownerOnly: true,
  description: 'Realizar solicitudes GET a páginas web (solo el dueño).',
  run: async ({ msg, sock, args }) => {
    const text = args[0];
    if (!text) return msg.reply('《✧》 Ingresa un enlace para realizar la solicitud.');
    if (!/^https?:\/\//.test(text)) {
      return msg.reply('《✧》 Ingresa un enlace válido que comience con http o https');
    }
    try {
      // fetchSeguro valida el destino, cada redirección y el tope del cuerpo.
      const { respuesta, leer } = await fetchSeguro(text, { maxBytes: MAXIMO_BYTES, timeoutMs: 20000 });
      const contentType = respuesta.headers.get('content-type') || '';
      const buffer = await leer();

      if (/text|json|xml|javascript/i.test(contentType)) {
        const content = buffer.toString('utf8');
        if (content.length > 500 && /html|css|javascript|json|xml|plain/i.test(contentType)) {
          const ext = getExtension(contentType, text);
          await sock.sendCodeMessage(msg.chat, `code_${Date.now()}${ext}`, content, msg);
        } else {
          try {
            const json = JSON.parse(content);
            return msg.reply(format(json).slice(0, 65536));
          } catch {
            return msg.reply(content.slice(0, 65536));
          }
        }
      } else {
        return sock.sendFile(msg.chat, buffer, 'file', text, msg);
      }
    } catch (e) {
      // Los dos fallos esperables se explican sin volcar la traza: son
      // destinos rechazados a propósito, no errores del bot.
      if (e instanceof DestinoNoPermitido) {
        log.warn(`.get rechazado: ${e.message}`);
        return msg.reply(`《✧》 Ese enlace no está permitido: ${e.message}`);
      }
      if (e instanceof CuerpoDemasiadoGrande) {
        log.warn(`.get cortado: ${e.message}`);
        return msg.reply(`《✧》 La respuesta es demasiado grande (máximo ${MAXIMO_BYTES} bytes).`);
      }
      log.error(e);
      return msg.reply(state('error', { detail: e.message }));
    }
  }
};

function getExtension(contentType, url) {
  const match = url.match(/\.(\w+)(?:\?|$)/);
  if (match) return `.${match[1]}`;
  const mime = (contentType || '').split(';')[0].trim().toLowerCase();
  const map = { 'text/html': '.html', 'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js', 'application/json': '.json', 'text/xml': '.xml', 'application/xml': '.xml', 'text/plain': '.txt' };
  return map[mime] || '.txt';
}
