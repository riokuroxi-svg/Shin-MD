# LID: cuando WhatsApp manda a la misma persona con dos nombres

_Documento técnico · 6-nov-2026_
_Verificado contra el Baileys instalado (`@whiskeysockets/baileys@6.7.24`) y
contra el tráfico real de un grupo con direccionamiento por LID._

---

## 1. Qué es un LID

WhatsApp dejó de mandar siempre el teléfono. Hoy el mismo usuario puede
aparecer con dos identificadores:

```
5215512345678@s.whatsapp.net   ← PN   (Phone Number, el de siempre)
123456789012345@lid            ← LID  (identificador interno, sin teléfono)
```

No son dos usuarios: es **la misma persona**. Si el bot los trata como dos,
pasan tres cosas, y las tres se ven en el chat:

| Síntoma | Por qué |
|---|---|
| Dos carteras de monedas, dos XP | la economía guarda por JID y el JID cambia |
| «Solo el dueño puede usar esto» a ti | se compara el número y llegó un LID |
| «Solo administradores» dentro de tu propio grupo | el participante del grupo viene como LID y el mensaje como teléfono (o al revés) |

---

## 2. La limitación que no se puede saltar

**La red resuelve en un solo sentido: teléfono → LID.**

- Preguntar «¿cuál es el LID de este teléfono?» → sí (`onWhatsApp` de Baileys,
  que internamente usa el protocolo LID de usync).
- Preguntar «¿cuál es el teléfono de este LID?» → **no existe esa consulta**.
  Solo se puede contestar con las parejas que ya se vieron antes.

Por eso el trabajo real no es «resolver», es **acordarse**: quien no guarda
las parejas que ve, no las puede resolver nunca.

---

## 3. Lo que Baileys 6.7.24 sí y no trae

Revisado en `node_modules/baileys/lib`, no en la documentación:

| Pieza | Estado en 6.7.24 | Dónde |
|---|---|---|
| LID en la clave del mensaje | ✅ `key.senderLid`, `key.senderPn`, `key.participantLid`, `key.participantPn` | `Utils/decode-wa-message.js` |
| LID en los participantes del grupo | ✅ `{ id, jid, lid, admin }` (en grupos por LID, `id` es el LID y `jid` el teléfono) | `Socket/groups.js` |
| Envío a un JID `@lid` | ✅ `relayMessage` distingue `server === 'lid'` | `Socket/messages-send.js` |
| LID del propio bot | ✅ se guarda en `creds.me.lid` con el nodo `success` | `Socket/socket.js` |
| Aviso de pareja | ✅ evento `chats.phoneNumberShare` `{ lid, jid }` | `Socket/messages-recv.js` |
| **Store de parejas (`lid-mapping`)** | ❌ **no existe**. `SignalDataTypeMap` no tiene esa clave, así que nada de esto se persiste | `Types/Auth.d.ts` |
| Migración de historial con parejas | ❌ el proto trae `phoneNumberToLidMappings`, pero esta versión no lo procesa | `WAProto` |

Traducido: la librería **te da la pareja en cada mensaje**, pero **no la
guarda**. Al reiniciar, se pierde. Y con ella se pierde la unión de cuentas.

---

## 4. Lo que añade este repositorio

Tres piezas, de abajo arriba.

### 4.1 `src/lib/jid.js` — utilidades comunes

`normalizeJid`, `userPart`, `mxCanon` y compañía viven aquí para que la capa
LID las use sin importar `serialize.js` (que a su vez importa la capa LID: un
ciclo de imports en ESM deja exports a medio inicializar). `normalizeJid`
reconoce `@lid` y `@hosted.lid` y les quita el sufijo de dispositivo, que antes
se colaba (`123:0@lid`).

### 4.2 `src/lib/lid.js` — el que se acuerda

Una sola pregunta para todo el bot: *¿quién es este JID?*

```js
import * as lid from "#lib/lid";

const id = lid.resolver("123456789012345@lid", "5215574370309@s.whatsapp.net");
id.key // llave estable para la base: el teléfono si se conoce
id.pn  // teléfono ("" si aún no se sabe)
id.lid // identificador interno ("" si WhatsApp no lo dio)
```

Reglas:

1. **La llave es el teléfono siempre que se conozca.** Los datos del bot
   guardados hasta hoy siguen cuadrando.
2. **La pareja se aprende gratis**: viaja en la propia clave del mensaje
   (`participantPn` / `participantLid`) y en los metadatos del grupo.
3. Si solo viene como LID, se busca en memoria y luego en la base del bot.
   **Nunca se consulta la red**: esa consulta no existe.
4. Si aun así no aparece, la llave es el LID. Se prefiere una llave fea a
   perder el mensaje; en cuanto se aprenda la pareja, se fusionan.

La caché en memoria tiene tope (4096 parejas) y la persistencia es opcional:
quien no conecte un backend sigue funcionando, solo que sin recordar entre
reinicios.

### 4.3 `src/storage/identities.js` — la tabla y la fusión

```sql
CREATE TABLE identities (
  lid        TEXT PRIMARY KEY,
  pn         TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Se conecta al arrancar (`boot/index.js`) y guarda cada pareja nueva. Además,
cuando una pareja es nueva, **fusiona las cuentas** que pudieran existir por
separado:

| Tabla | Qué hace |
|---|---|
| `g_chat_users` | mueve la fila del LID a la del teléfono; si ya existía, suma `coins` y `bank`, conserva el `lastdaily` **más reciente** (nadie reclama dos veces) y une inventario, armas, herramientas, avisos y personajes |
| `g_users` | suma XP y comandos usados; conserva la racha y el premio global más reciente |
| `users` | suma monedas, banco y XP; mueve el perfil |
| `economy_timers` | recorre la clave `chat:usuario` y deja el enfriamiento más reciente |
| `user_characters` | mueve los personajes reclamados sin duplicar |
| `group_warns` | reapunta los avisos al teléfono |

Ninguna fusión puede tumbar el mensaje: cada tabla va en su propio `try` y, si
la base es vieja y no tiene esa tabla, se salta y se sigue.

---

## 5. Permisos: el fallo que nadie ve hasta que alguien no puede usar `.kick`

Los participantes del grupo pueden venir con LID y el mensaje con teléfono (o
al revés). Comparar cadenas a pelo da dos fallos simétricos:

- el admin real **no** es reconocido como admin;
- o peor: alguien que no lo es **sí** lo es, si hereda la cadena de otro.

`src/serialize.js` compara por las cuatro formas que entrega Baileys
(`id`, `jid`, `phoneNumber`, `lid`) **y** por la pareja aprendida. Los dueños
se comparan igual (`userPart` con la regla mexicana `521 = 52` y `mismaPersona`
para el lado LID).

Y hay un detalle que sí pasaba: `msg.isOwner` solo se calculaba dentro de un
grupo. En privado salía `false`, así que los comandos que lo consultan
contestaban «solo el dueño» a quien sí lo era. Ahora se resuelve siempre.

---

## 6. Cómo comprobarlo en el teléfono (10 segundos)

```
.lid          → tu identidad: llave, teléfono, LID, pareja aprendida, admin sí/no
.perfil       → tus monedas (no se duplican aunque entres por LID)
```

`.lid` en un chat privado y `.lid` en un grupo, con el mismo usuario, tienen que
mostrar **la misma llave**. Si en un grupo sale la llave del LID y en privado el
teléfono, es que todavía no se había visto esa pareja: en cuanto llegue un
mensaje con el identificador alternativo se completa sola y las cuentas se
fusionan.

---

## 7. Limitaciones, dichas claro

| Caso | Qué pasa | Mitigación |
|---|---|---|
| LID que nunca se vio | la llave es el LID (`…@lid`) | en cuanto aparece en un mensaje con alternativo, se completa y se fusiona |
| El usuario nunca manda nada | no se aprende nada de él | se resuelve al verlo en los metadatos del grupo, que traen las dos caras |
| LID alojado (`@hosted.lid`) | tratado como LID normal | `esLid` cubre los dos dominios |
| Grupo con participantes sin teléfono | de terceros no se puede saber el PN | no hace falta: se compara por el `lid` que el grupo sí da |
| Sesión vieja sin `creds.me.lid` | Baileys lanza `TypeError` al enviar a un `@lid` | el envío cae al teléfono de la misma persona (ver `src/core/socket.js`) |

---

## 8. Resumen

| | Baileys 6.7.24 solo | Shin-MD |
|---|---|---|
| Pareja en cada mensaje | ✅ | ✅ |
| Persistencia de parejas | ❌ | tabla `identities` |
| LID → teléfono | solo lo cacheado en RAM | solo lo cacheado **+** base del bot |
| Llave de la economía | el JID que llegue | una sola (teléfono cuando se conoce) |
| Admin de grupo | comparación que se rompe | 4 formas + pareja aprendida |
| Fusión de cuentas al aprender | no la hace nadie | automática |
| Diagnóstico | ninguno | `.lid` |
