> **Histórico.** 2026-10-05 · auditoría de la versión 3.2.1. Se guarda como registro de lo que se
> decidió y por qué; **no se mantiene al día**. Para el estado actual,
> ver [docs/MAPA.md](../MAPA.md) y [docs/INDICE.md](../INDICE.md).

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
repositorio apareció vacío. Ejecuté todas las pruebas, una por una,
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
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.2.9/install.sh -o install.sh
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.2.9/SHA256SUMS -o SHA256SUMS

# comprobar la huella ANTES de ejecutar
sha256sum -c SHA256SUMS

# instalar exactamente esa versión (clona la etiqueta, no main)
bash install.sh --version v3.2.9
```

`npm run firma` genera `SHA256SUMS`; `npm run firma:check` comprueba que
coincide con el `install.sh` actual. Una prueba falla si alguien cambia el
instalador y olvida regenerar el archivo, y otra comprueba que un byte distinto
hace fallar `sha256sum -c`.

`--version TAG` clona esa etiqueta con `--branch`; si no existe, lo dice y
sugiere `git ls-remote --tags`.

## 4. Qué se probó y cómo

Cuarenta y tres casos, todos con `bash`, `git` y `npm` reales sobre carpetas
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
| `test/instalador.test.js` | de 16 a 43 casos; blindaje de la suite con `SHIN_NO_BORRAR` |
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
node test/instalador.test.js           # 43/43
npm run firma                          # SHA256SUMS
npm run firma:check                    # comprobación
sha256sum -c SHA256SUMS                # install.sh: OK
npx eslint . ; npx tsc                 # limpio
```

---

# Revisión final: los cinco puntos

Segunda auditoría, sobre los cinco puntos concretos. Todo lo de esta sección
se ejecutó; donde algo no se pudo reproducir, se dice.

## 1. Desinstalación propia — sin contradicción

La protección contra borrar "algo que contiene al instalador" tenía un caso
que la habría bloqueado: borrar la carpeta donde vive el propio script. La
regla ahora lo distingue con una comparación explícita: se prohíbe borrar un
**ancestro** del script, no la carpeta donde está.

| Caso | Resultado |
|---|---|
| `--uninstall` desde dentro del proyecto | ✅ desinstala y **termina** (no muere al borrarse) |
| `--uninstall --purge` desde dentro | ✅ borra todo y termina |
| `--dir <padre que contiene el repo>` y desinstalar | ✅ rechazado: "contiene al propio instalador" |
| `--dir` apuntando a otra instalación | ✅ funciona |

El detalle que importa: bash lee el script por trozos, así que borrar el
archivo a mitad de ejecución podía cortarlo. La prueba comprueba que llega al
mensaje final y que los datos quedan guardados, no solo que el directorio
desapareció.

## 2. Actualización desde etiquetas — sí había un problema, pero no el descrito

Clonar una etiqueta deja la cabeza desprendida. La hipótesis de que
`git pull --ff-only` fallaría no se confirmó: `git merge --ff-only` **sí**
funciona en una cabeza desprendida. El fallo real era peor y más silencioso:

```
antes:  instalado en v9.0.0  →  --update  →  v9.0.0-1-ga42258f
        (la instalación deja de ser "exactamente la versión que pediste",
         sin decirlo, y no hay forma de volver a fijarla)
```

Corregido. Ahora, en una instalación fijada:

| Comando | Qué hace |
|---|---|
| `--update` | **se niega** y explica las dos salidas |
| `--update --version vX` | salta a esa etiqueta, reinstala y verifica |
| `--update --branch main` | vuelve a la rama y deja de estar fijada |

Probado también el rollback desde una etiqueta: si `v9.1.0` no pasa las
comprobaciones, vuelve a `v9.0.0` y los datos quedan byte a byte iguales
(verificado con SHA256 de `.env`, `auth.db` y `shin.db`).

## 3. Protección de rutas — de lista negra a lista blanca

Antes: lista de rutas prohibidas. Ahora, para llegar a `rm -rf` hay que pasar
cuatro filtros, y el primero es de lista blanca:

1. **Identificación**: la ruta tiene que ser la de esta instalación (deducida
   del propio script) o una que el usuario haya escrito con `--dir`. Si no se
   sabe, se para. No hay valor por defecto.
2. **Identidad**: `package.json` con `name: shin-md` **y** `.git`.
3. **Forma**: ningún tramo del camino puede ser un enlace simbólico — se
   comprueba sobre la ruta **tal como se dio**, no sobre la resuelta. (La
   versión anterior resolvía primero y por eso el enlace se volvía invisible;
   lo encontró esta auditoría.)
4. **Contenido**: no puede ser el sistema, ni `$HOME`, ni contener al
   instalador, ni contener nada de `SHIN_NO_BORRAR`.

Casos probados: espacios en la ruta, ruta relativa, enlace intermedio, enlace
final, directorio padre, `/`, `$HOME`, `/usr`, `/etc`, `/bin`, `/tmp/...` fuera
de la raíz de instalación, y variables de entorno (`SHIN_INSTALL_ROOT`,
`SHIN_INSTALL_DIR`, `SHIN_NO_BORRAR`).

## 4. Paquetes de Termux — dos correcciones

| Antes | Ahora | Por qué |
|---|---|---|
| `pkg install termux-api` para el wakelock | `pkg install termux-tools` | `termux-wake-lock` lo provee **termux-tools** (paquete base, ya presente); `termux-api` es para hablar con la app Termux:API y aquí no se usa |
| solo `pkg install yt-dlp` | `yt-dlp`, si falla → `python-yt-dlp` | en varias ramas de Termux el comando lo provee `python-yt-dlp` |

La prueba de Termux simula que `pkg install yt-dlp` falla y comprueba que se
reintenta con `python-yt-dlp`, y que **nunca** aparece `termux-api`.

## 5. Persistencia, rollback y base de datos

Una actualización que falla después de tocar código y dependencias deja:

- código en el commit anterior (verificado con `rev-parse`);
- dependencias reinstaladas desde el lockfile;
- `.env`, `Sessions/Owner/auth.db` y `data/shin.db` con la misma huella SHA256
  que antes;
- y un aviso si la base quedó por delante del código.

Sobre las migraciones: el bot **sí migra** al arrancar. Revisado
`src/storage/migrations.js`, todas las operaciones son aditivas
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`); no hay ningún `DROP`
ni `DELETE`. Es decir: hoy no hay migraciones destructivas que respaldar. La
salvaguarda está puesta para cuando las haya: copia de `data/` antes de
actualizar, lectura de la versión de esquema antes y después, y aviso explícito
con la ruta de la copia si se revierte el código con la base por delante.

## Lo que sigue pendiente

- **Android real**: `pkg install`, `termux-wake-lock`, `sharp` wasm en el
  dispositivo, persistencia en segundo plano. Nada de esto se ha ejecutado en
  un teléfono.
- **WhatsApp real**: vincular y enviar tras instalar por este método.
- **`node_modules` del repositorio**: desapareció dos veces durante esta
  auditoría y **no se pudo reproducir**. Recorrí los 31 archivos de prueba con
  un marcador dentro y ninguno lo borra. Dos guardas quedan puestas: cada
  llamada al instalador falla si el `node_modules` del repositorio desaparece
  durante esa llamada, y una prueba final compara una firma del repositorio
  tomada al empezar. No afirmo una causa que no tengo.
- **Rollback de una migración**: no existe. Se restaura la copia, a mano.

---

# Segunda revisión: copia de SQLite, rutas alternativas y el misterio de node_modules

## La copia de la base no era consistente — corregido

Señalado como duda razonable y era un fallo real. `cp` de `shin.db` con el bot
corriendo **pierde las transacciones que están en el WAL**. Medido con un
proceso escribiendo en paralelo:

```
copia simple  (cp shin.db)      → 1872 filas
copia de verdad (VACUUM INTO)   → 2019 filas
```

Ahora `respaldar_datos()` usa `VACUUM INTO` desde `node:sqlite` y valida con
`PRAGMA integrity_check`. Hay una prueba que levanta un proceso escribiendo en
WAL, lanza `--repair`, y exige que el respaldo tenga todas las filas y pase la
comprobación de integridad.

### Y si la copia no se puede hacer, se para

Antes caía a un `cp` avisando. Eso no vale: quien lee «aviso» y sigue adelante
termina con un respaldo incompleto y sin saberlo hasta que lo necesita. Ahora,
si cualquier base de `data/` no se puede copiar de forma consistente:

- el instalador **se detiene** y no sigue con la actualización ni la reparación;
- dice qué archivo falló y por qué;
- no toca nada de lo que había;
- deja intactos los respaldos anteriores.

El respaldo se escribe en `backups/.<motivo>-<fecha>.parcial` y solo se
renombra al nombre definitivo cuando está completo. Un respaldo a medias nunca
llega a tener nombre bueno.

Además, `--uninstall` ahora **conserva `backups/`** con el resto de los datos:
antes se llevaba `.env`, `Sessions/` y `data/`, y borraba con la carpeta unos
respaldos que seguían siendo válidos.

Nota de implementación: `node:sqlite` de Node 22.14 **no** expone `backup()`;
`VACUUM INTO` sí está y es equivalente para este caso.

## Rutas alternativas al mismo destino

Probado, una instalación nueva por caso:

| Se le pasa | Resultado | Correcto |
|---|---|---|
| `<instalación>` | borra | sí |
| `<instalación>/` | borra | sí |
| `<raíz>//Shin-MD` | borra | sí |
| `<raíz>/otra/../Shin-MD` (con `otra` inexistente) | se niega | sí |
| el directorio padre | se niega | sí |
| `/` | se niega | sí |
| un nivel más arriba | se niega | sí |
| ruta con un enlace en cualquier tramo | se niega | sí |
| cwd alcanzado por un enlace | funciona: se opera sobre la ruta real | sí |

El último caso obligó a un cambio: cuando la instalación se **deduce** (no la
escribe el usuario), se resuelve a su ruta real al principio. Si el usuario la
escribe con `--dir`, un enlace en cualquier tramo sigue siendo motivo de
rechazo.

## node_modules: causa encontrada, y no era el instalador

Durante tres turnos `node_modules` desapareció del repositorio y no conseguí
reproducirlo. La causa no estaba en el código: **el entorno no guarda
`node_modules` entre turnos** (está excluido de las instantáneas del espacio de
trabajo por ser dependencia regenerable). Cada vez que lo encontré vacío era al
principio de un turno, nunca durante una ejecución.

Dentro de un mismo turno sobrevive: la suite completa lo deja intacto (312
módulos antes y después). Las dos guardas que añadí siguen puestas, porque
detectar es más barato que investigar.

Lo digo claro porque en el informe anterior afirmé que no tenía causa. Sí la
tenía escrita desde el principio y no la conecté.

## Registro del estado del repositorio

Al añadir la copia consistente, la suite del instalador pasó de 43 a 47 casos.
Verificado sobre el árbol de trabajo: `247/247` pruebas, `shellcheck` limpio,
`eslint` 0 errores, `tsc` limpio.
