# 🔬 Investigación técnica — Shin-MD · Botones, juegos y rich messages

_Fecha: 2026-09-01_
_Fuentes: 5 bots MD clonados (YukiBot-MD, bunny-girl-bot-v2, Luna-Botv6, CuriosityBot-MD, GataBot-MD) + verificación contra Baileys 6.7.24 real instalado_

---

## 1. Bots clonados como referencia (`/home/user/reference/`)

| Bot | Stack | Menú | Botones | Juegos |
|---|---|---|---|---|
| **YukiBot-MD** | Baileys fork, ESM, import maps | Texto por categorías + banner link-preview | ❌ | ❌ |
| **bunny-girl-bot-v2** | TS, Baileys fork, better-sqlite3 | Texto por categorías + banner imagen cacheado | ❌ | ❌ |
| **Luna-Botv6** | Baileys, ESM, LowDB | Texto por categorías, multi-idioma | ✅ `sendButtonMessages`/`sendNCarousel`/`sendCarousel` | ✅ 25+ (TTT, batalla naval, buscaminas, sopa de letras, ahorcado, veoveo, slots...) |
| **CuriosityBot-MD** | Baileys, CommonJS | Texto + `externalAdReply` con newsletter | ✅ `interactiveMessage` en lib/func.js | ❌ |
| **GataBot-MD** | Baileys, CommonJS | Texto + imagen `Menu2.jpg` | ❌ (usa template legacy) | ✅ PPT, slots, TTT (con animación por `edit`) |

---

## 2. ✅ VERIFICADO contra Baileys 6.7.24 real (no teoría)

Todo lo que necesitamos para rich messages y juegos **existe y funciona**:

| API | Estado | Uso |
|---|---|---|
| `generateWAMessageFromContent` | ✅ export | Construir mensajes crudos |
| `proto.Message.InteractiveMessage` | ✅ | Tarjeta interactiva (rich) |
| `proto.Message.InteractiveMessage.NativeFlowMessage` | ✅ | Botones nativos |
| `proto.Message.InteractiveMessage.CarouselMessage` | ✅ | Carrusel de tarjetas |
| `prepareWAMessageMedia` | ✅ | Subir imagen/video como header |
| `sock.relayMessage` | ✅ método del socket | Enviar el mensaje construido |
| `sendMessage(..., { edit: key })` | ✅ | **Editar un mensaje existente** (clave del juego) |
| `buttonsResponseMessage` | ✅ proto | Captura de botón respuesta |
| `templateButtonReplyMessage` | ✅ proto | Captura de botón template |
| `listResponseMessage` | ✅ proto | Captura de lista |
| `interactiveResponseMessage` + `nativeFlowResponseMessage.paramsJson` | ✅ proto | **Captura de botones nativos** (rich) |
| `downloadMediaMessage` | ✅ export | Descargar media recibida |

---

## 3. Cómo funcionan los botones interactivos (rich message) — patrón real

**Envío** (patrón de LunaBot `interactive.js` y del código que te mandó el creador):

```js
// 1. Construir el mensaje interactivo con botones
const interactiveMessage = {
  body: { text: "Elige una opción:" },
  footer: { text: "反魂 Shin-MD" },
  header: { hasMediaAttachment: false },
  nativeFlowMessage: {
    buttons: [
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "🎮 Juegos", id: "juegos" }) },
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "📋 Info", id: "info" }) },
    ],
    messageParamsJson: "",
  },
};

// 2. Envolver en viewOnceMessage con contextInfo (lo que hace que WhatsApp lo pinte como rich)
const content = {
  viewOnceMessage: {
    message: {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage,
    },
  },
};

// 3. Enviar con generateWAMessageFromContent + relayMessage
const msg = generateWAMessageFromContent(jid, content, { userJid: sock.user.jid, quoted: m });
await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
```

**Captura del clic** (patrón de LunaBot `_templateResponse.js`) — el bot recibe el botón como un mensaje especial, y para no llenar el chat lo **reinyecta como si fuera un comando de texto**:

```js
// En el handler de mensajes entrantes:
let id = null;
if (m.message.buttonsResponseMessage) id = m.message.buttonsResponseMessage.selectedButtonId;
else if (m.message.templateButtonReplyMessage) id = m.message.templateButtonReplyMessage.selectedId;
else if (m.message.listResponseMessage) id = m.message.listResponseMessage.singleSelectReply?.selectedRowId;
else if (m.message.interactiveResponseMessage) {
  try { id = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id; } catch {}
}
// Si hay id, tratar el clic como un comando (ej: 'juegos' → mostrar menú de juegos)
if (id) router.handle(sock, { key: m.key, message: { conversation: PREFIX + id }, ... });
```

**Tipos de botones nativos que soporta WhatsApp** (verificado en los clones):
- `quick_reply` → botón de respuesta (lo que usan los juegos)
- `cta_url` → botón que abre URL
- `cta_copy` → botón que copia texto
- `cta_call` → botón que llama
- `cta_reminder` / `cta_cancel_reminder` → recordatorios
- `single_select` → **lista desplegable** (menú nativo)
- `address_message`, `send_location` → ubicación

---

## 4. Cómo funciona el juego tipo "KURO SLASH" (el que viste) — patrón real verificado

GataBot lo implementa en `fun-game.js` (máquina tragamonedas/slots) y es **exactamente** lo que describe tu investigación:

```
1. El bot ENVÍA un mensaje (texto o imagen) con botones interactivos ◀ ✂️CORTAR ▶ ULTI
2. El usuario toca un botón → WhatsApp manda interactiveResponseMessage
3. El bot captura el clic, calcula el siguiente frame del juego
4. El bot EDITEA el mismo mensaje con sendMessage(..., { edit: key }) → imagen/texto nuevo
5. Repite → animación en vivo, marcador, barra de vida, etc.
```

**Código real de GataBot (slots con animación por edit):**

```js
// Enviar mensaje inicial
let key = await conn.sendMessage(m.chat, { text: '🎰 | *RANURAS* | 🎰\n────────\n' + arrayInicial + '\n────────\n🎰 |   *SLOTS*   | 🎰' });

// Animar editando el mismo mensaje en bucle
for (let i = 0; i < pasos; i++) {
  await conn.sendMessage(m.chat, { text: '🎰 | *RANURAS* | 🎰\n────────\n' + array[i] + '\n────────\n🎰 |   *SLOTS*   | 🎰', edit: key });
  await new Promise((resolve) => setTimeout(resolve, 400));
}
```

**Para el "KURO SLASH" con gráficos** (el que jugaste con personaje, obstáculos, score):
1. **Renderizar frame con canvas** — usar `sharp` o `@napi-rs/canvas` (puro JS, sin binarios externos como ffmpeg) para dibujar cada frame
2. **Enviar la imagen + botones** como interactiveMessage con `header.imageMessage` (preparado con `prepareWAMessageMedia`)
3. **En cada clic** → calcular siguiente frame → `sendMessage(jid, { image: nuevoFrame, edit: key })` para reemplazar la imagen en el mismo mensaje

**Esto SÍ es factible con Baileys 6.7.24** — el mecanismo `edit` está verificado en `messages-send.js` (línea 664-683: `isEditMsg` → `additionalAttributes.edit = '1'`).

⚠️ **Advertencia honesta**: los juegos "en vivo" con edición rápida generan MUCHO tráfico y llaman la atención del anti-ban de WhatsApp. Para un bot personal con uso moderado está bien, pero no es para broadcast.

---

## 5. Cómo hacen los menús estéticos (con imagen/banner)

**Patrón "banner + link preview"** (YukiBot, bunny-girl) — usan `prepareWAMessageMedia` con `mediaTypeOverride: 'thumbnail-link'` para que el menú de texto tenga una imagen de preview encima:

```js
const prepared = await prepareWAMessageMedia(
  { image: buffer },
  { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
);
const content = {
  text: menuTexto,
  linkPreview: {
    'canonical-url': link,
    'matched-text': link,
    title: botname,
    description: '反魂 Shin-MD',
    jpegThumbnail: prepared.imageMessage?.jpegThumbnail
      ? Buffer.from(prepared.imageMessage.jpegThumbnail) : undefined,
  },
  contextInfo: { mentionedJid: [owner, sender], isForwarded: true, ... }
};
await sock.sendMessage(chatId, content, { quoted: msg });
```

**Patrón "externalAdReply"** (CuriosityBot, GataBot) — adjuntan una tarjeta con título/cuerpo/miniatura debajo del mensaje, usando `contextInfo.externalAdReply` con `thumbnailUrl`:

```js
{
  text: menuTexto,
  contextInfo: {
    externalAdReply: {
      title: '反魂 Shin-MD 💫',
      body: 'Bot superior hecho desde cero',
      mediaType: 1,
      thumbnailUrl: 'https://.../banner.jpg',
      sourceUrl: 'https://github.com/riokuroxi-svg/Shin-MD',
      renderLargerThumbnail: false,
    }
  }
}
```

**El truco de "tablas/imágenes/botones en un mismo mensaje"** es: combinar `interactiveMessage` con `header.imageMessage` (imagen) + `body.text` (tabla en markdown/monoespaciado) + `nativeFlowMessage.buttons` (botones). Todo en UN solo mensaje.

---

## 6. Conclusiones para Shin-MD

1. **Los botones interactivos funcionan en Baileys 6.7.24** — verificados contra el proto real
2. **El juego tipo KURO SLASH es viable**: `canvas`/`sharp` para frames + `interactiveMessage` con botones + `edit` para reemplazar el mensaje
3. **Los menús con banner** usan `prepareWAMessageMedia` con `mediaTypeOverride: 'thumbnail-link'` (link preview) o `externalAdReply` con `thumbnailUrl`
4. **No implementar "comandos muertos"**: los clones tienen MUCHOS comandos rotos/legacy (template messages que ya no funcionan, APIs muertas, etc.). Solo tomar lo verificado.
5. **Anti-ban**: juegos con edición rápida y rich messages generan tráfico atípico → usarlos con moderación, siempre por la cola + throttler

**Recomendación**: implementar en Shin-MD
- Menú base de **texto por categorías** (plantilla A, seguro y ligero)
- Opcional: menú con **banner + externalAdReply** (más bonito, funciona sin arriesgar nada)
- **Botones interactivos** en comandos clave (menú, juegos, confirmaciones) con fallback a texto
- **1-2 juegos sencillos** (TTT con tablero emoji, o trivia con botones) — el "wow"
- Juego "KURO" tipo canvas: más adelante, cuando el core esté sólido
