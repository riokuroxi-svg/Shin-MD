# Mapa de Shin-MD 3.7.1

> Generado con `npm run mapa`. No se edita a mano: los números y las listas
> salen del repositorio, así que si algo se mueve, se vuelve a lanzar.

## Cómo se arranca

```
curl … | sh          instalador: comprueba la huella, instala Node si hace falta,
                     baja la versión fijada y deja todo listo
      ↓
npm start            scripts/consola.mjs: dibuja el panel y vigila al bot
      ↓
   ¿sesión?          Sessions/Owner/auth.db con credenciales registradas
      ├─ sí ────────→ no pregunta nada
      └─ no ────────→ pide el número (aquí, en la consola)
                        ↓
                    pasa el número al bot y lanza: node index.js --code <número>
                        ↓
                    WhatsApp devuelve un código de 8 caracteres
                        ↓
                    se teclea en el teléfono: Ajustes › Dispositivos vinculados
```

El QR no existe en este proyecto. En la pantalla de un móvil no cabe y,
partido en trozos, no hay quien lo escanee. Si no hay terminal donde
preguntar (un servicio, un contenedor), el bot **no arranca a ciegas**: se
para y dice la orden exacta que hay que escribir.

## Las carpetas

| Carpeta | Archivos | Para qué |
| --- | --- | --- |
| `assets/` | 48 | Imágenes y sonidos que el bot envía (menús, avatares, portadas). |
| `boot/` | 1 | El arranque: licencia, banner, vinculación y carga de servicios. Un solo archivo, en orden. |
| `cmds/` | 219 | Los comandos de WhatsApp, uno por archivo. Se cargan en caliente: aquí no hay `import` que los una. |
| `data/` | 2 | La base de datos del bot y su respaldo JSON. Se crea sola. |
| `docs/` | 76 | Documentación para quien lee y para quien toca el código. |
| `logs/` | 2 | El registro diario del bot. |
| `media/` | 12 | Temporales de descargas y conversiones. Se vacían solos. |
| `scripts/` | 19 | Herramientas de mantenimiento (arranque, publicación, pruebas, auditorías). No las usa el bot al correr. |
| `src/` | 81 | El código del bot, por capas. Debajo va el desglose de cada subcarpeta. |
| `test/` | 46 | Las pruebas. Una por tema; cada archivo corre solo. |
| `tools/` | 11 | Utilidades de desarrollo: generadores de imágenes, vistas previas, este mapa. |
| `src/commands/` | 6 | El motor de comandos: cargador, router, contexto de mensaje y permisos. |
| `src/core/` | 5 | El conector: socket de WhatsApp, motor de estados, sesión y caché de metadatos. |
| `src/lib/` | 51 | Utilidades sin estado: formato, JID, tiempo, APIs de respaldo, vinculación, idioma visual. |
| `src/network/` | 2 | Cola de salida y salud de la red (reintentos, cortes, presión). |
| `src/services/` | 10 | Servicios con estado: base de datos del bot, economía, descargas, registro, vigía, consola. |
| `src/storage/` | 5 | Dónde se guarda todo: SQLite, migraciones, caché y memoria de identidades. |
| `src/web/` | 1 | El panel HTTP local del bot. |

Las carpetas de datos (`data/`, `logs/`, `media/`, `Sessions/`, `bin/`) aparecen
vacías en el repositorio a propósito: se llenan al correr y no se suben nunca.

Son **219 archivos de comando**, **51 utilidades** en `src/lib`, **10 servicios** y **45 archivos de prueba**.

## El viaje de un mensaje

```
WhatsApp
  → src/core/socket.js        messages.upsert: se guarda y se pasa al manejador
  → src/serialize.js          se convierte en el contexto que ven los comandos
  → src/commands/router.js    ¿prefijo? ¿permiso? ¿enfriamiento?
  → src/commands/loader.js    el comando ya estaba cargado (importación dinámica)
  → cmds/<categoría>/<x>.js   el comando responde
  → src/network/queue.js      la respuesta sale con cola y reintentos
```

## Dónde vive cada cosa

| Qué | Dónde | Se puede borrar |
| --- | --- | --- |
| Credenciales de WhatsApp | `Sessions/Owner/auth.db` | No: hay que volver a vincular |
| Economía, XP, perfiles, avisos | `data/shin.db` (SQLite) | No: es la memoria del bot |
| Respaldo legible de la base | `data/shin.db.json` | Sí, se regenera |
| Registro del día | `logs/shin-AAAA-MM-DD.log` | Sí |
| Temporales de descargas | `media/` | Sí, se limpian solos |
| Configuración | `.env` (ver `.env.example`) | No: sin él vuelve a lo de fábrica |

## Los comandos de `npm`

| Orden | Qué hace |
| --- | --- |
| `npm run start` | Arranca el bot con el panel de la consola. Pregunta el número si hace falta. |
| `npm run start:code` | Igual, pidiendo el código de vinculación. |
| `npm run vigia` | El vigilante: levanta el bot y lo recoge si se cae. |
| `npm run panel` | El panel web solo, sin el bot. |
| `npm run panel:vivir` | El panel web en primer plano, para verlo en el navegador mientras el bot corre. |
| `npm run start:keep` | Arranca sin panel (vigía), pensado para un servicio. |
| `npm run test` | La suite completa, archivo por archivo. |
| `npm run lint` | ESLint. Un error para todo; los avisos de estilo se toleran. |
| `npm run lint:fix` | ESLint arreglando lo que se puede arreglar solo. |
| `npm run format` | Prettier sobre todo el código. |
| `npm run format:check` | Comprobar el formato sin escribir nada. |
| `npm run typecheck` | TypeScript leyendo el JS con los JSDoc (sin convertirlo). |
| `npm run test:pairing` | Prueba la vinculación contra WhatsApp de verdad (una vez, a mano). |
| `npm run docs:web` | Regenera la página de comandos y los números de la documentación. |
| `npm run docs:pastel` | Regenera las imágenes del README. |
| `npm run mapa` | Regenera este mapa. |
| `npm run postinstall` | Aplica los parches al conector de WhatsApp. Se ejecuta al instalar. |
| `npm run firma` | Reescribe SHA256SUMS y apunta el arranque a la versión nueva. |
| `npm run publicar` | Saca una versión entera: versión, firma, suite, documentación, etiqueta, push y release. |
| `npm run release` | Alias de `publicar`. |
| `npm run firma:check` | Comprobar que las huellas cuadran con los archivos. |
| `npm run test:cobertura` | La suite con cobertura de líneas y ramas. |

## Las dependencias, una por una

| Paquete | Para qué |
| --- | --- |
| `@distube/ytdl-core` | Descargar de YouTube cuando `yt-dlp` no está. |
| `@img/sharp-wasm32` | El `sharp` de respaldo para Android/Termux, donde no hay binario nativo. No se importa: lo usa `sharp`. |
| `aptoide-scraper` | Buscar APKs en `.apk` (se carga solo cuando se usa). |
| `awesome-phonenumber` | Validar y formatear teléfonos en `.wastalk` (se carga solo cuando se usa). |
| `axios` | Peticiones HTTP de los comandos. |
| `baileys` | El conector de WhatsApp Multi-Device (paquete parcheado, ver `postinstall`). |
| `chalk` | Color en la terminal, con soporte de 256 colores y NO_COLOR. |
| `cheerio` | Leer HTML de las webs que se scrapean. |
| `dotenv` | Lee el `.env` al arrancar. |
| `express` | El servidor del panel web local. |
| `file-type` | Adivinar el tipo real de un archivo por su contenido. |
| `form-data` | Subir archivos en las APIs que lo piden. |
| `grapheme-splitter` | Contar caracteres como los cuenta una persona (emojis, acentos). |
| `human-readable` | Números grandes legibles (1.2 GB, 340 ms). |
| `jimp` | Edición de imágenes en JavaScript puro (lo que `sharp` no puede en WASM). |
| `mime-types` | El tipo por la extensión, cuando no hay bytes que mirar. |
| `moment` | Lo que usa `moment-timezone` por debajo. |
| `moment-timezone` | Fechas y horas en la zona del dueño. |
| `node-cache` | Caché en memoria con caducidad. |
| `node-fetch` | Peticiones HTTP donde `axios` no encaja (streams, descargas). |
| `node-webpmux` | Escribir metadatos en stickers WebP animados. |
| `pino` | El registro interno del conector de WhatsApp. |
| `qrcode` | Generar la imagen del QR dentro del chat (`.qrcode`), no en la consola. |
| `readline-sync` | Preguntar el número de vinculación en la terminal. |
| `sharp` | Redimensionar y convertir imágenes rápido. |
| `syntax-error` | Señalar la línea exacta cuando un comando no compila. |
| `ws` | WebSocket del panel web. |

## Las pruebas, por área

| Área | Archivos | Qué vigilan |
| --- | --- | --- |
| Arranque y vinculación | `arranque`, `vinculacion`, `entorno`, `pairing` | Que el bot no arranque sin número ni enseñe un QR |
| Instalador y publicación | `instalador`, `publicar`, `versiones`, `licencia` | Que el comando de una línea funcione y la versión no se quede vieja |
| Consola y diseño | `consola`, `consola-bot`, `aesthetic-ui`, `design-system` | Que las cajas cuadren y el texto se lea |
| Núcleo del bot | `core`, `context`, `router`, `interactive`, `compat`, `cola-incierta` | Enrutado, permisos, contexto, cola de salida |
| Datos y memoria | `sqlite-respaldo`, `economia`, `xp`, `lid`, `db-opcional`, `relevo` | Que nada se pierda al cerrar |
| Comandos concretos | `apis`, `menucat-fax`, `owner-mx`, `play-fuentes`, `ttt`, `random`, `tiempo`, `ytdlp-cliente` | Que cada uno haga lo suyo |
| Documentación y página | `docs-web`, `mapa`, `web`, `web-audit` | Que lo publicado no mienta |
| Operación | `vigia`, `mantenimiento`, `warmup-quota`, `conector-parches`, `auditoria`, `sombras` | Que el bot aguante en un VPS |

## Lo que se retiró y no vuelve

| Qué | Por qué |
| --- | --- |
| El QR en la consola | En un móvil no cabe; partido no se puede escanear. La vinculación es por código |
| `FASTSAVER_KEY` y `api.fastsaver.io` | La variable no la leía nadie y la API ya no respondía |
| `global.APIs` sin configurar | Reventaba cuatro comandos con un `TypeError`; ahora se configura en el `.env` |
| `github-readme-stats` | El servicio devolvía 503; las cifras se generan en casa |
| `cfonts`, `qrcode-terminal` | Dependencias que nadie importaba (el banner es de una columna, el QR no existe) |

## Por dónde empezar a leer

1. `boot/index.js` — se lee de arriba abajo y es el orden real del arranque.
2. `src/lib/vinculacion.js` — la decisión de a quién se vincula y quién pregunta.
3. `src/core/socket.js` — el conector, los eventos y los reintentos.
4. `src/commands/router.js` — qué pasa con cada mensaje.
5. `cmds/main/ping.js` — el comando más corto: sirve de plantilla.

Si vas a tocar algo, lee antes `docs/DESARROLLO.md`: las cinco reglas que
este proyecto no se salta.
