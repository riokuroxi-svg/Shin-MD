# `extras/` — piezas sueltas, listas para usar

Aquí van módulos **autónomos** (no tocan el motor ni el router) que sirven para
cuatro cosas concretas: mandar mensajes interactivos, mandar álbumes, frenar los
envíos y pintar el menú con sus símbolos. No duplican nada de `src/`: si ya usas
`#lib/native-reply`, `#lib/album` o la cola de `src/network/queue.js`, esto es la
versión de consulta (y en el caso del menú, algo que todavía no hay).

Todo se puede usar sin cambiar nada del bot: son funciones puras o que reciben
el `sock` que ya tienes.

## Archivos

| Archivo | Qué trae |
|---|---|
| `botones.js` | Botones nativos: `rapido`, `copiar`, `enlace`, `llamar`, `recordar`, `ubicacion`, `webview`, `lista` (desplegable), `paramsHoja` (más de 3 botones), `enviarConBotones`, `respaldo` (texto), `botonPulsado`, `botonesActivos` |
| `wa-nodes.js` | Los nodos binarios que WhatsApp exige alrededor de un interactivo (`biz → interactive → native_flow` + `quality_control`, y `bot` en privados) |
| `album.js` | Álbumes: varias fotos en una sola tarjeta (`albumMessage` + `messageAssociation`), con la lista revisada antes de gastar envíos |
| `antiban.js` | Freno de envíos: limitador con espera variable, calentamiento diario guardable en la base, cola única, salud (riesgo 0–100) y vigilante |
| `menu-ayuda.js` | Leyenda `Ⓓ Ⓟ Ⓐ Ⓖ Ⓛ`, crédito del menú y `marcar()`, que pone la marca delante de cada comando **leyendo los flags del comando** (sin listas a mano) |
| `actualizar.js` | Actualizar el código sin perder lo que había a medias: mira el árbol, guarda un parche en `tmp/`, pide confirmación de 5 minutos y conserva la base de datos. Lo usa `.fix` |

## Ejemplos

```js
import { enviarConBotones, rapido, lista } from "../extras/botones.js";

await enviarConBotones(sock, jid, {
  texto: "Selecciona una categoría",
  pie: "Shin-MD",
  botones: [
    lista("Explorar categorías", [
      { title: "Comandos", rows: [{ id: "menu economia", title: "Economía" }] },
    ]),
    rapido("Categorías (.menucat)", "menucat"),
    rapido("Ver todo", "allmenu"),
  ],
  cita: msg,
});
```

```js
import { planAlbum, sendAlbum } from "../extras/album.js";

const r = await sendAlbum(sock, jid, [
  { image: "https://…/1.jpg", caption: "primera" },
  { image: buffer, caption: "segunda" },
], { quoted: msg });
if (!r.sent) await sock.sendMessage(jid, { text: "no pude mandar el álbum" });
```

```js
import { marcar } from "../extras/menu-ayuda.js";

// comandos = Map(nombre → plugin) del cargador de siempre
texto = marcar(texto, prefix, comandos);
```

## Actualizar sin perder trabajo (`actualizar.js`)

`.fix` / `.update` ya lo usan, pero el módulo también sirve desde un script:

```js
import { actualizar, confirmacionVigente } from "../extras/actualizar.js";

const confirmado = confirmacionVigente(pedidoGuardado);   // ¿repitió el comando hace <5 min?
const r = await actualizar({ raiz: "/ruta/del/bot", prefijo: ".", comando: "fix", confirmado });

if (r.estado === "espera") {
  // r.texto ya es el aviso listo para enviar; guarda Date.now() como «pedido»
} else if (r.estado === "actualizado" || r.estado === "alDia") {
  // r.texto: "abc1234 → def5678" (o «ya estaba al día»), r.datos: qué se conservó
}
```

Qué garantiza, y por qué no es un `git pull` a secas:

1. **Mira antes de tocar.** Si hay trabajo sin subir, guarda un parche en
   `tmp/parche-<fecha>.patch` y no hace nada hasta que el dueño repita el
   comando dentro de los 5 minutos.
2. **`data/shin.db.json` está versionado.** Un `git reset --hard` a secas
   devolvería la base de datos a la del repositorio y se llevaría por delante a
   los usuarios del bot. Aquí se lee antes y se reescribe después; además no
   cuenta como «cambio sin subir», así que `.fix` no avisa por algo que cambia
   solo.
3. **Los archivos nuevos (`??`) no se borran** con el reset: se quedan donde
   están. El aviso lo dice, porque un parche no los incluye.
4. **Si el remoto falla**, el aviso es explícito y el código no se toca.

## Tres cosas que se aprendieron y están puestas aquí

1. **Nada de envolver el interactivo en `viewOnceMessage`.** Es de 2022 y es lo
   que deja los botones grises o invisibles en WhatsApp Web.
2. **Sin los nodos binarios**, el servidor acepta el mensaje y el teléfono lo
   tira sin pintar nada: ni error, ni aviso.
3. **WhatsApp solo dibuja tres botones.** El cuarto y siguientes se pierden en
   silencio salvo que se pida la hoja inferior (`paramsHoja`).

## Interruptores (variables de entorno)

| Variable | Efecto |
|---|---|
| `BOTONES=off` | Todo sale como texto con las opciones escritas |
| `BOTONES_VIEWONCE=1` | Recupera el envoltorio viejo (por si en algún teléfono se ve mejor) |
| `ANTIBAN=off` | El limitador no espera entre envíos |
| `ANTIBAN_BASE_MS` · `ANTIBAN_MIN_MS` · `ANTIBAN_MAX_MS` | Ritmo de los envíos |
| `WARMUP_START_MSGS` · `WARMUP_MAX_MSGS` · `WARMUP_DAYS` | Calentamiento diario |

## Comprobado

`node --check` en los seis archivos, 7 comprobaciones de los módulos de envío
(álbum, botones, hoja inferior, respaldo en texto, nodos binarios, limitador,
salud y marcas del menú) contra el cliente instalado, y 8 pruebas de
`actualizar.js` en `test/extras-actualizar.test.js` con repositorios de mentira
(árbol limpio, commit nuevo, cambios sin subir, confirmación, base de datos
protegida, archivo nuevo, remoto caído y caducidad de los 5 minutos). Todo en
verde. No se ha probado el envío real a una cuenta de WhatsApp.
