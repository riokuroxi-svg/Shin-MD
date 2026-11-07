# LID: cuando WhatsApp manda a la misma persona con dos nombres

_Documento técnico · 6-nov-2026_
_Verificado contra el conector instalado (`@whiskeysockets/baileys@7.0.0-rc14`),
leyendo `node_modules/baileys/lib`, y contra el tráfico real de un grupo con
direccionamiento por LID._

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

## 2. Qué cambia con Baileys 7

La versión vieja (6.7.24) entregaba la pareja en cada mensaje y **no la
guardaba en ningún sitio**: al reiniciar se perdía, y con ella la unión de
cuentas. La 7.x sí tiene memoria:

| Pieza | 6.7.24 | 7.0.0-rc14 |
|---|---|---|
| Pareja en la clave del mensaje | `senderPn` / `senderLid` / `participantPn` / `participantLid` | `remoteJidAlt` / `participantAlt` + `addressingMode` (`pn` o `lid`) |
| Parejas en los participantes del grupo | `{ id, jid, lid, admin }` | `{ id, phoneNumber, lid, admin }` |
| **Store de parejas (`lid-mapping`)** | ❌ no existe | ✅ dentro del auth state, con caché de 3 días |
| LID → teléfono | solo lo visto en RAM | **consulta local** (no toca la red) |
| Teléfono → LID | `onWhatsApp` | `getLIDForPN` (puede salir a usync) |
| LID del propio bot | `creds.me.lid` | `creds.me.lid` |
| Aviso de pareja nueva | — | evento `lid-mapping.update` |
| Envío a un JID `@lid` | funcionaba, con trampas | resuelve el dispositivo y usa `addressing_mode` del grupo |

La diferencia que importa: **la pregunta «¿de quién es este LID?» ya se puede
contestar sin red**, porque la librería persiste el mapa en `keys` bajo el tipo
`lid-mapping`. La pregunta contraria (teléfono → LID) sigue siendo la cara
cara: puede salir a internet, así que el bot solo la hace cuando se la piden a
propósito (`.lid`), nunca en el camino caliente de un mensaje.

---

## 3. Las tres piezas del bot

La capa LID vive en `src/` y no depende de la versión del conector: acepta las
claves de la 6.x y las de la 7.x, y cuando hay socket le pregunta lo que ya
sabe.

### 3.1 `src/lib/jid.js` — utilidades comunes

`normalizeJid`, `userPart`, `mxCanon` y compañía viven aquí para que la capa
LID las use sin importar `serialize.js` (que a su vez importa la capa LID: un
ciclo de imports en ESM deja exports a medio inicializar). `normalizeJid`
reconoce `@lid`, `@hosted.lid` y `@hosted`, y quita el sufijo de dispositivo,
que antes se colaba (`123:0@lid`).

### 3.2 `src/lib/lid.js` — el que se acuerda

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
2. **La pareja se aprende gratis** de donde venga: `parejaDeClave()` lee los
   campos de la 7.x (`participantAlt`, `remoteJidAlt`) y los de la 6.x
   (`senderPn`, `participantLid`), y los metadatos del grupo traen las dos
   caras juntas.
3. **Antes de rendirse, se le pregunta al conector** (`resolverConector`):
   LID → teléfono es local; si contesta, la pareja se guarda y las cuentas se
   fusionan en ese mismo instante.
4. Si aun así no aparece, la llave es el LID. Se prefiere una llave fea a
   perder el mensaje; en cuanto se aprenda la pareja, se fusionan.

`refrescarDesdeConector(key)` es el atajo que se llama en cada mensaje
entrante: si el mensaje trajo una sola cara, pregunta la otra en segundo plano
y no bloquea nada. La caché en memoria tiene tope (4096 parejas) y la
persistencia es opcional: sin backend el bot sigue funcionando, solo que sin
recordar entre reinicios.

### 3.3 `src/storage/identities.js` — la tabla y la fusión

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

## 4. Permisos: el fallo que nadie ve hasta que alguien no puede usar `.kick`

Los participantes del grupo pueden venir con LID y el mensaje con teléfono (o
al revés). Comparar cadenas a pelo da dos fallos simétricos:

- el admin real **no** es reconocido como admin;
- o peor: alguien que no lo es **sí** lo es, si hereda la cadena de otro.

`src/serialize.js` compara por las cuatro formas que entrega el conector
(`id`, `jid`, `phoneNumber`, `lid`) **y** por la pareja aprendida. Los dueños
se comparan igual (`userPart` con la regla mexicana `521 = 52` y `mismaPersona`
para el lado LID).

Y hay un detalle que sí pasaba: `msg.isOwner` solo se calculaba dentro de un
grupo. En privado salía `false`, así que los comandos que lo consultan
contestaban «solo el dueño» a quien sí lo era. Ahora se resuelve siempre.

---

## 5. Cómo comprobarlo en el teléfono (10 segundos)

```
.lid          → tu identidad: llave, teléfono, LID, pareja, conector, admin sí/no
.perfil       → tus monedas (no se duplican aunque entres por LID)
```

`.lid` en un chat privado y `.lid` en un grupo, con el mismo usuario, tienen que
mostrar **la misma llave**. La fila *Conector* dice si la pareja la sabía el
Baileys (guardada de antes) o si el bot solo la conoce por haberla visto en el
tráfico; la fila *Parejas* dice cuántas hay en memoria, en la base y si el
conector está activo.

---

## 6. Limitaciones, dichas claro

| Caso | Qué pasa | Mitigación |
|---|---|---|
| LID que nadie vio nunca | el conector tampoco lo tiene | en cuanto aparece en un mensaje o en un grupo, se aprende |
| El usuario nunca manda nada | no se aprende nada de él | se resuelve al verlo en los metadatos del grupo, que traen las dos caras |
| LID alojado (`@hosted.lid`) | tratado como LID normal | `esLid` cubre los dos dominios |
| Grupo cuyos participantes no traen teléfono | de terceros no se puede saber el PN | no hace falta: se compara por el `lid` que el grupo sí da |
| Sesión vieja sin `creds.me.lid` | el conector lanza `TypeError` al enviar a un `@lid` | el envío cae al teléfono de la misma persona (ver `src/core/socket.js`) |
| Teléfono → LID | puede salir a usync | solo desde `.lid`, nunca por cada mensaje |

---

## 7. Resumen

| | Baileys 6.7.24 | Baileys 7 + Shin-MD |
|---|---|---|
| Pareja en cada mensaje | ✅ con nombres viejos | ✅ `participantAlt` / `remoteJidAlt` |
| Persistencia de parejas | ❌ | auth state (`lid-mapping`) **+** tabla `identities` |
| LID → teléfono | solo lo cacheado en RAM | consulta local al conector + base del bot |
| Llave de la economía | el JID que llegue | una sola (teléfono cuando se conoce) |
| Admin de grupo | comparación que se rompe | 4 formas + pareja aprendida |
| Fusión de cuentas al aprender | no la hace nadie | automática |
| Diagnóstico | ninguno | `.lid` |
