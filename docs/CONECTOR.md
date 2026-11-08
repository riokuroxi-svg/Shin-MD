# El conector: qué le pasa a Baileys y qué hicimos al respecto

_Investigación técnica · 6-nov-2026_
_Conector instalado: `@whiskeysockets/baileys@7.0.0-rc14` (npm `latest`)_
_Fuente: API de GitHub sobre `WhiskeySockets/Baileys` (commits, issues y PRs),
código de `node_modules/baileys` y pruebas locales._

---

## 1. Cómo se hizo esta investigación

| Qué se revisó | Volumen |
|---|---|
| Issues (todas, ordenadas por fecha) | 1 662 en total; muestra de las 100 más recientes |
| PRs fusionadas | 393; las 100 últimas |
| PRs abiertas | 46 (25 marcadas `Stale` por el propio repo) |
| Commits | los 100 últimos de `master` |
| Código instalado | `node_modules/baileys/lib`, archivo por archivo |

Cada sospecha se comprobó **en la copia instalada**, no en la documentación:
se buscó el código exacto, se reprodujo el fallo con un doble local y solo
después se escribió un parche. Lo que no se pudo probar sin un teléfono real
está marcado como tal.

> Límite honesto: en este entorno no hay un número de WhatsApp vinculado, así
> que los flujos que dependen del servidor (QR, código de 8 dígitos) se
> validan por su lógica y por la firma que espera WhatsApp, no por un
> emparejamiento real.

---

## 2. Radiografía del proyecto

```
última release .......... 7.0.0-rc14 · 29-jul-2026
commits después ......... 3 (uno de ellos, un cambio de copyright en octubre)
PRs abiertas ............ 46 · 25 marcadas Stale
issues abiertas ......... 40 de las 100 más recientes
```

Traducido: **el proyecto no está muerto, está parado**. En los últimos tres
meses no hay una sola release y el `master` apenas se movió. Hay issues que
preguntan directamente si el proyecto sigue vivo (#2877, #2871) y se cerraron
sin una respuesta que cambie nada.

La consecuencia práctica para este bot es una sola: **no se puede esperar a
que fusionen los arreglos**. La estrategia es tenerlos aquí, aislados en un
script idempotente que se puede quitar el día que la librería los incluya.

---

## 3. Mapa de incidentes por área

Leyenda: **✅ arreglado aquí** · **⚠️ nos afecta, sin arreglo** · **➖ no nos
afecta** (y por qué).

### 3.1 Vinculación: QR y código

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2737 · PR #2765 | El servidor manda `companion_reg_refresh` al caducar el QR; nadie lo maneja y la vinculación nunca cierra | PR abierta | ✅ parches 1–2 |
| #2872 | El flujo por **código** está roto por tres motivos: falta el filtro de `stage`, el nonce viaja en ASCII `'0'` y la reconexión elige el nodo de login | PR abierta (Stale) | ✅ parches 3–5 |
| #2832 | Código emitido, pero el teléfono dice «No se pudo vincular» y cierra con 401 | issue abierta | ⚠️ riesgo residual (puede ser de la cuenta, no de la librería) |
| #2886, #2684 | WhatsApp empieza a pedir **passkey** para vincular | issue abierta | ⚠️ fuera de nuestro alcance: lo decide WhatsApp |
| #2691, #2671, #2677 | 428 «Connection Terminated» antes del QR | issue abierta | ➖ usamos `Browsers.macOS("Chrome")`; el fallo es de `Desktop`/`WIN32` |
| #2757, #2736 | El QR no aparece en macOS | cerradas | ➖ mismo motivo |

### 3.2 LID y PN

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| — | Store `lid-mapping` persistente y campos `*Alt` | **ya en 7.x** | ✅ aprovechado en `#lib/lid` |
| #2652 | En `<status>` se cruzan el autor y el destinatario en la misma clave | cerrada | ✅ corregido: `parejaDeClave` empareja cada identificador con **su** alternativo |
| #2856 | Reenvío a nuestro propio dispositivo LID con destinatario equivocado | PR abierta | ➖ no reenviamos a nuestro LID; el envío cae al teléfono si falta `me.lid` |
| #2841 | Los destinatarios de un estado se resuelven con el LID antes de buscar dispositivos | PR abierta | ➖ no publicamos estados |
| #2783 | `messages.update` de una edición llega con `key.id` vacío en chats LID | cerrada | ➖ no consumimos ediciones (solo las enviamos) |
| #2742 | El bot no responde a usuarios con **nombre de usuario** de WhatsApp | issue abierta | ⚠️ vigilado: la llave cae al LID y sigue funcionando, pero no hay confirmación oficial |

### 3.3 Persistencia de sesión

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2722, #2806 | `addTransactionCapability` crea **un AsyncLocalStorage por socket** y nunca lo libera: memoria atrapada en cada reconexión | PR abierta | ✅ parche 8 |
| #2855 | `useMultiFileAuthState` escribe sin atomicidad | PR abierta | ➖ usamos SQLite con WAL (`src/core/auth.js`) |
| #2789 | Se anuncia presencia con un `creds.update` parcial | PR abierta | ⚠️ no arreglado; el síntoma es cosmético (presencia) |
| #2797, #2643 | Store de pre-keys que solo se repone al llegar a cero | cerradas | ➖ lo cubre la 7.x |

### 3.4 Recepción y envío de mensajes

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2858 · PRs #2883/#2866 | Los estados llegan como `<status>` de primer nivel y **nadie los ackea**; a los ~50 min el servidor cierra el stream | PR abierta | ✅ parche 6 |
| #2726 | El `messageTimestamp` se sobrescribe con el del recibo en el volcado offline | issue abierta | ⚠️ afecta a marcas de tiempo (cooldowns/AFK); parche grande, no aplicado |
| #2777, #2733 | Versión vieja de WhatsApp Web → bucle 408/405 | cerradas | ➖ pedimos la versión al servidor al arrancar (`fetchLatestBaileysVersion`) |
| #2875 | `extractMessageContent` revienta con mensajes basura | cerrada | ➖ sin confirmación de que aplique a nuestra copia |

### 3.5 ACK y reconexiones

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2858 | Ver 3.4: cierre de stream cada ~50 min | PR abierta | ✅ parche 6 |
| #2820, #2839 | Reenvío obsoleto tras editar/borrar; cifrado duplicado al reenviar | PRs abiertas | ⚠️ no arreglado; sintomático en chats muy activos |
| #2864 | Se mandan recibos de reintento para mensajes propios no descifrables | PR abierta | ⚠️ no arreglado |
| #2865 | El error de cierre no trae el código del WebSocket | PR abierta | ➖ cosmético; nuestro watchdog ya reconecta |
| #2810 | El buffer de eventos inicial puede quedarse colgado si `<offline>` no llega | issue abierta | ⚠️ riesgo de arranque lento; el watchdog cubre |

### 3.6 Multimedia

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2767 · PRs #2834/#2835 | La URL caducada (404/410/403) **no pide reenvío** porque el error es un `Boom` y el código está en `output.statusCode` | PR abierta | ✅ parche 7 |
| #2838, #2716 | Los errores del stream de descarga no se propagan | PR abierta | ➖ el error acaba llegando igual; solo se retrasa |
| #2700 | `ERR_OSSL_BAD_DECRYPT` intermitente | issue abierta | ⚠️ sin causa raíz conocida |
| #2644, #2687 | Reacciones y medios en canales fallan | issues abiertas | ➖ no publicamos en canales |
| #2847, #2837 | Envío de «ver una vez» | PRs abiertas | ➖ no usamos ese modo |

### 3.7 Grupos y permisos

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2808 | No se parsean los metadatos de comunidades | PR abierta | ⚠️ comunidades no soportadas (los grupos normales sí) |
| #2753 | `communityMetadata()` siempre lanza | cerrada | ➖ comunidades |
| #2884 | Tras revincular, no se recuperan las claves de remitente del grupo | issue abierta | ⚠️ solo afecta si revinculas a menudo; nuestro test de grupo lo detectaría |

### 3.8 Memoria y rendimiento

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2806 | Ver 3.3: fuga por socket | PR abierta | ✅ parche 8 |
| #2873 | Los tokens de tc se escriben dentro de la transacción del relay (más presión y bloqueos) | PR abierta | ⚠️ no arreglado |
| #2850 | Envíos masivos → cuenta restringida | issue abierta | ➖ es lo que ya combate el warm-up propio |

### 3.9 Compatibilidad con WhatsApp

| Issue / PR | Qué pasa | Estado | Nosotros |
|---|---|---|---|
| #2809 | El extractor de proto genera campos `required` en proto3 y pierde definiciones de migración LID | issue abierta | ⚠️ afecta al build del proto, no al uso de la librería publicada |
| #2882 | Actualizar la versión de WhatsApp Web | PR abierta | ➖ la pedimos en caliente |
| #2741 / #2880 | Cambio de sub-plataforma (`WIN_HYBRID`) y 428 con `Desktop` | commit en master | ➖ usamos `Chrome` |

---

## 4. Los ocho arreglos que quedaron aplicados

Todo vive en `scripts/patch-baileys.cjs`, corre en el `postinstall`, es
**idempotente** y se **auto-verifica** (`node --check` + pruebas de humo). Si
un ancla no aparece porque cambió la librería, el `npm install` falla en vez
de dejar un bot que parece sano.

| # | Arreglo | Antes | Después |
|---|---|---|---|
| 1 | Renderer del QR y rotación de la adv secret (#2765) | el QR caduca y el teléfono dice «No se pudo vincular» | se rota la secret y se re-renderiza el QR en pantalla |
| 2 | Handler de `companion_reg_refresh` | la notificación se ackea y se ignora | se atiende y se refresca el QR sin gastar refs |
| 3 | Filtro `stage === 'primary_hello'` (#2872) | `Invalid buffer` y se pierde la vinculación por código | solo se procesa la notificación con claves |
| 4 | Nonce en byte nulo (#2872) | se enviaba `'0'` (0x30) y el teléfono rechazaba el código | se envía `Buffer.alloc(1)` (0x00), como WA Web |
| 5 | Nodo de registro en la reconexión (#2872) | se mandaba el nodo de *login* y el código nunca cerraba | se detecta `!creds.registered` y se manda el de *registro* |
| 6 | Ack de `<status>` (#2858) | «Stream Errored (ack)» cada ~50 min | se ackea con `class="status"` y el stream aguanta |
| 7 | Reenvío de multimedia caducada (#2767) | 404/410/403 se quedaban sin reintento | se pide reenvío (y se añade 403 a la lista) |
| 8 | AsyncLocalStorage compartido (#2806) | una instancia por socket, memoria atrapada | una por proceso, con contexto por almacén |

### Cómo se comprobó

- **Parches 1–2:** prueba de humo del renderer (`next`/`refresh`) y de la
  rotación (una sesión ya vinculada **no** rota nada).
- **Parches 3–5:** comprobación de que el código quedó y de que `node --check`
  pasa; son caminos que solo el servidor ejercita.
- **Parche 6:** `buildAckStanza()` real produce `class="status"` para un nodo
  `<status>`; el servidor espera exactamente eso.
- **Parche 7:** servidor HTTP local que responde 404, 410 y 403 → la prueba
  verifica que **se llama** a `reuploadRequest` (sin el parche, no se llamaba;
  se comprobó revirtiéndolo: 6 pruebas en rojo).
- **Parche 8:** dos almacenes distintos, uno dentro de la transacción del otro
  → cada uno guarda lo suyo; y una transacción anidada del **mismo** almacén
  sigue reutilizando contexto.

---

## 5. Regresiones entre versiones

| Cambio | Versión | Efecto |
|---|---|---|
| Adiós `axios`, hola `fetch` (#1666) | 7.x | **regresión**: el error pasó a ser un `Boom` y la comprobación de `status` dejó de acertar → se perdió el reenvío de multimedia (#2767) |
| LID como ciudadano de primera | 7.x | **mejora**: store `lid-mapping`, `participantAlt`/`remoteJidAlt`, evento `lid-mapping.update` |
| `Browsers.macOS('Desktop')` | rc13+ | 428 antes del QR (#2671) y un cambio de plataforma en master (#2741) que no está en rc14 |
| Proto con campos `required` | generación actual | el extractor produce un proto3 inválido y pierde la migración de LID (#2809) |
| `<status>` de primer nivel | servidor, oct-2026 | comportamiento nuevo que ninguna versión maneja (#2858) |

La conclusión de esta parte: **la 7.x es mejor que la 6.7.24 para LID**, pero
introdujo al menos una regresión funcional (multimedia) y heredó dos huecos de
vinculación que ya existían.

---

## 6. Lo que sigue sin arreglar (y por qué)

| Tema | Riesgo | Decisión |
|---|---|---|
| Passkey al vincular (#2886) | alto si te toca | no hay nada que programar: lo impone WhatsApp |
| `messageTimestamp` con recibos (#2726) | bajo | el parche toca el buffer de eventos; se puede romper más de lo que arregla |
| Reenvíos duplicados/obsoletos (#2820, #2839) | bajo | solo se nota en chats muy activos |
| Claves de remitente tras revincular (#2884) | medio | se mitiga no revinculando; el bot detecta grupos que dejan de descifrar |
| `tc` tokens dentro de la transacción (#2873) | bajo | es rendimiento, no corrección |
| Proto inválido / migración LID (#2809) | bajo | afecta a quien regenere `WAProto`, no al uso |
| Usuarios con **nombre de usuario** (#2742) | medio | la capa LID debería cubrirlo; queda pendiente de un caso real |
| Comunidades (#2808) | bajo | no son el público de este bot |

Ninguno de estos se toca «por si acaso»: un parche sin reproducción es deuda
con intereses.

---

## 7. El instalador es atómico (o los ocho, o ninguno)

Un instalador que aplica siete parches y muere en el octavo es peor que uno
que no aplica ninguno: el conector queda con la mitad de los arreglos, se ve
sano y falla de formas raras. Por eso el script no escribe mientras piensa.

| Fase | Qué hace | Si algo falla |
|---|---|---|
| **1. Planificar** | aplica los ocho parches sobre una copia **en memoria** de los archivos | nada se escribió: se aborta con el disco intacto |
| **2. Validar** | parsea el contenido resultante con `node --check` (en un temporal) | nada se escribió: se aborta |
| **3. Confirmar** | escribe cada archivo a un `.tmp` y lo **renombra** (atómico) | el archivo queda nuevo o viejo, nunca truncado |
| **4. Humo** | importa los módulos y ejercita el renderer y las transacciones | se **restauran** los originales: vuelve al estado anterior |

Prueba de que funciona, con el mismo árbol roto (ancla del parche 8 cambiada):

```
SIN la corrección            CON la corrección
❌ 8. cabecera no encontrada   ❌ 8. cabecera no encontrada → no se escribió ningún archivo
socket.js .......... MODIFICADO    socket.js .......... intacto
messages-recv.js ... MODIFICADO    messages-recv.js ... intacto
messages.js ........ MODIFICADO    messages.js ........ intacto
companion-reg.js ... MODIFICADO    companion-reg.js ... intacto
```

Si el proceso se muere a mitad de la fase 3 (corte de luz), la siguiente
ejecución vuelve a planificar desde cero y converge: cada parche es
independiente e idempotente.

### Mantenimiento

```bash
node scripts/patch-baileys.cjs --check                     # ¿están los 8? no escribe
node scripts/patch-baileys.cjs                             # aplica lo que falte
node scripts/patch-baileys.cjs --lib ruta/a/baileys/lib    # sobre otra copia
npm test                                                   # incluye test/conector-parches.test.js
```

`--lib` (o la variable `SHIN_BAILEYS_LIB`) sirve para trabajar sobre una copia
en otro directorio —lo usan las pruebas para montar un Baileys prístino y
comprobar la atomicidad— y para instalaciones donde la librería no está en el
`node_modules` de siempre.

El día que la librería publique uno de estos arreglos:

1. subir la versión de `baileys` en `package.json`;
2. `node scripts/patch-baileys.cjs --check` dirá qué parches ya no aplican (el
   ancla desapareció porque el código cambió);
3. se borra ese bloque del script y su prueba.

Las pruebas de `test/conector-parches.test.js` fallan a propósito si alguien
instala una versión distinta sin revisar los parches: es la alarma, no un
estorbo.
