# Blindaje de dependencias (Sello de Integridad)

> Este documento responde a una pregunta concreta y nada más: **¿qué vigila
> el bot dentro de su propio código, y qué no?** Si vienes del README con la
> idea de que esto es un antivirus, la respuesta corta es que no lo es.

## Lo que es y lo que no es

| Es | No es |
|---|---|
| un **detector de integridad**: compara `node_modules` con una foto anterior | un antivirus: no tiene firmas de virus ni las va a tener |
| un **detector de anomalías** de la cadena de suministro: lo instalado contra `package-lock.json` | un sandbox: no impide que un paquete se ejecute si el modo es `avisar` |
| un **análisis de señales** de contenido: webhooks, `eval` sobre base64, `curl \| sh`, lectura de la sesión | una prueba de intención: da evidencia, no un veredicto moral |
| una **prevención**: en modo estricto, el código sospechoso no llega a ejecutarse | una garantía criptográfica de autor: quien tenga tu clave puede re-sellar |

Un detector de anomalías es una pieza legítima de un antivirus, pero no es el
antivirus. La versión anterior de este sistema se anunciaba como algo que no
era; ahora hace más cosas y promete menos.

## Las cinco capas

```
1. INTEGRIDAD   ¿cambió algo desde la foto?          src/lib/integridad.js
2. ANOMALÍAS    ¿lo instalado cuadra con el lock?    src/lib/analisis-dependencias.js
3. ANÁLISIS     ¿el contenido tiene señales malas?   src/lib/analisis-dependencias.js
4. PREVENCIÓN   ¿esto debe impedir arrancar?         scripts/preload-integridad.mjs
5. AUDITORÍA    ¿queda constancia?                   src/lib/auditoria-seguridad.js
```

### 1 · Integridad

Huella **sha256 de todos los archivos** de `node_modules`, sin lista de
extensiones y sin carpetas perdonadas, más `package.json`, `package-lock.json`
y los enlaces simbólicos (por su destino, para ver si los re-apuntan).

La foto se guarda en `data/.shin-integridad.json` —**fuera** de
`node_modules`, para que `npm ci` no se la lleve— y va firmada con
**HMAC-SHA256** usando una clave que se crea sola en `data/.shin-clave` (0600)
o la que pongas en `SHIN_INTEGRIDAD_CLAVE`.

### 2 · Anomalías

Lo declarado en `package-lock.json` contra lo que hay instalado:

- paquetes que se descargan de un registro que **no** es `registry.npmjs.org`;
- descargas por **HTTP sin cifrar**;
- paquetes instalados que **nadie declaró** (y declarados que faltan, salvo
  opcionales y binarios de otra plataforma);
- entradas del lock **sin `integrity`**;
- paquetes cuya carpeta dice ser **otra cosa** por dentro (salvo alias
  legítimos, como `baileys → @whiskeysockets/baileys`);
- scripts de instalación (`preinstall`/`install`/`postinstall`) **fuera de la
  lista de excepciones explicadas** (hoy: `baileys`, `sharp`, `esbuild`,
  `protobufjs` y `@img/sharp-wasm32`).

### 3 · Análisis

Reglas de contenido sobre los archivos de texto del árbol (o solo sobre los
que cambiaron, que es el caso normal):

| Regla | Qué ve |
|---|---|
| `eval-ofuscado` | `eval`/`new Function` sobre algo decodificado de base64 |
| `exfiltracion` | webhooks de Discord, bots de Telegram, pastebin, ngrok, interactsh, oast |
| `shell-y-red` | `child_process` junto a `curl`/`wget` con una URL |
| `entorno-exfiltrado` | `JSON.stringify(process.env)` camino de una petición |
| `sesion-whatsapp` | una dependencia leyendo `Sessions/`, `auth.creds` o pre-keys |
| `minero` | `stratum+tcp`, `xmrig` |
| `ofuscacion-hex` | cientos de escapes `\xNN` |
| `blob-base64` | bloques base64 de más de 800 caracteres incrustados |

`sesion-whatsapp` no salta dentro de `baileys` ni de `libsignal`: ahí leer la
sesión **es su trabajo**. Un detector que grita en el paquete más legítimo del
árbol es un detector que se ignora.

### 4 · Prevención

`scripts/preload-integridad.mjs` se carga con `--import`, así que corre
**antes** que el módulo de entrada. En ESM los `import` estáticos se ejecutan
antes que el cuerpo del archivo: una comprobación escrita dentro de
`boot/index.js` llega cuando `baileys` y cualquier dependencia comprometida ya
se cargaron. Detectar después de ejecutar no es proteger.

Ya está enganchado en `npm start`, `npm run vigia` y en
`scripts/supervisor.mjs`, que es quien arranca al bot en los tres casos.

### 5 · Auditoría

Cada arranque deja una línea JSON en `logs/seguridad-AAAA-MM-DD.jsonl` (modo,
estado, capas, motivos y los hallazgos hasta 20) y un resumen en `/health`.
Sin registro no hay evidencia, y sin evidencia solo hay opiniones.

## Los tres modos

| `SHIN_INTEGRIDAD` | Si el árbol no cuadra |
|---|---|
| `off` | no comprueba nada |
| `avisar` *(por defecto)* | lo dice en la consola y en `/health`; el bot arranca |
| `estricto` | **no arranca**. El sello detecta al arrancar y, en modo estricto, se niega a iniciar |

```bash
node index.js --sellar            # toma la foto (después de instalar y revisar)
SHIN_INTEGRIDAD=estricto npm start
SHIN_ANALISIS=completo npm start  # audita los ~6.000 archivos aunque no haya cambios
```

Las tres variables valen puestas en el `.env`: el preload lo lee **antes** de
comprobar (no puede usar `dotenv`, porque eso sería cargar una dependencia para
poder comprobar las dependencias). Lo que escribas en la orden manda sobre el
archivo.

En `estricto`, después de instalar un paquete que sí querías, hay que volver a
sellar: es el precio de que el modo signifique algo.

**Lo que no puede hacer.** Quien pueda escribir archivos *y* leer la clave —un
paquete que corre como tu usuario— puede volver a sellar. Esto no es una firma
de autor. Lo que consigue es que re-sellar deje de ser silencioso: hace falta un
comando explícito, el sello cambia y queda en el registro.

## Lo que se corrigió

| Fallo de la versión anterior | Gravedad | Ahora |
|---|---|---|
| eximía `baileys/lib` y `baileys/esm` enteros | crítica | no se exime nada; el sello se toma tras los parches |
| ignoraba `.txt` y todo lo que no fuera `.js/.json/.node`, y saltaba carpetas `test`/`docs` | media | se hashea todo archivo |
| aceptaba un sello ausente o ilegible como «sin sello» | alta | `sello-invalido` es un estado propio; en estricto, falla cerrado |
| cualquiera podía re-sellar sin dejar rastro | crítica | sello firmado con HMAC + registro de cada sellado |
| la comprobación corría después de los `import` estáticos | crítica | preload con `--import`, antes de cargar el bot |
| en estricto negaba el arranque tras un `npm install` legítimo, sin decir qué hacer | media | el mensaje nombra el comando exacto y qué librerías peligrosas cambiaron |

## Cómo anunciarlo

Texto corto, con las palabras que se pueden sostener:

> **Blindaje de dependencias en cinco capas.** Shin-MD fotografía su
> `node_modules` y lo compara en cada arranque: si una dependencia cambia sin
> que la hayas cambiado tú, lo dice en la consola, en `/health` y en
> `logs/seguridad-*.jsonl`. Encima hay análisis de cadena de suministro
> (registros ajenos, paquetes que nadie declaró, scripts de instalación) y de
> contenido (webhooks de exfiltración, `eval` sobre base64, dependencias que
> leen la sesión de WhatsApp). La comprobación corre **antes** de cargar el
> bot, así que en modo estricto el código sospechoso no llega a ejecutarse.
> **Es un detector de integridad y anomalías, no un antivirus**: detecta
> cambios y da evidencia, no intenciones. Reduce el riesgo; no lo elimina.

Palabras que no se usan: *inquebrantable*, *inmune*, *invulnerable*, *a prueba
de balas*. Un bot sobre WhatsApp no puede prometer ninguna de las cuatro, y
escribirlas es la forma más rápida de que te pillen en la siguiente frase.
