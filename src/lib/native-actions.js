/**
 * #lib/native-actions — acciones y tarjetas del sistema que el bot
 * puede fabricar y que casi nadie usa.
 *
 * Todo lo de aquí está comprobado con ida y vuelta por el proto de
 * baileys 6.7.24: fijar un mensaje para todo el grupo, guardar uno de
 * los que desaparecen, programar una llamada, mandar ubicación en
 * vivo, pedir un pago con fondo de color, un pedido, una factura y
 * las etiquetas accesibles de los medios.
 */

export const FIJAR = Object.freeze({ FIJAR: 1, QUITAR: 2 });
export const GUARDAR = Object.freeze({ GUARDAR: 1, DESHACER: 2 });
export const LLAMADA = Object.freeze({ VOZ: 1, VIDEO: 2 });
/** Duraciones que acepta el fijado (segundos). */
export const DURACION_FIJADO = Object.freeze({ DIA: 86400, SEMANA: 604800, MES: 2592000 });

const exigeClave = (key) => {
  if (!key?.id) throw new Error("hace falta la clave del mensaje");
  return key;
};

/** Convierte "#8B6CFF" en el entero ARGB que espera el proto. */
export function hexAArgb(hex, alfa = 0xff) {
  const limpio = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) throw new Error("el color va en formato #RRGGBB");
  return ((alfa << 24) >>> 0) + parseInt(limpio, 16);
}

/** Fija un mensaje para todo el grupo (o lo desfija). */
export function buildPin(key, { quitar = false, ahora = Date.now() } = {}) {
  return {
    pinInChatMessage: {
      key: exigeClave(key),
      type: quitar ? FIJAR.QUITAR : FIJAR.FIJAR,
      senderTimestampMs: ahora,
    },
  };
}

/** Rescata un mensaje temporal para que no se borre. */
export function buildKeep(key, { deshacer = false, ahora = Date.now() } = {}) {
  return {
    keepInChatMessage: {
      key: exigeClave(key),
      keepType: deshacer ? GUARDAR.DESHACER : GUARDAR.GUARDAR,
      timestampMs: ahora,
    },
  };
}

/** Llamada programada: sale como tarjeta con su hora y su botón. */
export function buildLlamadaProgramada({ cuando, titulo = "", video = false } = {}) {
  const ms = cuando instanceof Date ? cuando.getTime() : Number(cuando);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error("la llamada necesita fecha");
  return {
    scheduledCallCreationMessage: {
      scheduledTimestampMs: ms,
      callType: video ? LLAMADA.VIDEO : LLAMADA.VOZ,
      title: String(titulo || ""),
    },
  };
}

/**
 * Ubicación en vivo. El cliente la va moviendo mientras lleguen
 * actualizaciones con el mismo mensaje y sequenceNumber mayor.
 */
export function buildUbicacionViva({
  lat, lon, precision = 10, velocidad = 0, rumbo = 0, nota = "", secuencia = 1, miniatura = null,
} = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    throw new Error("la ubicación necesita lat y lon");
  }
  return {
    liveLocationMessage: {
      degreesLatitude: Number(lat),
      degreesLongitude: Number(lon),
      accuracyInMeters: Math.max(0, Math.round(precision)),
      speedInMps: Number(velocidad) || 0,
      degreesClockwiseFromMagneticNorth: Math.round(rumbo) || 0,
      caption: String(nota || ""),
      sequenceNumber: Math.max(1, Math.round(secuencia)),
      timeOffset: 0,
      ...(miniatura ? { jpegThumbnail: miniatura } : {}),
    },
  };
}

/**
 * Solicitud de pago con fondo de color: la tarjeta grande de WhatsApp
 * Pay, con el importe en grande y el color que le digamos.
 */
export function buildSolicitudPago({
  monto, moneda = "MXN", nota = "", de = "", vence = null, color = "#8B6CFF", colorTexto = "#FFFFFF",
} = {}) {
  const cantidad = Number(monto);
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("el pago necesita un importe positivo");
  const milesimas = Math.round(cantidad * 1000);

  return {
    requestPaymentMessage: {
      currencyCodeIso4217: String(moneda).toUpperCase(),
      amount1000: milesimas,
      amount: { value: milesimas, offset: 1000, currencyCode: String(moneda).toUpperCase() },
      ...(de ? { requestFrom: String(de) } : {}),
      ...(vence ? { expiryTimestamp: Math.round(Number(vence) / 1000) } : {}),
      ...(nota ? { noteMessage: { extendedTextMessage: { text: String(nota) } } } : {}),
      background: {
        id: "shin-md",
        placeholderArgb: hexAArgb(color),
        textArgb: hexAArgb(colorTexto),
        subtextArgb: hexAArgb(colorTexto, 0xcc),
      },
    },
  };
}

/** Pedido: la tarjeta de carrito con número de artículos y total. */
export function buildPedido({
  id = "", titulo = "", articulos = 1, total = 0, moneda = "MXN", vendedor = "", resumen = "", miniatura = null,
} = {}) {
  return {
    orderMessage: {
      orderId: String(id || Date.now()),
      orderTitle: String(titulo || "Pedido"),
      itemCount: Math.max(1, Math.round(articulos)),
      totalAmount1000: Math.round(Number(total) * 1000) || 0,
      totalCurrencyCode: String(moneda).toUpperCase(),
      ...(vendedor ? { sellerJid: String(vendedor) } : {}),
      message: String(resumen || ""),
      status: 1,   // INQUIRY
      surface: 1,  // CATALOG
      messageVersion: 2,
      ...(miniatura ? { thumbnail: miniatura } : {}),
    },
  };
}

/** Factura con su adjunto (imagen o PDF ya subido). */
export function buildFactura({ nota = "", token = "", tipo = 0, mimetype = "" } = {}) {
  return {
    invoiceMessage: {
      note: String(nota || ""),
      token: String(token || ""),
      attachmentType: tipo,           // 0 IMAGE · 1 PDF
      ...(mimetype ? { attachmentMimetype: String(mimetype) } : {}),
    },
  };
}

/**
 * Etiqueta accesible: el texto que lee el lector de pantalla y que
 * WhatsApp enseña cuando no puede cargar el medio. Ningún bot la pone.
 */
export function etiquetar(medio, descripcion) {
  if (!medio || typeof medio !== "object") throw new Error("falta el medio");
  const texto = String(descripcion ?? "").trim();
  if (!texto) return medio;
  medio.accessibilityLabel = texto;
  return medio;
}

/** Nota de voz de una sola escucha (se destruye al reproducirla). */
export function unaEscucha(audioMessage) {
  if (!audioMessage) throw new Error("falta el audioMessage");
  audioMessage.viewOnce = true;
  return audioMessage;
}

/**
 * Marca un contexto como efímero: el mensaje se borra solo pasados
 * los segundos indicados, aunque el chat no esté en modo temporal.
 */
export function conCaducidad(contextInfo = {}, segundos = DURACION_FIJADO.DIA) {
  const s = Math.round(Number(segundos));
  if (!Number.isFinite(s) || s <= 0) throw new Error("la caducidad va en segundos positivos");
  return {
    ...contextInfo,
    expiration: s,
    ephemeralSettingTimestamp: Math.round(Date.now() / 1000),
    disappearingMode: { initiator: 1, trigger: 1 },
  };
}

/** Envía cualquiera de estos contenidos por relay (no por sendMessage). */
export async function sendNative(sock, jid, contenido, { quoted } = {}) {
  try {
    const { generateWAMessageFromContent } = await import("baileys");
    const generado = generateWAMessageFromContent(jid, contenido, {
      userJid: sock?.user?.id,
      quoted,
      timestamp: new Date(),
    });
    await sock.relayMessage(jid, generado.message, { messageId: generado.key.id });
    return { sent: true, key: generado.key };
  } catch (error) {
    return { sent: false, error };
  }
}
