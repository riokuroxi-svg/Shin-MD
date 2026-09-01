<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=12,23,25,30&text=反魂%20SHIN-MD&fontSize=54&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Bot%20WhatsApp%20Multi-Device%20Superior&descSize=18&descAlignY=60" width="100%"/>

<br>

[![WhatsApp Bot](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/riokuroxi-svg/Shin-MD)
[![Node.js](https://img.shields.io/badge/Node.js-24+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.24-25D366?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-AGPLv3-red?style=for-the-badge)](LICENSE)
[![Termux](https://img.shields.io/badge/Termux-Compatible-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://termux.com)

<br>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=26&duration=2800&pause=600&color=4ADE80&center=true&vCenter=true&width=640&lines=反魂+Shin-MD;El+renacer+de+un+bot+superior;Hecho+desde+cero;Arquitectura+limpia+y+moderna;AGPL-3.0+Protegido" alt="Typing SVG" />

<br>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">

</div>

## 🏆 ¿Qué hace a Shin-MD superior?

| Característica | Shin-MD | Otros bots |
|---|---|---|
| **Arquitectura** | Capas separadas (core, network, services, storage, web) | Todo en index.js |
| **Auth** | SQLite nativo (`node:sqlite`, WAL, atómico) | JSON frágil que se corrompe |
| **Anti-ban** | Jitter gaussiano + warm-up + monitor de riesgo + auto-pausa | "Random delay" sin lógica |
| **Cola de envío** | Cola serial con reintento, pasa por el throttler | Envío directo, riesgo de ban |
| **Logging** | Pino estructurado + salida legible | console.log espartano |
| **Backoff** | Exponencial con jitter | Lineal o inexistente |
| **Licencia** | AGPL-3.0 (protección real anti-comercial) | MIT sin restricciones |
| **Dependencias** | Versiones fijas, mínimas | Versiones sueltas |

## ✨ Características interactivas

- **Menú con botones**: `.menu` abre un menú con botones táctiles por categoría (con fallback a texto).
- **Juego de tres en raya** (`.ttt`): tablero con botones interactivos — tocas una celda y el bot responde.
- **Carrusel todo-en-uno** (`.demo`): imagen + texto + botones en un solo mensaje deslizable (estilo reels/insta).
- **Play sin binarios** (`.play`): descarga YouTube→MP3 vía API HTTP con múltiples fallbacks — cero ffmpeg/yt-dlp en el servidor (ideal para BoxMine). Configurable con `YT_API_URL`/`YT_API_KEY`.

## 🛡️ Anti-ban integrado (nativo)

No es un "delay random": es una capa pensada para parecer humano y auto-protegerse.

- **Jitter gaussiano**: los delays siguen una distribución natural, no predecible.
- **Warm-up diario**: empieza con un tope bajo de mensajes/día y sube gradualmente en 7 días.
- **Penalización a contactos nuevos**: el primer contacto espera más, como una persona.
- **Monitor de riesgo (0-100)**: puntúa disconnects, errores y fallos de envío.
- **Watchdog auto-healing**: si el riesgo es crítico **pausa los envíos solo**, sin matar el bot; si el proceso se cuelga, lo detecta.
- **Backoff exponencial + jitter** en reconexiones (máx 15 intentos antes de limpiar sesión).
- **Regla #1**: solo responde a quien te escribe — no enfría mensajes a desconocidos.

## 🚀 Inicio rápido

### Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y git nodejs-lts ffmpeg
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
npm install
cp .env.example .env
# Edita .env con tu número y método de conexión
npm start
```

### BoxMine / VPS

```bash
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
npm install
# Configura .env con PAIRING_METHOD=code y PAIRING_NUMBER
npm start
```

## 🗂️ Comandos disponibles

| Comando | Aliases | Descripción |
|---|---|---|
| `.menu` | `help`, `ayuda`, `h` | Menú interactivo con botones por categoría |
| `.play` | `yt`, `mp3`, `playmp3`, `ytaudio`, `ytmp3`, `musica`, `playaudio` | Descargar audio de YouTube 🎵 |
| `.tiktok` | `tt` | Descargar video de TikTok sin marca de agua |
| `.deezer` | `dzr` | Buscar música en Deezer (preview 30s) |
| `.ytsearch` | `search`, `ys` | Buscar videos en YouTube |
| `.facebook` | `fb` | Descargar video de Facebook |
| `.mediafire` | `mf` | Descargar archivos de MediaFire |
| `.drive` | `gdrive` | Descargar archivos de Google Drive |
| `.apk` | `aptoide`, `apkdl` | Buscar y descargar APKs de Aptoide |
| `.imagen` | `img`, `image` | Buscar imágenes 📷 |
| `.sticker` | `s`, `stiker` | Crear sticker desde imagen con tu pack/author |
| `.ttt` | `tresenraya`, `tateti` | Jugar Tres en Raya con botones interactivos |
| `.demo` | `showcase`, `carousel`, `reels` | Carrusel todo-en-uno (imagen + texto + botones) |
| `.ping` | `p` | Latencia del bot |
| `.runtime` | `status`, `uptime`, `estado` | Estado del bot |
| `.owner` | `creator`, `creador`, `dueño`, `dev` | Info del creador |

⚠️ **Servicios temporalmente fuera de línea** (sin API gratuita estable): `instagram`/`ig`/`reel`, `twitter`/`x`, `pinterest`/`pin`. Se reactivarán cuando haya APIs funcionales.

## ⚙️ Configuración

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción | Default |
|---|---|---|
| Variable | Descripción | Default |
|---|---|---|
| `OWNER_NUMBER` | Tu número (solo dígitos) | — |
| `PAIRING_METHOD` | `code` o `qr` | `code` |
| `PAIRING_NUMBER` | Número para pairing | — |
| `LOG_LEVEL` | trace, debug, info, warn, error, silent | `info` |
| `PORT` | Puerto del panel HTTP | `3000` |
| `LOOPBACK` | `1` = solo local, `0` = red | `1` |
| `YT_API_URL` | URL de API de YouTube→MP3 con `{url}` | — |
| `YT_API_KEY` | API key para `YT_API_URL` | — |
| `YTDL_ENABLED` | Usar ytdl-core como fallback de descarga | `0` |
| `MENU_IMAGE` | URL de imagen de banner para el menú | — |
| `STICKER_PACK` | Nombre del pack de stickers | `Shin-MD` |
| `STICKER_AUTHOR` | Autor del sticker | `@ShinBot` |

## 🗂️ Estructura del proyecto

```
Shin-MD/
├── index.js              ← Entry point (npm start)
├── boot/index.js         ← Arranque: engine + socket + router + web
├── cmds/                 ← Comandos/plugins (carga dinámica)
├── test/                 ← Tests (node --test)
├── src/
│   ├── core/
│   │   ├── engine.js     ← Ciclo de vida + eventos + cola
│   │   ├── socket.js     ← Conexión Baileys (reconexión, backoff)
│   │   ├── auth.js       ← Auth state en SQLite (creds + keys)
│   │   └── metaCache.js  ← Caché de metadatos de grupos
│   ├── network/          ← Capa anti-ban
│   │   ├── throttler.js  ← Jitter + warm-up + penalizaciones
│   │   ├── queue.js      ← Cola de envío serial
│   │   └── health.js     ← Monitor de riesgo de ban
│   ├── commands/
│   │   ├── loader.js     ← Cargador dinámico de cmds/
│   │   ├── router.js     ← Pipeline: prefijo → cooldown → permisos → handler
│   │   └── middleware/   ← cooldown (antispam) + permisos
│   ├── services/
│   │   ├── logger.js     ← Pino + Chalk
│   │   └── watchdog.js   ← Auto-healing
│   ├── storage/
│   │   ├── database.js   ← SQLite + migraciones
│   │   ├── migrations.js ← Migraciones (source of truth)
│   │   └── cache.js      ← Caché TTL
│   └── web/server.js     ← Panel local /health /metrics
```

## 🖥️ Panel local

Con el bot corriendo:

- `http://127.0.0.1:3000/` — estado
- `http://127.0.0.1:3000/health` — riesgo, cola, memoria
- `http://127.0.0.1:3000/metrics` — métricas de proceso

## 📜 Licencia

**Shin-MD** está protegido bajo **GNU Affero General Public License v3.0**.

Esto significa que:
- ✅ Puedes usar, modificar y compartir el código
- ❌ **No puedes** usarlo en servicios comerciales cerrados
- ❌ **No puedes** vender este bot o una versión modificada
- ✅ Si haces mejoras, debes compartirlas bajo la misma licencia

El objetivo es claro: que nadie lucre con este trabajo. Es y será siempre libre.

## 🧠 Filosofía

> **"No quiero clonar una base ya hecha de otro bot y ponerle mi nombre. Quiero construir algo superior con herramientas actuales, no con lo que 'siempre se ha hecho así' en estos bots MD."**

Este bot está construido desde cero con investigación profunda, no copiando lo que otros hacen. Cada decisión técnica tiene una razón.

## 🍁 Créditos

**Creador:** [riokuroxi-svg](https://github.com/riokuroxi-svg)

Basado en la experiencia de Ginko-MD, pero reconstruido desde cero para ser superior.

---

<div align="center">
  <img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">
  <br><br>
  <strong>反魂 Shin-MD</strong> — El renacer de un bot superior
</div>
