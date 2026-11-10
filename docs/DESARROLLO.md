# Aprender del código: tu primer comando

Esta guía es para el que quiere **entender** cómo está hecho esto y escribir su
propio comando, no solo instalarlo. Se empieza por lo más pequeño y se sube.

---

## Índice

1. [Cómo está organizado el proyecto](#1-cómo-está-organizado-el-proyecto)
2. [Tu primer comando](#2-tu-primer-comando)
3. [Lo que te da el bot dentro de un comando](#3-lo-que-te-da-el-bot-dentro-de-un-comando)
4. [Botones, imágenes y tarjetas](#4-botones-imágenes-y-tarjetas)
5. [Guardar datos: la base de datos](#5-guardar-datos-la-base-de-datos)
6. [Migraciones: cuando cambias las tablas](#6-migraciones-cuando-cambias-las-tablas)
7. [Probar lo que escribes](#7-probar-lo-que-escribes)
8. [Las cinco reglas que no se rompen](#8-las-cinco-reglas-que-no-se-rompen)

---

## 1. Cómo está organizado el proyecto

```
Shin-MD/
├── index.js          arranca el bot
├── scripts/
│   ├── consola.mjs     lo que corre `npm start`: panel + vigilancia
│   ├── vigia.mjs       el supervisor sin panel
│   ├── supervisor.mjs  la lógica de vigilar (la comparten los dos)
│   └── datos-equipo.mjs batería, disco, memoria del aparato
├── src/
│   ├── core/           motor: socket, auth, throttler
│   ├── network/        cola de envíos y salud
│   ├── commands/       cargador de comandos y router
│   ├── storage/        base de datos y migraciones
│   ├── services/       logger, watchdog, economy…
│   └── lib/            utilidades sueltas (aquí vive casi todo):
│         vinculacion.js    a quién se vincula y quién pregunta el número
│         cli-args.js       leer --code, --menu y normalizar el teléfono
├── cmds/             LOS COMANDOS, por categoría
│   ├── main/           ping, menu, owner…
│   ├── owner/          solo el dueño: restart, compat…
│   ├── group/          administración de grupos
│   └── …               downloads, fun, games, economy…
├── test/             una prueba por cada cosa que se afirma
└── docs/             esta documentación
```

Para no perderte entre tantas carpetas hay un plano que se regenera solo:
**[MAPA.md](MAPA.md)** (`npm run mapa`). Ahí está, contado desde el repositorio,
qué hay en cada carpeta, el viaje de un mensaje de WhatsApp hasta tu comando,
para qué está cada dependencia y qué se retiró. Si añades una dependencia o una
carpeta y no la describes en `tools/mapa.mjs`, la suite lo dice: el mapa no se
queda viejo ni se queda callado.

**La idea de fondo:** `src/` es el motor y `cmds/` son los comandos. Un comando
no debería saber cómo funciona la cola anti-ban, ni el motor debería saber qué
es un comando concreto. Todo lo que se pueda sacar de un comando y poner en
`src/lib/`, va fuera: así se puede probar sin WhatsApp.

### Los atajos de importación

Casi no verás rutas del estilo `../../src/services/logger.js`. El proyecto usa
`imports` en `package.json`, así que dentro de cualquier archivo puedes escribir:

```js
import log from "#logger";                        // el logger con rotación
import { createSendQueue } from "#queue";         // la cola de envío
import { getDatabase } from "#db";                // la base SQLite
import { getUserCoins } from "#economy";          // monedas y contadores
```

Si quieres usar algo de `src/lib/` que aún no tiene atajo, o usas la ruta
relativa, o lo añades a `imports` en `package.json` (y reinicias el bot).

---

## 2. Tu primer comando

Un comando es **un archivo `.js` dentro de `cmds/`, en la categoría que le
toque**. El cargador los encuentra solo: no hay que registrarlos en ningún
sitio, y los archivos que empiezan por `_` los ignora.

Crea `cmds/utils/saludo.js`:

```js
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */

export default {
  name: "saludo",
  aliases: ["hola", "hi"],
  category: "utils",
  description: "Saluda por tu nombre",
  usage: ".saludo [nombre]",
  cooldown: 5,
  ownerOnly: false,
  groupOnly: false,
  adminOnly: false,

  async handler(sock, ctx) {
    const nombre = ctx.arg || ctx.pushName || "desconocido";
    return `Hola, ${nombre} 👋`;
  },
};
```

Reinicia el bot y escribe `.saludo`. Ya está.

### Qué significa cada campo

| Campo | Qué es |
|---|---|
| `name` | el nombre del comando, sin el punto |
| `aliases` | otros nombres que hacen lo mismo |
| `category` | la carpeta del menú: `utils`, `main`, `fun`, `downloads`… |
| `description` | lo que sale en `.menu` |
| `usage` | cómo se usa, para la ayuda |
| `cooldown` | segundos mínimos entre dos usos (0 = sin límite) |
| `ownerOnly` | solo el número del dueño (y el dueño no tiene cooldown) |
| `groupOnly` | solo en grupos |
| `adminOnly` | solo administradores del grupo |
| `botAdmin` | exige que el bot sea administrador del grupo |
| `priority` | responde sin esperar al anti-ban (para `.ping`, `.menu`) |

El orden es: **detectar prefijo y comando → cooldown → permisos → handler**. Los
permisos los comprueba el motor antes de llamarte; tú no tienes que preguntar
quién es quién.

### El valor que devuelves ES el mensaje

Fíjate en que la función **devuelve un texto** y no llama a `sendMessage`:

```js
if (typeof result === "string" && result.length > 0) {
  await sock.sendMessage(ctx.chatId, { text: result }, { quoted: msg });
}
```

Esto no es un capricho: si mandas el mensaje por tu cuenta, **te saltas el
throttler, el calentamiento y el límite diario**. Es la forma más fácil de que
te baneen el número. Devuelve texto y deja que el motor haga su trabajo.

Cuando de verdad necesitas mandar algo que no es un texto —una imagen con pie,
una reacción, dos mensajes— sí usas `sock.sendMessage`, que también pasa por la
cola:

```js
// responder citando
await sock.sendMessage(ctx.chatId, { text: "aquí está" }, { quoted: ctx.full });

// reaccionar
await sock.sendMessage(ctx.chatId, { react: { text: "🔥", key: ctx.full.key } });
```

---

## 3. Lo que te da el bot dentro de un comando

`handler(sock, ctx, engine)` recibe tres cosas. `ctx` es el contexto del
mensaje, ya resuelto:

| En `ctx` | Qué es |
|---|---|
| `ctx.chatId` | el chat donde has de responder |
| `ctx.senderId` | quién lo mandó |
| `ctx.pushName` | el nombre de quien escribe |
| `ctx.text` | el mensaje completo, con prefijo y todo |
| `ctx.arg` | lo que va después del comando, en una sola cadena |
| `ctx.args` | lo mismo, ya partido en palabras |
| `ctx.mentions` | las personas mencionadas con `@` |
| `ctx.isGroup` | si es un grupo |
| `ctx.fromMe` | si el mensaje lo mandó el propio bot |
| `ctx.full` | el mensaje crudo de WhatsApp (para citar) |
| `ctx.commandName` | el comando tal y como se escribió |
| `ctx.usedPrefix` | `.`, `/`… el prefijo que usó |

Y `engine`, para saber cómo está el bot: `engine.getSendQueue()`,
`engine.getHealth().getStatus()`, `engine.getUptime()`, `engine.getThrottler()`.

### Ejemplo con argumentos

```js
async handler(sock, ctx) {
  const [nombre, ...resto] = ctx.args;
  if (!nombre) return "Uso: .saludo <nombre>";
  return `Hola, ${nombre}. Dijiste: ${resto.join(" ") || "nada más"}`;
}
```

### Si vienes del formato viejo (Ginko)

Los comandos porteados usan `{ command, run }` y dentro de `run()` reciben un
`msg` más rico (`msg.reply()`, `msg.react()`, `msg.download()`,
`msg.pushName`…). El cargador los envuelve solo: puedes escribir en cualquiera de
los dos formatos, pero **para un comando nuevo usa `handler`**, que es el que
está pensado para esto.

---

## 4. Botones, imágenes y tarjetas

Para una tarjeta con botones está `src/lib/native-reply.js`:

```js
import { sendNativeQuickReply } from "#lib/native-reply";

await sendNativeQuickReply({
  sock,
  jid: ctx.chatId,
  title: "Mi bot",
  body: "¿Qué quieres hacer?",
  footer: "elige una opción",
  buttons: [
    { text: "Opción A", id: "opcion_a" },
    { text: "Opción B", id: "opcion_b" },
  ],
  quoted: ctx.full,
});
```

Para responder a esos botones, el texto de vuelta llega como `id`
(`opcion_a`), así que lo normal es escuchar en un hook `before` o en el router.

**Aviso honesto:** los botones son lo más frágil de WhatsApp. Si en algún
teléfono salen como "mensaje no compatible", el comando `.compat` te dice qué
tipo de mensaje es el que falla. Y por eso **todo comando con botones debe
tener un respaldo en texto**: alguien que no vea los botones tiene que poder
usarlo igual.

### El cartel «actualiza WhatsApp»

Ese cartel **no lo pone el bot**: lo pone el teléfono de quien recibe, cuando su
versión no sabe dibujar lo que le llegó. Enviar y poder leerlo son cosas
distintas, así que en el registro del bot no aparece ningún error.

Hay dos cosas que sí dependen de nosotros:

1. **El nodo `biz` tiene que ir completo.** Ese nodo es la pista que le dice al
   teléfono con qué camino dibujar el mensaje. Lo arma `#lib/wa-nodes`, y si la
   librería instalada trae su propio constructor (`getBizBinaryNode`) se usa el
   suyo; el respaldo escrito a mano lleva `decision_id` (20 bytes en
   hexadecimal) y `<decision_source value="df"/>`, igual que el cliente oficial.
   Ojo: un nodo nuestro **sustituye** al de la librería (ella no pone dos), así
   que si el nuestro se queda corto el mensaje sale peor que sin él.
2. **El formato de la tarjeta.** Con `BOTONES_FORMATO=plantilla` en el entorno,
   la tarjeta se manda dentro de un mensaje de plantilla
   (`templateMessage.interactiveMessageTemplate`), que es el envoltorio que los
   WhatsApp viejos sí entienden: se ve más sobrio, pero no sale el cartel. Sin
   la variable se manda el formato moderno, que es el más bonito y el que
   entienden los clientes al día.

---

## 5. Guardar datos: la base de datos

La base es SQLite (`data/shin.db`) y hay dos formas de tocarla. **Usa la primera
siempre que exista la función**: está probada y respeta el LID.

Para lo de todos los días hay funciones hechas:

```js
import { getUserCoins, updateUserCoins } from "#economy";
import { getDatabase } from "#db";

const yo = getUserCoins(ctx.senderId);        // { coins, bank, health, ... }
const ahora = updateUserCoins(ctx.senderId, 100); // suma 100 y devuelve el total

// ajustes del bot (clave → valor, se guarda como JSON)
const db = getDatabase();
db.settings.set("bienvenida", "hola");
const valor = db.settings.get("bienvenida");
```

Y si de verdad hace falta una consulta propia, `getDatabase().db.prepare(...)`
es el SQLite de Node (`node:sqlite`), con `get()`, `all()` y `run()`:

```js
const filas = getDatabase().db
  .prepare("SELECT jid, coins FROM users ORDER BY coins DESC LIMIT 10")
  .all();
```

Los comandos porteados de Ginko tienen su propia API con tablas `g_`
(`g_users`, `g_chats`, `g_settings`…), en `src/services/ginko-db.js`:
`getChatUser(chatId, userId)`, `setChatUser(chatId, userId, "coins", 100)`,
`getSettings(id)`, `setSettings(id, "namebot", "TuBot")`.

Si necesitas una tabla nueva, **no la crees en el comando**. Se hace con una
migración (siguiente apartado). Una tabla creada a mano en un comando no existe
en la instalación de los demás, y ahí empiezan los fallos que solo pasan "en el
teléfono de otro".

---

## 6. Migraciones: cuando cambias las tablas

Una migración es un paso **numerado** que se aplica una sola vez, en orden, en
todas las instalaciones. Viven en `src/storage/migrations.js`, en una lista:

```js
export const MIGRATIONS = [
  { version: 1, name: "core-tables", up(db) { /* … */ } },
  { version: 2, name: "economy-gacha-profiles", up(db) { /* … */ } },
  { version: 3, name: "users-numerico", up(db) { /* … */ } },
];
```

### Añadir una

Si la última es la 3, la tuya es la 4. **Nunca cambies una que ya existe**: en
las instalaciones de los demás ya se aplicó, y no se va a volver a ejecutar. Un
cambio sobre una migración vieja llega solo a las instalaciones nuevas.

```js
export const MIGRATIONS = [
  // …
  {
    version: 4,
    name: "recordatorios",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_jid  TEXT NOT NULL,
          text      TEXT NOT NULL,
          due_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at);
      `);
    },
  },
];
```

Se aplica sola al arrancar (`src/storage/database.js` las recorre en orden).

**Un caso real, para que se entienda por qué importa el tipo.** La migración 2
añadía `coins` como `TEXT DEFAULT ''` y tres líneas después intentaba añadirla
como `INTEGER`. La primera ganaba, la segunda no hacía nada (la columna ya
existía) y el saldo se guardaba como el texto `"250.0"`. Al sumarle `-50` daba
`NaN` y se escribía `NULL`: las monedas desaparecían solas. Ninguna prueba lo
veía porque nadie había probado esa función. La migración 3 arregla las bases
que ya nacieron mal, y `test/economia.test.js` vigila que no vuelva a pasar.

### Reglas para no romperle la base a nadie

1. **`IF NOT EXISTS` siempre.** Una migración tiene que poder correr en una base
   donde esa tabla ya existe por alguna razón.
2. **Lo normal es añadir columnas, no recrear tablas.** SQLite no tiene
   `ADD COLUMN IF NOT EXISTS`, así que se usa `ejecutarSqlOpcional` (mira la
   migración 2).
3. **Si hay que cambiar el TIPO de una columna, se recrea la tabla** dentro de
   una transacción y se copia con `CAST`: es lo que hace la migración 3. Y se
   comprueba que el número de filas de antes y de después coincide; si no, se
   hace `ROLLBACK` y la base se queda como estaba.
4. **Nunca borres datos de los demás.** Si hay que cambiar de forma, se copia a
   la nueva antes de tirar la vieja.
5. **Numera sin saltos y sin repetir.** Si dos personas del equipo usan la 4,
   la base se queda con una y la otra se pierde.

---

## 7. Probar lo que escribes

```bash
npm test            # toda la suite
npm test -- saludo  # solo los archivos de prueba con "saludo" en el nombre
npm run lint        # estilo
npm run typecheck   # tipos con JSDoc
```

Para sacar una versión no hay que encadenar nada a mano: `npm run publicar`
hace la firma, la suite, la documentación, el commit, la etiqueta, el push y la
release en el orden correcto. Está contado en **[FORK.md](FORK.md#6-publicar-tu-primera-versión)**.

Una prueba nueva va en `test/` y suele ser tan corta como esto:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import saludo from "../cmds/utils/saludo.js";

test("saluda con el nombre de quien escribe", async () => {
  const texto = await saludo.handler({}, { pushName: "Ana", arg: "" }, {});
  assert.match(texto, /Ana/);
});
```

La prueba **no necesita WhatsApp**. Eso es justo lo que se busca al sacar la
lógica del comando: si para probar algo hace falta un teléfono, está mal
organizado.

**Prueba el proceso entero, no la pieza suelta.** Que `saludo()` devuelva el
texto no demuestra que el comando funcione: demuestra que una función
devuelve un texto. Las pruebas de este proyecto siguen el camino completo —
entrada, decisión, salida — y cuando se puede, arrancan el proceso de verdad
(en `test/consola.test.js` se usa una terminal real; en `test/vigia.test.js` se
arrancan procesos hijos).

---

## 8. Las cinco reglas que no se rompen

Son las que han costado fallos de verdad. Si las respetas, tu comando encaja.

1. **Devuelve texto; no mandes por tu cuenta.** Si llamas a `sendMessage` a
   pelo te saltas el anti-ban.

2. **Un `return` de error no es un error.** Devuelve un mensaje claro al usuario
   en vez de lanzar una excepción que acaba en el log que nadie lee.

3. **Nunca borres archivos de otros sin comprobar la ruta.** Toda la lógica de
   borrado pasa por `borrar_arbol` en `install.sh`, que rechaza `/`, `$HOME` y
   las rutas de sistema.

4. **Todo archivo nuevo lleva su encabezado SPDX.** `npm test` lo comprueba.

5. **Si afirmas algo, que haya una prueba que lo demuestre.** Este proyecto no
   dice "soporta X" sin un archivo en `test/` que lo compruebe. Si no sabes si
   algo funciona, se dice **pendiente**. No se maquilla.

---

## Para seguir aprendiendo

| Archivo | Qué enseña |
|---|---|
| `src/network/queue.js` | cómo se manda sin que te baneen: cola, throttler, reintentos, estado incierto |
| `src/core/engine/throttler.js` | jitter gaussiano y calentamiento diario |
| `src/services/watchdog.js` | cómo se detecta una conexión zombi |
| `scripts/supervisor.mjs` | cómo se levanta un proceso que se cae |
| `scripts/consola.mjs` | cómo se dibuja una interfaz en una terminal sin romperla |
| `test/cola-incierta.test.js` | cómo se prueba un caso raro contando llamadas reales |
