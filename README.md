<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&height=220&color=gradient&customColorList=12,23,25,30&text=反魂%20SHIN-MD&fontSize=54&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Bot%20WhatsApp%20Multi-Device%20Superior&descSize=18&descAlignY=60" width="100%"/>

<br>

[![WhatsApp Bot](https://img.shields.io/badge/WhatsApp-Bot-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/riokuroxi-svg/Shin-MD)
[![Node.js](https://img.shields.io/badge/Node.js-22.5%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-6.7.24-25D366?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![Tests](https://img.shields.io/badge/Tests-34%2F34%20✅-4ADE80?style=for-the-badge)](https://github.com/riokuroxi-svg/Shin-MD/actions)
[![CI](https://img.shields.io/github/actions/workflow/status/riokuroxi-svg/Shin-MD/test.yml?style=for-the-badge&label=CI)](https://github.com/riokuroxi-svg/Shin-MD/actions)
[![Audit](https://img.shields.io/badge/Auditoría-Atacado%20y%20endurecido%20✅-F59E0B?style=for-the-badge)](#-auditoría-y-ataques-2026-09-25)
[![License](https://img.shields.io/badge/License-AGPLv3-red?style=for-the-badge)](LICENSE)
[![Termux](https://img.shields.io/badge/Termux-Compatible-3DDC84?style=for-the-badge&logo=android&logoColor=white)](https://termux.com)

<br>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=26&duration=2800&pause=600&color=4ADE80&center=true&vCenter=true&width=640&lines=反魂+Shin-MD;El+renacer+de+un+bot+superior;Menú+premium+con+botones+nativos;Anti-ban+gaussiano+real;La+sesión+NUNCA+se+borra+sola" alt="Typing SVG" />

<br>

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

</div>

> ## ⚠️ AVISO IMPORTANTE — LEE ESTO ANTES DE USAR EL BOT
>
> **Usa un número secundario o virtual.** WhatsApp puede banear cuentas que
> automatizan mensajes. Shin-MD tiene el sistema anti-ban más serio de su
> clase (jitter gaussiano, warm-up, monitor de riesgo), pero **ningún bot es
> 100% inmune**. Si usas tu número principal y lo banean, es tu
> responsabilidad. El equipo de Shin-MD no se hace cargo de cuentas
> suspendidas. Número secundario barato > número de tu vida.

## 🧭 Estado del repositorio y reglas de trabajo

**Rol:** `REPO ESTABLE` — esto es lo que instalas para usar el bot en serio.

**Reglas:**

- Todo lo experimental nace en [**Shin-Lab**](https://github.com/riokuroxi-svg/Shin-Lab) y solo migra aquí cuando está probado.
- Cada bloque de trabajo termina con la suite de tests pasando (32/32) y un arranque verificado.
- Cada push corre tests automáticamente en GitHub Actions (CI).
- Historial limpio: un commit descriptivo por bloque, nada de commits "update" ni archivos basura.

| 🌿 Este repo (estable) | 🧪 Shin-Lab (laboratorio) |
|:---|:---|
| Lo instalas para usar el bot | Zona de experimentos: brain, memoria RAG, sub-bots |
| Tests pasando + CI verde | Puede romperse en cualquier momento |
| Tags y commits por bloque | Nada migra sin estar probado |

## 🏆 ¿Qué hace a Shin-MD superior?

| Característica | Shin-MD | Otros bots |
|---|---|---|
| **Arquitectura** | Capas separadas (core, network, services, storage, web) | Todo en index.js |
| **Auth** | SQLite nativo (`node:sqlite`, WAL, checkpoint al arrancar) | JSON frágil que se corrompe |
| **Anti-ban** | Jitter gaussiano + warm-up + monitor de riesgo + auto-pausa | "Random delay" sin lógica |
| **Sesión** | **NUNCA se borra por cortes de red** (solo en sesión muerta real) | 15 micro-cortes y pierdes la vinculación |
| **Cola de envío** | Cola serial con reintento y prioridad para comandos críticos | Envío directo, riesgo de ban |
| **Menú** | Tarjeta nativa + lista desplegable + botones, con fallback | Texto plano o botones muertos en iOS |
| **Logging** | Consola con iconos + archivo rotativo 7 días | console.log espartano |
| **Backoff** | Exponencial con jitter + modo paciente | Lineal o inexistente |
| **Seguridad** | DB con chmod 600 + panel con usuario verificado y bloqueo anti fuerza bruta | Panel abierto en tu red |
| **Tests** | Suite de 34 tests + CI en cada push | Cero tests |
| **Licencia** | AGPL-3.0 (protección real anti-comercial) | MIT sin restricciones |

## ✨ Características interactivas

- **Menú premium** (`.menu`): tarjeta nativa con banner + estadísticas, **lista desplegable por categorías** (tocas y se ejecuta), botones rápidos Ping/Owner/GitHub. Fallback automático a menú clásico si tu WhatsApp no la renderiza (`MENU_STYLE=text` lo fuerza).
- **Tag verde** (helper `sendAdReply`): etiquetita estilo canal verificado + link preview para cualquier mensaje.
- **Juego de tres en raya** (`.ttt`): tablero con botones interactivos — tocas una celda y el bot responde.
- **Carrusel todo-en-uno** (`.demo`): imagen + texto + botones en un solo mensaje deslizable (estilo reels/insta).
- **Play sin binarios** (`.play`/`.play2`): descarga YouTube→MP3/MP4 vía múltiples fuentes con `@distube/ytdl-core` de respaldo y soporte de **cookies** (`.subircookies`) para servidores bloqueados por YouTube.

## 🛡️ Anti-ban integrado (nativo)

No es un "delay random": es una capa pensada para parecer humano y auto-protegerse.

- **Jitter gaussiano**: los delays siguen una distribución natural, no predecible.
- **Warm-up diario**: empieza con un tope bajo de mensajes/día y sube gradualmente.
- **Perfil del número** (`NUMBER_PROFILE`): número nuevo = 1500ms + warm-up 7 días; número veterano = 700ms + warm-up 2 días. La fecha se persiste: el warm-up ya no se reinicia en cada arranque.
- **Penalización a contactos nuevos**: el primer contacto espera más, como una persona.
- **Comandos críticos prioritarios**: `.menu`, `.ping` y `.owner` responden al instante recién conectado (sin delay del warm-up).
- **Monitor de riesgo (0-100)**: puntúa disconnects, errores y fallos de envío.
- **Watchdog auto-healing**: si el riesgo es crítico **pausa los envíos solo**, sin matar el bot.
- **Sesión a prueba de Termux**: los cortes de red (408/428/503) reintentan en modo paciente **sin tocar tu sesión**; solo se limpia en sesión muerta real (401/411/500). Durante el pairing, los micro-cortes ni cuentan.
- **Regla #1**: solo responde a quien te escribe — no enfría mensajes a desconocidos.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## 🚀 Inicio rápido

### 📦 Instalación en Termux (Android)

📱 Copia y pega estos comandos uno por uno en Termux. No necesitas saber programar.

**1️⃣ Actualizar paquetes**

```bash
pkg update && pkg upgrade -y
```

**2️⃣ Instalar las herramientas necesarias**

```bash
pkg install -y git nodejs python ffmpeg
```

**3️⃣ Clonar el bot**

```bash
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
```

**4️⃣ Instalar dependencias**

```bash
npm install
```

**5️⃣ Configurar**

```bash
cp .env.example .env
# Edita .env con tu número y método de conexión
# nano .env  (o cualquier editor)
```

**6️⃣ Iniciar el bot**

```bash
npm start -- --code
# o con QR: npm start -- --qr
```

**Vinculación por código (recomendada en Termux):** pon en `.env`
`PAIRING_METHOD=code` y `PAIRING_NUMBER=521...` (tu número, solo dígitos).
El bot te mostrará un código de 8 caracteres → en WhatsApp:
Dispositivos vinculados → Vincular con número de teléfono.

### BoxMine / VPS

```bash
git clone https://github.com/riokuroxi-svg/Shin-MD
cd Shin-MD
npm install
cp .env.example .env
# Configura .env con PAIRING_METHOD=code y PAIRING_NUMBER
npm start
```

💡 En servidores sin terminal interactiva, el pairing toma el número del
`.env` automáticamente (nunca se queda esperando teclado).

## 🗂️ Comandos destacados

| Comando | Aliases | Descripción |
|---|---|---|
| `.menu` | `help`, `ayuda`, `h` | Menú premium con lista desplegable y botones |
| `.play` | `yt`, `mp3`, `ytmp3`, `musica` | Descargar audio de YouTube 🎵 |
| `.play2` | `mp4`, `ytmp4`, `playvideo` | Descargar video de YouTube 📹 |
| `.tiktok` | `tt` | Descargar video de TikTok sin marca de agua |
| `.deezer` | `dzr` | Buscar música en Deezer (preview 30s) 🎧 |
| `.ytsearch` | `search`, `ys` | Buscar videos en YouTube 🔍 |
| `.facebook` | `fb` | Descargar video de Facebook 📹 |
| `.instagram` | `ig`, `reel` | Descargar reel/story de Instagram (requiere FASTSAVER_KEY) |
| `.twitter` | `x` | Descargar video de Twitter/X 🐦 |
| `.pinterest` | `pin` | Descargar imágenes de Pinterest (requiere FASTSAVER_KEY) |
| `.mediafire` | `mf` | Descargar archivos de MediaFire 📦 |
| `.drive` | `gdrive` | Descargar archivos de Google Drive 🗂️ |
| `.apk` | `aptoide`, `apkdl` | Buscar y descargar APKs de Aptoide 📱 |
| `.imagen` | `img`, `image` | Buscar imágenes 📷 |
| `.sticker` | `s`, `stiker` | Crear sticker desde imagen 🏷️ |
| `.ttt` | `tresenraya`, `tateti` | Tres en Raya con botones interactivos |
| `.demo` | `carousel`, `reels` | Carrusel todo-en-uno (imagen + texto + botones) |
| `.subir` | `upload` | *(owner)* Actualizar archivos del bot desde WhatsApp |
| `.subircookies` | `cookies` | *(owner)* Subir cookies.txt de YouTube como documento |
| `.benchdl` | | Prueba de velocidad de las APIs de descarga ⏱️ |
| `.ping` | `p` | Latencia del bot (prioridad inmediata) |
| `.runtime` | `status`, `uptime` | Estado del bot |
| `.owner` | `creator`, `creador` | Info del creador |

Son **197 comandos únicos** en total (14 categorías: descargas, anime, economía, gacha, juegos, grupos, NSFW, owner...). Escribe `.menu` y explora.

🔑 *Instagram y Pinterest requieren `FASTSAVER_KEY` en .env (gratis en api.fastsaver.io). Twitter funciona sin key pero es más estable con ella.*

## ⚙️ Configuración

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción | Default |
|---|---|---|
| `OWNER_NUMBER` | Tu número (solo dígitos) | — |
| `PAIRING_METHOD` | `code` o `qr` | `code` |
| `PAIRING_NUMBER` | Número para vincular por código | — |
| `NUMBER_PROFILE` | `auto` · `nuevo` (1500ms/7d) · `veterano` (700ms/2d) | `auto` |
| `MENU_STYLE` | `auto` (tarjeta con botones) · `text` (clásico) | `auto` |
| `MENU_IMAGE` | URL de imagen de banner para el menú | — |
| `RICH_EXTRA` | ⚠️ `1` activa trucos estéticos con riesgo de ban | `0` |
| `LOG_LEVEL` | trace, debug, info, warn, error, silent | `info` |
| `LOG_FILE` | `0` apaga el log rotativo en `logs/` | activo |
| `PORT` | Puerto del panel HTTP | `3000` |
| `LOOPBACK` | `1` = solo local · `0` = expuesto en red | `1` |
| `PANEL_PASSWORD` | **Obligatoria si `LOOPBACK=0`** (usuario: `admin`) | — |
| `YT_API_URL` | URL de API de YouTube→MP3 con `{url}` | — |
| `YT_API_KEY` | API key para `YT_API_URL` | — |
| `YTDL_ENABLED` | `1` activa descarga directa con ytdl | `0` |
| `COOKIES_FILE` | Ruta de cookies de YouTube (sube con `.subircookies`) | `./cookies.txt` |
| `STICKER_PACK` | Nombre del pack de stickers | `Shin-MD` |
| `STICKER_AUTHOR` | Autor del sticker | `@ShinBot` |
| `FASTSAVER_KEY` | Key gratis de api.fastsaver.io (IG, Twitter, Pinterest) | — |
| `BOT_PREFIX` | Prefijo de comandos | `.` |

## 🗂️ Estructura del proyecto

```
Shin-MD/
├── index.js              ← Entry point (npm start)
├── boot/index.js         ← Arranque: perfil del número + engine + socket
├── cmds/                 ← 197 comandos en 14 categorías (carga dinámica)
├── test/                 ← Suite de 32 tests (node --test)
├── src/
│   ├── core/
│   │   ├── engine.js     ← Ciclo de vida + ventana de prioridad
│   │   ├── socket.js     ← Conexión Baileys (reconexión paciente, backoff)
│   │   ├── auth.js       ← Auth state en SQLite (creds + keys, chmod 600)
│   │   └── engine/throttler.js ← shinJitter + warm-up + perfiles
│   ├── network/
│   │   ├── queue.js      ← Cola de envío serial con prioridad
│   │   └── health.js     ← Monitor de riesgo de ban (0-100)
│   ├── commands/
│   │   ├── loader.js     ← Cargador dinámico de cmds/
│   │   ├── router.js     ← Prefijo → cooldown → permisos → handler
│   │   ├── interactive.js← Tarjetas, listas desplegables, carrusel, tag verde
│   │   └── middleware/   ← cooldown (antispam) + permisos
│   ├── services/
│   │   ├── logger.js     ← Iconos + log rotativo 7 días
│   │   ├── downloader.js ← YouTube multifuente + cookies
│   │   └── watchdog.js   ← Auto-healing
│   ├── storage/          ← SQLite WAL + migraciones + caché TTL
│   └── web/server.js     ← Panel /health /metrics (con contraseña)
└── .github/workflows/    ← CI: tests en cada push
```

## 🖥️ Panel local

Con el bot corriendo:

- `http://127.0.0.1:3000/` — estado general
- `http://127.0.0.1:3000/health` — riesgo, cola, **grupos conectados**, memoria
- `http://127.0.0.1:3000/metrics` — métricas de proceso

Si lo expones en red (`LOOPBACK=0`) necesitas `PANEL_PASSWORD`; sin ella el
panel vuelve solo a localhost por seguridad. El usuario es siempre `admin`
(se valida, no basta con la contraseña) y hay **bloqueo anti fuerza bruta**:
10 intentos fallidos por IP ⇒ HTTP 429 durante 5 minutos (ni acertando la
contraseña se desbloquea antes).

## 🛡️ Auditoría y ataques (2026-09-25)

Antes de su primer arranque real, el bot fue **clonado desde cero y atacado**:

| Ataque / verificación | Resultado |
|---|---|
| Clon fresco + `npm install` + arranque | ✅ 197 comandos, cero errores |
| Suite de tests desde clon limpio | ✅ 34/34 |
| Panel sin auth / contraseña mala / usuario malo | ✅ 401 en los tres |
| Path traversal (`../`, `%2e%2e`) y rutas sensibles (`.env`, logs, código) | ✅ 404 sin fuga de información |
| Verbos HTTP raros, headers basura y gigantes | ✅ bloqueados, sin crash |
| Fuerza bruta (11 intentos seguidos) | ✅ 429 a partir del intento 11 |
| Inyección SQL/FTS5 y entradas gigantes | ✅ resistidas |
| Secretos (tokens, contraseñas) en código e historial git | ✅ ninguno |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades (qs parcheado a 6.16.0) |

Hallazgos corregidos en esa misma auditoría (commit `0b01510`): el panel
ahora valida el usuario además de la contraseña y aplica el bloqueo 429.

## 🧪 Shin-Lab — el laboratorio

Todo lo experimental vive en [**riokuroxi-svg/Shin-Lab**](https://github.com/riokuroxi-svg/Shin-Lab):
brain local anti-spam, memoria RAG, sub-bots aislados por proceso y
migraciones desde otros bots. **Nada migra aquí sin estar probado.**

## 📜 Licencia

**Shin-MD** está protegido bajo **GNU Affero General Public License v3.0**.

Esto significa que:
- ✅ Puedes usar, modificar y compartir el código
- ❌ **No puedes** usarlo en servicios comerciales cerrados
- ❌ **No puedes** vender este bot o una versión modificada
- ✅ Si haces mejoras, debes compartirlas bajo la misma licencia

El objetivo es claro: que nadie lucre con este trabajo. Es y será siempre libre.

### 🏷️ Marca y atribución (AGPL, Sección 7)

Además del texto de AGPL-3.0, este proyecto aplica los **términos
adicionales permitidos por la Sección 7** (ver archivo `NOTICE`):

1. **Atribución obligatoria.** Las obras derivadas (forks, zips
   redistribuidos, bots renombrados) deben preservar `LICENSE`, `NOTICE`
   y los headers SPDX de cada archivo, y deben mostrar de forma visible
   en `.menu` y `.owner`:

   > Basado en Shin-MD por riokuroxi-svg - github.com/riokuroxi-svg/Shin-MD

2. **Marca.** *Shin-MD* es una marca de riokuroxi-svg. No se puede usar
   (ni 反魂 ni variantes) para promocionar clones u obras derivadas.

3. **Check de arranque.** El bot verifica en cada arranque que `LICENSE`
   y `NOTICE` existan; si faltan, no arranca. Eso no es un virus: es la
   licencia exigiendo que se respete.

### 🧬 Fingerprint de Shin-MD (marcador de obras derivadas)

El motor anti-ban de Shin-MD tiene una combinación de parámetros única
(documentada en `NOTICE`):

- `shinJitter()` — jitter gaussiano (Box-Muller, desviación **0.25**)
- Retardo base **1200 ms** (rango 400–5000 ms, +25 ms por carácter),
  ajustado por perfil de número: nuevo **1500 ms** / veterano **700 ms**
- Penalización **×1.5** para contactos nuevos
- Warm-up de **20→500** mensajes/día durante **7 días** (2 en veteranos)

Si ves estos parámetros exactos en otro bot, es una obra derivada de
Shin-MD y debe cumplir la atribución de la Sección 7.

<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%"/>

## ⭐ Créditos y enlaces

- 🌿 **Creador:** [riokuroxi-svg](https://github.com/riokuroxi-svg) 🇲🇽
- 🤖 **Librería:** [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) 6.7.24 + parche de vinculación propio
- 🧪 **Laboratorio:** [Shin-Lab](https://github.com/riokuroxi-svg/Shin-Lab)
- ⚖️ **Licencia:** AGPL-3.0 + NOTICE (Sección 7)

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=22&duration=3000&pause=800&color=4ADE80&center=true&vCenter=true&width=640&lines=反魂+SHIN-MD;No+es+un+bot;es+infraestructura+que+no+se+cae" alt="Typing SVG" />

<br/>

<a href="https://github.com/riokuroxi-svg/Shin-MD/stargazers">
  <img src="https://img.shields.io/github/stars/riokuroxi-svg/Shin-MD?style=social"/>
</a>
<a href="https://github.com/riokuroxi-svg/Shin-MD/forks">
  <img src="https://img.shields.io/github/forks/riokuroxi-svg/Shin-MD?style=social"/>
</a>

<img src="https://capsule-render.vercel.app/api?type=waving&height=140&color=gradient&customColorList=12,23,25,30&section=footer" width="100%"/>

</div>
