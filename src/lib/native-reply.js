import { randomBytes } from 'node:crypto';

/**
 * Envío de una tarjeta interactiva nativa con botones (quick_reply, cta_copy, cta_url).
 *
 * Construye un mensaje `interactiveMessage` moderno (native_flow), compatible con
 * WhatsApp Multi-Device tanto en chats privados como en grupos.
 */

function buildMessageContextInfo() {
  return {
    deviceListMetadata: {
      senderKeyIndexes: [],
      recipientKeyIndexes: [],
      recipientKeyHash: '',
      recipientTimestamp: Math.floor(Date.now() / 1000),
    },
    deviceListMetadataVersion: 2,
    messageSecret: randomBytes(32),
  };
}

function isPrivateChat(jid = '') {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

function buildBizNode() {
  return {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: Math.floor(Date.now() / 1000).toString(),
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
}

/**
 * Envía una tarjeta con botones nativos.
 *
 * @param {object} opts
 * @param {object} opts.sock          Socket de Baileys.
 * @param {string} opts.jid           Chat destino.
 * @param {string} opts.body          Texto principal de la tarjeta.
 * @param {string} [opts.footer]      Pie de la tarjeta.
 * @param {string} [opts.title]       Título del header.
 * @param {object} [opts.quoted]      Mensaje citado.
 * @param {Array}  [opts.buttons]     [{ text, id, copy_code, url, name }]
 * @param {Buffer|string} [opts.imageBuffer] Portada (Buffer o URL).
 * @param {object|string} [opts.params] Adornos extra del mensaje
 *        (messageParamsJson): tarjeta con cuenta atrás, hoja inferior…
 *        Se arman con #lib/native-params. Ver ese archivo.
 * @returns {Promise<{sent: boolean, key?: object, error?: any}>}
 */
export async function sendNativeQuickReply({
  sock,
  jid,
  body,
  footer = '',
  title = '❦ Shin-MD',
  quoted,
  buttons = [],
  imageBuffer = null,
  params = null,
} = {}) {
  try {
    if (!sock?.relayMessage) throw new Error('El socket no expone relayMessage');

    const {
      generateWAMessageFromContent,
      prepareWAMessageMedia,
    } = await import('baileys');

    let mediaMessage = null;
    if (imageBuffer) {
      try {
        if (typeof sock.waUploadToServer === 'function') {
          const payload = Buffer.isBuffer(imageBuffer)
            ? { image: imageBuffer }
            : (typeof imageBuffer === 'string' && /^https?:\/\//i.test(imageBuffer) ? { image: { url: imageBuffer } } : null);

          if (payload) {
            const prepared = await prepareWAMessageMedia(
              payload,
              { upload: sock.waUploadToServer },
            );
            mediaMessage = prepared?.imageMessage || null;
          }
        }
      } catch {
        mediaMessage = null;
      }
    }

    const header = {
      title: String(title),
      subtitle: '',
      hasMediaAttachment: Boolean(mediaMessage),
    };
    if (mediaMessage) header.imageMessage = mediaMessage;

    const formattedButtons = (buttons || []).map((button) => {
      // 1. Botón nativo de Copiar Código (cta_copy)
      if (button.name === 'cta_copy' || button.copy_code || button.code) {
        return {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: String(button.text || button.display_text || 'Copiar Código'),
            id: String(button.id || 'copy_code'),
            copy_code: String(button.copy_code || button.code || ''),
          }),
        };
      }
      // 2. Botón nativo de Enlace (cta_url)
      if (button.name === 'cta_url' || button.url) {
        return {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: String(button.text || button.display_text || 'Enlace'),
            url: String(button.url || ''),
            merchant_url: String(button.url || ''),
          }),
        };
      }
      // 3. Botón de respuesta rápida (quick_reply)
      return {
        name: button.name || 'quick_reply',
        buttonParamsJson: typeof button.buttonParamsJson === 'string'
          ? button.buttonParamsJson
          : JSON.stringify({
              display_text: String(button.text || button.display_text || ''),
              id: String(button.id || ''),
              icon: (button.icon ? String(button.icon).toUpperCase() : undefined),
            }),
      };
    });

    const paramsJson = !params
      ? ''
      : (typeof params === 'string' ? params : JSON.stringify(params));

    const interactiveMessage = {
      header,
      body: { text: String(body || '') },
      footer: { text: String(footer || '') },
      nativeFlowMessage: {
        buttons: formattedButtons,
        // Adornos extra (cuenta atrás, hoja inferior). Solo se manda si
        // hay algo de verdad: un JSON vacío hace que algunos clientes
        // dibujen una franja gris de más.
        ...(paramsJson ? { messageParamsJson: paramsJson } : {}),
        messageVersion: 1,
      },
    };

    const message = {
      messageContextInfo: buildMessageContextInfo(),
      interactiveMessage,
    };

    const generated = generateWAMessageFromContent(jid, message, {
      userJid: sock.user?.id,
      quoted,
      timestamp: new Date(),
    });

    if (!generated?.key?.id || !generated.message) {
      throw new Error('No se pudo generar la tarjeta nativa');
    }

    const additionalNodes = [buildBizNode()];
    if (isPrivateChat(jid)) additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });

    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes,
    });

    return { sent: true, key: generated.key };
  } catch (error) {
    return { sent: false, error };
  }
}

export default sendNativeQuickReply;
