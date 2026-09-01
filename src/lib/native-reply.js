import { randomBytes } from 'node:crypto';

/**
 * Envío de una tarjeta interactiva nativa con botones `quick_reply`.
 *
 * Reutiliza el patrón que ya funciona en `.menu` (`buildBizNode` +
 * generateWAMessageFromContent + relayMessage) para construir un mensaje
 * `interactiveMessage` moderno (native_flow), que WhatsApp actual renderiza
 * de forma estable. A diferencia de `sendMessage({ buttons })` (tipo legacy
 * `buttonsMessage`, que Meta está descartando), esta ruta produce el formato
 * actual y NO exige una imagen: si no hay portada, se usa header de texto.
 *
 * Se mantiene deliberadamente autocontenido (solo importa 'baileys' y node:crypto)
 * para poder probarse aislado y para no acoplar el envío de tarjetas al sistema
 * de comandos del menú. `buildBizNode`/`isPrivateChat` reflejan la misma
 * estructura que `core/lib/native-menu.js`; consolidar ambos en un único helper
 * es una limpieza futura, no un requisito para funcionar.
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
 * Envía una tarjeta con botones nativos `quick_reply`.
 *
 * @param {object} opts
 * @param {object} opts.sock          Socket de Baileys (debe exponer relayMessage, user, waUploadToServer).
 * @param {string} opts.jid           Chat destino (msg.chat).
 * @param {string} opts.body          Texto principal de la tarjeta.
 * @param {string} [opts.footer]      Pie de la tarjeta.
 * @param {string} [opts.title]       Título del header (se usa cuando hay media).
 * @param {object} [opts.quoted]      Mensaje citado.
 * @param {Array}  [opts.buttons]     [{ text, id, icon? }] para quick_reply.
 * @param {Buffer} [opts.imageBuffer] Portada opcional (best-effort).
 * @returns {Promise<{sent: boolean, key?: object, error?: any}>}
 */
export async function sendNativeQuickReply({
  sock,
  jid,
  body,
  footer = '',
  title = '❦ Ginko-MD',
  quoted,
  buttons = [],
  imageBuffer = null,
} = {}) {
  try {
    if (!sock?.relayMessage) throw new Error('El socket no expone relayMessage');

    const {
      generateWAMessageFromContent,
      prepareWAMessageMedia,
    } = await import('baileys');

    // La portada es opcional y NUNCA bloquea los botones: si no se puede subir
    // (o el socket no expone waUploadToServer), se envía con header de texto.
    let mediaMessage = null;
    if (imageBuffer) {
      try {
        if (typeof sock.waUploadToServer === 'function') {
          const prepared = await prepareWAMessageMedia(
            { image: imageBuffer },
            { upload: sock.waUploadToServer },
          );
          mediaMessage = prepared?.imageMessage || null;
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

    const interactiveMessage = {
      header,
      body: { text: String(body || '') },
      footer: { text: String(footer || '') },
      nativeFlowMessage: {
        buttons: (buttons || []).map((button) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: String(button.text || ''),
            id: String(button.id || ''),
            icon: (button.icon ? String(button.icon).toUpperCase() : undefined),
          }),
        })),
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
