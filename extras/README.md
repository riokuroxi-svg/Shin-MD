# `extras/` — piezas sueltas

Módulo auxiliar autónomo del repositorio. Las utilidades activas de mensajería y
anti-ban del bot viven directamente en `src/lib/`, `src/core/`, `src/network/` y
`src/services/watchdog.js`.

## Archivos

| Archivo | Qué trae |
|---|---|
| `actualizar.js` | Actualizar el código sin perder lo que había a medias: mira el árbol, guarda un parche en `tmp/`, pide confirmación de 5 minutos y conserva la base de datos. Lo usa `.fix` / `.update` |

## Actualizar sin perder trabajo (`actualizar.js`)

```js
import { actualizar, confirmacionVigente } from "../extras/actualizar.js";

const confirmado = confirmacionVigente(pedidoGuardado);   // ¿repitió el comando hace <5 min?
const r = await actualizar({ raiz: "/ruta/del/bot", prefijo: ".", comando: "fix", confirmado });
```

Comprobado con 8 pruebas de `actualizar.js` en `test/extras-actualizar.test.js`
con repositorios simulados (árbol limpio, commit nuevo, cambios sin subir,
confirmación, base de datos protegida, archivo nuevo, remoto caído y caducidad
de los 5 minutos).

---

<sub>Escrito y mantenido por **[riokuroxi-svg](https://github.com/riokuroxi-svg)** · Shin-MD · AGPL-3.0-only.</sub>
