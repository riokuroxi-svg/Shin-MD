# Auditoría de seguridad del instalador — 3.2.1

Commit auditado: `ec2c936` (v3.2.0). Este documento responde a la auditoría
externa y **no** maquilla lo que sigue sin comprobarse en un dispositivo real.

## 1. El incidente

Durante el desarrollo, dos ejecuciones de la suite borraron el repositorio de
trabajo. No fue un fallo de git ni un accidente de tecleo: fue mi diseño.

La cadena exacta:

1. El instalador deducía la instalación con `[ -d "$DESTINO/.git" ]`.
2. Una prueba creó una carpeta temporal **sin** `.git` y ejecutó `install.sh`
   desde dentro de ella.
3. La deducción falló, así que `DESTINO` cayó al valor por defecto:
   `$HOME/Shin-MD`. Sin aviso.
4. La acción era `--uninstall --purge --yes`: las tres banderas juntas.

Cuatro decisiones malas a la vez. Cualquiera de ellas, sola, lo habría evitado.
Las cuatro están corregidas, y cada una tiene su prueba.

## 2. Vulnerabilidades encontradas

| # | Hallazgo | Gravedad | Estado |
|---|---|---|---|
| 1 | Destino destructivo por defecto cuando la deducción fallaba | Crítica | Corregido |
| 2 | `--purge --yes` borraba datos sin segunda confirmación | Alta | Corregido |
| 3 | Sin rechazo de `/`, `$HOME`, `/usr`, `/etc`, `/bin`… | Alta | Corregido |
| 4 | Sin resolución de enlaces simbólicos antes de borrar | Alta | Corregido |
| 5 | Una carpeta llamada `Shin-MD` con `package.json` falso era borrable | Media | Corregido |
| 6 | El rollback de `--update` no se ejecutaba si fallaba `npm ci` | Alta | Corregido |
| 7 | Sin comprobación de espacio: un disco lleno dejaba basura a medias | Media | Corregido |
| 8 | Sin huella verificable: `curl` desde `main` es mutable | Media | Mitigado |
| 9 | `rm`/`cp` dispersos, cada uno con su propia lógica | Media | Corregido |
| 10 | La suite podía borrar el repositorio que la ejecuta | Crítica | Corregido |
| 11 | Durante una ejecución completa de la suite desapareció `node_modules` del repositorio | Media | **No reproducido**; vigilancia añadida |

### Detalle de las dos correcciones que importan

**#1 y #10 — rutas.** Ahora existe una única función que borra árboles,
`borrar_arbol()`, y en todo `install.sh` **no hay más que un `rm -rf`
ejecutable**, dentro de ella (el otro aparece dentro de un mensaje de ayuda).
Antes de borrar:

- resuelve la ruta real con `pwd -P` (enlaces y `..` incluidos);
- rechaza `/`, `/home`, `/usr`, `/etc`, `/bin`, `/sbin`, `/lib`, `/boot`,
  `/dev`, `/proc`, `/sys`, `/var`, `/opt`, `/system`, `/data`, `/storage`;
- rechaza `$HOME` aunque no haya nada más;
- rechaza cualquier ruta que **contenga** al propio instalador (borrar un
  padre borraría el script a mitad de ejecución);
- rechaza cualquier ruta que **contenga** algo listado en `SHIN_NO_BORRAR`;
- se niega si el objetivo es un enlace simbólico;
- imprime la ruta absoluta antes de tocar nada.

Y para llegar hasta ahí, una acción destructiva exige además pasar
`exigir_destino_conocido()` (saber sobre qué instalación actúa: la de esta
carpeta o la que pidió el usuario con `--dir`, nunca una supuesta) y
`exigir_proyecto()` (que el `package.json` diga `shin-md` **y** que exista
`.git`).

`SHIN_NO_BORRAR` es la red final: la suite la fija con la raíz del
repositorio en cada ejecución. Aunque todo lo anterior fallara, el borrado se
detiene ahí.

**#6 — rollback.** `instalar_dependencias()` llamaba a `morir` si `npm ci`
fallaba. En una actualización eso mataba el proceso antes de que
`accion_actualizar` pudiera revertir: el código nuevo quedaba puesto y las
dependencias a medias. Ahora, en modo actualización, devuelve error en vez de
salir, y el llamador revierte al commit anterior y reinstala las dependencias
que sí funcionaban. La prueba lo verifica con `git rev-parse` y comparando las
huellas SHA256 de `.env`, `Sessions/Owner/auth.db` y `data/shin.db` antes y
después.

### Lo que no conseguí reproducir

En una de las primeras pasadas de esta auditoría, `node_modules` del
repositorio apareció vacío. Ejecuté las treinta y dos pruebas, una por una,
con un marcador dentro y **ninguna lo tocó**, ni tampoco la prueba del clon
real que enlaza `node_modules` por enlace simbólico. No tengo causa
confirmada, así que no voy a inventarla.

Lo que sí hice: la suite ahora toma una firma del repositorio al arrancar
(entradas de la raíz, hash del `package.json`, número de archivos de prueba) y
una prueba final falla si algo cambió. Si vuelve a pasar, se verá con nombre y
apellidos en vez de descubrirse por casualidad.

## 3. Integridad de versiones

`main` es mutable: dos `curl` separados en el tiempo pueden traer archivos
distintos. Ahora:

```bash
# descargar del release, no de main
curl -fsSL https://github.com/riokuroxi-svg/Shin-MD/releases/download/v3.2.1/install.sh -o install.sh
curl -fsSL https://github.com/riokuroxi-svg/Shin-MD/releases/download/v3.2.1/SHA256SUMS -o SHA256SUMS

# comprobar la huella ANTES de ejecutar
sha256sum -c SHA256SUMS

# instalar exactamente esa versión (clona la etiqueta, no main)
bash install.sh --version v3.2.1
```

`npm run firma` genera `SHA256SUMS`; `npm run firma:check` comprueba que
coincide con el `install.sh` actual. Una prueba falla si alguien cambia el
instalador y olvida regenerar el archivo, y otra comprueba que un byte distinto
hace fallar `sha256sum -c`.

`--version TAG` clona esa etiqueta con `--branch`; si no existe, lo dice y
sugiere `git ls-remote --tags`.

## 4. Qué se probó y cómo

Treinta y dos casos, todos con `bash`, `git` y `npm` reales sobre carpetas
temporales. Cada uno verifica antes de arrancar que trabaja dentro de
`os.tmpdir()`, y ejecuta el `install.sh` de la instalación bajo prueba, nunca
el del repositorio.

### Verificado con ejecución real

| Escenario | Cómo |
|---|---|
| Instalación limpia | clon + `npm ci` + 8 parches en un directorio vacío |
| Segunda ejecución | actualiza, no duplica; huellas de los datos intactas |
| Fallo de `npm` | exit ≠ 0, sin marca `.shin-install`, y la pasada siguiente completa |
| Fallo de postinstall | detecta los parches incompletos y aborta con `--repair` |
| Actualización | trae commits nuevos y conserva `.env`, `auth.db`, `shin.db` |
| Update con npm roto | revierte al commit anterior y conserva los datos |
| Update con postinstall roto | ídem, comprobado con `git rev-parse` |
| Sin red | `fetch` falla, no toca nada |
| Cambios propios | se niega a actualizar y los deja como estaban |
| Reparación | borra `node_modules`, reconstruye, datos intactos |
| Desinstalación | mueve los datos al lado; cancelar no borra nada |
| `--purge` sin frase | se niega; con "borrar todo", borra |
| `SHIN_DB_PATH` externo | ni lo mueve ni lo modifica |
| Ruta protegida | `SHIN_NO_BORRAR` impide el borrado |
| `/`, `/usr`, `/etc`, `$HOME`, `/bin` | rechazadas, y siguen existiendo |
| Enlace simbólico | rechazado, destino real intacto |
| `Shin-MD` sin `.git` | rechazada, archivos del usuario intactos |
| Sin permisos | se detiene, sin marca |
| `Ctrl+C` | exit ≠ 0, sin marca, y se puede retomar |
| `--version` con etiqueta | clona la etiqueta y la reporta |
| Etiqueta inexistente | error claro, nada marcado |
| SHA256SUMS | coincide con `install.sh`; un byte distinto lo invalida |

### Verificado mediante simulación

| Escenario | Cómo se simuló | Qué NO prueba |
|---|---|---|
| Termux | `PREFIX`, `TERMUX_VERSION` y un `pkg` que registra llamadas | que `pkg` instale de verdad |
| Arquitectura ARM64 | `uname -m` falso | el binario real |
| Disco lleno | `df` falso con 10 MB libres | el comportamiento del sistema de archivos |

### Verificado mediante pruebas unitarias

- `resolver_real`, `ruta_intocable` y `borrar_arbol` se ejercitan a través del
  instalador completo, no aisladas.

### Pendiente de Android real

- `pkg install nodejs-lts` y que la versión resultante sea ≥ 22.5.
- `pkg install ffmpeg`, `yt-dlp`, `termux-api`.
- `termux-wake-lock` en un dispositivo real.
- Carga de `sharp` wasm32 en Android.
- Arranque y persistencia del bot más de una hora en segundo plano.
- Vinculación real por código con `auth.db` en SQLite.

### Pendiente de WhatsApp real

- Que el bot conecte, reciba y envíe después de instalar por este método.

## 5. Límites conocidos, sin adornos

1. **No hay Android.** Todo lo de Termux en este informe es simulación. La
   palabra "compatible" no está justificada todavía; el README dice "Termux
   (probado en simulación)".
2. **La huella la firma el mismo servidor.** `SHA256SUMS` vive en el mismo
   GitHub que el archivo: protege de una descarga corrupta o de un `main` que
   cambió, no de un GitHub comprometido. Para eso haría falta firma GPG, que
   aquí no añade valor sin una clave publicada y verificada por ti.
3. **El rollback restaura código y dependencias, no datos.** El instalador
   respalda `.env`, `Sessions/` y `data/` antes de tocar nada, pero si el bot
   migra el esquema de una base y luego falla, la copia es de antes de la
   migración y hay que restaurarla a mano. No hay versionado de esquema que
   revertir automáticamente.
4. **`--repair` borra `node_modules`.** Es regenerable por definición, pero si
   alguien había parcheado algo a mano ahí, se pierde.
5. **Una instalación con Docker, nvm o un `node_modules` compartido** no está
   contemplada; el instalador asume un clon y su propio `node_modules`.

## 6. Cambios

| Archivo | Qué cambió |
|---|---|
| `install.sh` | capa de protección de rutas, `borrar_arbol` como único borrado, `--version`, comprobación de espacio, rollback arreglado, frase de confirmación para `--purge` |
| `test/instalador.test.js` | de 16 a 32 casos; blindaje de la suite con `SHIN_NO_BORRAR` |
| `scripts/firma-instalador.mjs` | generación y comprobación de `SHA256SUMS` |
| `package.json` | `npm run firma`, `npm run firma:check`, versión 3.2.1 |
| `docs/TERMUX.md` | flujo por release, tabla de estado real vs. simulado |
| `docs/INSTALACION.md` | protección de rutas y qué hace el instalador antes de borrar |
| `README.md` | instalación desde release con verificación de huella |

## 7. Comandos ejecutados

```bash
shellcheck -x -S style install.sh      # limpio
bash -n install.sh                     # sintaxis
npm test                               # suite completa
node test/instalador.test.js           # 32/32
npm run firma                          # SHA256SUMS
npm run firma:check                    # comprobación
sha256sum -c SHA256SUMS                # install.sh: OK
npx eslint . ; npx tsc                 # limpio
```
