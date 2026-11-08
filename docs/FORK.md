# Hacer tu propio fork de Shin-MD

Esta guía es para coger este proyecto y publicar **tu versión**, con tu nombre,
tu repositorio y tu instalador. No hace falta ser experto: son cambios
concretos, en archivos concretos, y al final hay una lista de comprobación.

---

## Índice

1. [Antes de tocar nada: la licencia](#1-antes-de-tocar-nada-la-licencia)
2. [Crear tu repositorio](#2-crear-tu-repositorio)
3. [Cambiar el nombre y el autor](#3-cambiar-el-nombre-y-el-autor)
4. [Tu instalador](#4-tu-instalador)
5. [Tus imágenes y tu README](#5-tus-imágenes-y-tu-readme)
6. [Publicar tu primera versión](#6-publicar-tu-primera-versión)
7. [Lista de comprobación](#7-lista-de-comprobación)

---

## 1. Antes de tocar nada: la licencia

Shin-MD es **AGPL-3.0-only**. Eso significa, en corto:

| Puedes | Tienes que |
|---|---|
| Usarlo para lo que quieras | Mantener el aviso de licencia y el crédito del autor original |
| Modificarlo | Publicar tu código modificado bajo AGPL también |
| Publicar tu versión | Decir que está basado en Shin-MD y quién lo hizo |
| Cobrar por instalarlo o mantenerlo | No quitarle a nadie el derecho a ver el código |

Lo que **no** puedes: coger el código, cambiarle el nombre, cerrarlo y venderlo
como si fuera tuyo. Eso es lo que la AGPL impide.

### El crédito no se borra

El proyecto tiene una prueba automática que lo vigila. Cada archivo de código
lleva este encabezado:

```js
/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
```

En tu fork **puedes añadir tu línea**, pero no quitar la original:

```js
/**
 * TuBot - https://github.com/tu-usuario/TuBot
 * Basado en Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * Copyright (C) 2026 tu-usuario
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```

Es lo que hace cualquier proyecto que parte de otro: Debian cita a GNU, Ubuntu
cita a Debian. Tú no estás "regalando" nada: estás reconociendo de dónde salió,
que es justo lo que hace que un proyecto sea creíble.

El archivo `test/licencia.test.js` comprueba que **todos** los archivos de
`src/`, `cmds/`, `boot/`, `scripts/` y `test/` tengan `SPDX-License-Identifier:
AGPL-3.0-only`. Si añades archivos sin encabezado, la suite falla antes de
subirlo.

Para ponerlo en todos de una vez:

```bash
node scripts/add-spdx-headers.cjs
```

Y para cambiar el texto que escribe, edita la constante `HEADER` al principio
de `scripts/add-spdx-headers.cjs`.

---

## 2. Crear tu repositorio

1. En GitHub: **Fork** sobre `riokuroxi-svg/Shin-MD`. Te queda una copia tuya.
2. Cámbiale el nombre si quieres (Settings → Rename).
3. Clónalo:

```bash
git clone https://github.com/TU-USUARIO/TU-REPO.git
cd TU-REPO
npm install
npm test
```

`npm test` tiene que dar verde **antes** de que toques nada. Si no da verde en
tu fork, el problema no es tuyo y hay que resolverlo primero.

---

## 3. Cambiar el nombre y el autor

El nombre aparece en más sitios de los que parece. Esta es la lista completa:

| Archivo | Qué cambiar |
|---|---|
| `package.json` | `name`, `description`, `author`, `repository` |
| `install.sh` | `NOMBRE="Shin-MD"` (línea ~39) y `REPO_URL` (línea ~35) |
| `scripts/add-spdx-headers.cjs` | la constante `HEADER` |
| `boot/index.js` | el banner de arranque (busca `Shin-MD`) |
| `cmds/main/menu.js` | el pie del menú de WhatsApp |
| `src/lib/theme.js` | el objeto `BRAND`: nombre, kanji 反魂, marca `❦` y el pie que firma **todos** los mensajes |
| `src/web/server.js` | el nombre que aparece en el panel web |
| `docs/assets/datos.json` | `comandos`, `pruebas`… los números del README |
| `tools/build_pastel.py` | el texto que sale dibujado en las imágenes (nombre, kanji, frases) |
| `README.md` | títulos, insignias y créditos |

> El kanji **反魂** y el nombre *Shin-MD* son la marca del proyecto original y
> **no se heredan** (está en el `NOTICE`). En tu fork cámbialos: `BRAND.kanji`,
> `BRAND.mark` y `BRAND.footer` en `src/lib/theme.js`. Con eso desaparecen del
> pie de todos los mensajes de golpe.

Y el nombre que ve el usuario en WhatsApp **no** está en el código: está en la
base de datos, en la tabla `g_settings`. Se cambia sin tocar nada, desde el
propio bot y siendo el dueño:

```
.setbotname TuBot / TuBot-MD
```

El primero es el nombre corto (sin espacios) y el segundo el largo. Eso escribe
`namebot` y `botname` en `g_settings`. Si prefieres hacerlo con el bot parado,
es un `UPDATE` sobre `data/shin.db`:

```bash
sqlite3 data/shin.db "UPDATE g_settings SET namebot='TuBot', botname='TuBot-MD', owner='521...@s.whatsapp.net';"
```

(El `owner` va como JID completo: número con `@s.whatsapp.net`.)

Para encontrar lo que te falte:

```bash
grep -rn "Shin-MD" --include="*.js" --include="*.json" --include="*.md" . | grep -v node_modules
```

---

## 4. Tu instalador

`install.sh` está pensado para que solo cambies **dos líneas**:

```bash
readonly REPO_URL="${SHIN_REPO_URL:-https://github.com/riokuroxi-svg/Shin-MD.git}"
readonly NOMBRE="Shin-MD"
```

Cámbialas por las tuyas:

```bash
readonly REPO_URL="${SHIN_REPO_URL:-https://github.com/TU-USUARIO/TU-REPO.git}"
readonly NOMBRE="TuBot"
```

Con eso, el instalador ya descarga **tu** repositorio y lo instala en
`~/TuBot`.

### Las URL de las instrucciones

Arriba en el archivo, y en el resumen final, hay URL escritas a mano. Cámbialas:

```bash
grep -n "raw.githubusercontent.com" install.sh
grep -rn "raw.githubusercontent.com" README.md docs/*.md
```

### La huella (SHA256SUMS)

El instalador se publica junto a su huella para que nadie pueda darte un archivo
cambiado. **Cada vez que toques `install.sh`**, vuelve a firmarlo:

```bash
node scripts/firma-instalador.mjs        # escribe SHA256SUMS
node scripts/firma-instalador.mjs --check # verifica sin escribir
```

Si te olvidas, la prueba `SHA256SUMS publicado coincide con install.sh` falla y
te avisa. Es a propósito: una firma desactualizada es peor que no tener firma,
porque la gente confía en ella.

### Las opciones que ya existen

No hay que tocar nada para que funcionen, pero conviene saber qué hay:

| Opción | Qué hace |
|---|---|
| `--dir RUTA` | instala en otra carpeta |
| `--version TAG` | instala o pasa a una versión concreta |
| `--branch RAMA` | sigue esa rama en vez de `main` |
| `--update` | actualiza sin tocar `.env`, `Sessions/` ni `data/` |
| `--repair` | reconstruye dependencias |
| `--verify` | comprueba sin tocar |
| `--uninstall` | desinstala guardando los datos |
| `--uninstall --purge` | borra todo (pregunta dos veces) |
| `--yes` | no pregunta nada |
| `--shallow` | clon rápido, sin historial |

La regla de oro que **no debes romper**: `--update`, `--repair` y `--uninstall`
nunca borran los datos. Toda la lógica de borrado pasa por una sola función
(`borrar_arbol`) que rechaza `/`, `$HOME` y las rutas de sistema, y comprueba la
ruta dos veces antes de actuar. Si añades código que borre algo, úsala.

---

## 5. Tus imágenes y tu README

El README de este proyecto tiene mucho dibujo: las secciones 01 a 09, las
insignias y el pie son SVG generados. Salen de dos archivos:

- `docs/assets/datos.json` — **los números** (comandos, pruebas, versión).
- `tools/build_pastel.py` — **qué dice cada tarjeta** y cómo se compone.
- `tools/pastel_lienzo.py` — **el lienzo**: tipografías, colores y formas.

```bash
python3 -m pip install fonttools cairosvg pillow   # la primera vez
npm run docs:pastel                                # o: python3 tools/build_pastel.py
```

El nombre y el kanji que salen dibujados están escritos dentro de
`tools/build_pastel.py` (busca `Shin-MD` y `反魂`): cámbialos ahí y vuelve a
generar, o **borra las líneas `<img …>` del README** y quédate con texto. Las
dos cosas son válidas.

Si no quieres dibujos, no pasa nada: el README funciona sin ellos. Pero **los
comandos de instalación tienen que estar en texto**, no dentro de una imagen.
Alguien que lee tu README desde el teléfono no va a transcribir a mano lo que
ve en un dibujo.

Esta es la regla: **todo lo que el usuario tenga que copiar va en un bloque de
código**. Las imágenes son para adornar, nunca para instruir.

---

## 6. Publicar tu primera versión

El orden **importa**: `docs/web` y las imágenes se generan con lo que diga el
repositorio en ese momento, y el instalador se firma al final. Si lo haces al
revés, publicas una huella que corresponde a otro archivo:

```bash
# 1. versión nueva en package.json, package-lock.json y docs/assets/datos.json
# 2. la suite en verde
npm test

# 3. regenerar la web y las imágenes con los números reales
npm run docs:web
npm run docs:pastel

# 4. firmar el instalador
node scripts/firma-instalador.mjs

# 5. volver a pasar la suite
npm test

# 6. publicar
git add -A
git commit -m "feat: tu cambio"
git tag -a v1.0.0 -m "TuBot 1.0.0"
git push origin main --tags
```

Del paso 3, la suite vigila tres cosas de verdad: que `docs/web/index.html`
tenga **exactamente** los comandos que carga el bot, que la página y el README
anuncien **el mismo** número de pruebas, y que el número de archivos de prueba
sea el real. Si añades un comando o una prueba y olvidas regenerar, el test
falla y te lo dice antes de publicar.

Lo que **no** comprueba nadie son las cifras que llevan las imágenes
(`docs/assets/datos.json`): si te olvidas de regenerarlas, el dibujo enseña una
cifra vieja y no hay aviso. Revísalo a mano.

Tu instalador quedará accesible en:

```
https://raw.githubusercontent.com/TU-USUARIO/TU-REPO/v1.0.0/install.sh
```

Pon **la etiqueta** en la URL, no `main`. Así quien instale recibe exactamente
lo que probaste, y no lo que subas mañana a medias.

---

## 7. Lista de comprobación

Antes de decir "mi versión está lista":

- [ ] `npm test` en verde.
- [ ] Cambiaste `REPO_URL` y `NOMBRE` en `install.sh`.
- [ ] Volviste a firmar con `node scripts/firma-instalador.mjs`.
- [ ] Los encabezados llevan **tu** copyright **y el original**.
- [ ] El README dice de dónde viene el proyecto.
- [ ] Los comandos de instalación están en texto, no en imágenes.
- [ ] Probaste la instalación en limpio, en otra carpeta:

```bash
d=$(mktemp -d) && cd "$d" && curl -fsSL https://raw.githubusercontent.com/TU-USUARIO/TU-REPO/v1.0.0/install.sh -o install.sh && curl -fsSL https://raw.githubusercontent.com/TU-USUARIO/TU-REPO/v1.0.0/SHA256SUMS -o SHA256SUMS && sha256sum -c SHA256SUMS && bash install.sh --version v1.0.0 --dir "$d/prueba"
```

- [ ] Y arrancaste esa instalación con `npm start` y respondía a `.menu`.

Si todo eso está, no estás publicando un fork: estás publicando **un proyecto**.
