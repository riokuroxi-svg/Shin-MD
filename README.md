<div align="center">

<img src="docs/assets/pastel/hero.svg" alt="Shin-MD — bot de WhatsApp con anti-ban propio, 213 comandos, 752 nombres y 378 pruebas" width="100%">

<br>

<img src="docs/assets/pastel/insignia-pruebas.svg" alt="378/378 pruebas" height="52">
<img src="docs/assets/pastel/insignia-comandos.svg" alt="213 comandos" height="52">
<img src="docs/assets/pastel/insignia-node.svg" alt="Node 22.5 o superior" height="52">
<img src="docs/assets/pastel/insignia-baileys.svg" alt="Baileys 7" height="52">
<img src="docs/assets/pastel/insignia-licencia.svg" alt="Licencia AGPL-3.0-only" height="52">
<img src="docs/assets/pastel/insignia-termux.svg" alt="Termux (probado en simulación)" height="52">

<br><br>

<!-- El único recurso externo del README: el badge del CI, porque su estado
     cambia en cada push. Si quieres cero peticiones a terceros, borra esta línea. -->
[![CI](https://img.shields.io/github/actions/workflow/status/riokuroxi-svg/Shin-MD/test.yml?style=flat-square&label=CI&labelColor=2E2740&color=7C5FC4)](https://github.com/riokuroxi-svg/Shin-MD/actions)

**El bot de WhatsApp que sobrevive a los cortes de red, no pierde tu sesión
y reduce el riesgo de bloqueo.**

213 comandos · anti-ban nativo · Node ≥ 22.5 · sin servicios de terceros en medio.

_Reducir el riesgo no es eliminarlo: eso lo decide WhatsApp, no el bot. Lo que sí está en nuestra mano está contado en [el anti-ban por dentro](#el-anti-ban-por-dentro)._

[🌐 Página del proyecto](docs/web/index.html) ·
[⚡ Instalar](#instalación-en-un-comando) ·
[🧩 Comandos](#los-comandos) ·
[🛡️ Anti-ban](#el-anti-ban-por-dentro) ·
[📚 Guías](#las-guías) · [🪪 Identidades](#identidades-lid) ·
[🔌 El conector](#el-conector) ·
[📜 Licencia](#licencia-y-marca) ·
[🧪 Shin-Lab](https://github.com/riokuroxi-svg/Shin-Lab) ·
[☕ Apoyar el proyecto](#apoyar-el-proyecto)

</div>

<!-- Sección de apoyo bien visible, primera cosa después de la navegación -->
<div align="center" id="apoyar-el-proyecto">

**Shin-MD es y seguirá siendo gratis, sin publicidad ni funciones de pago.**<br>
Si te sirve y quieres ayudar a mantener el desarrollo (hosting, tiempo, APIs),
puedes invitarme un café:

<br>

<a href="https://ko-fi.com/kuroxisvg" target="_blank" rel="noopener noreferrer">
  <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=3" alt="Invítame un café en Ko-fi" height="60">
</a>

</div>

<img src="docs/assets/pastel/aviso.svg" alt="Usa un número secundario" width="100%">

> **Usa un chip aparte, no tu número de siempre.** WhatsApp puede sancionar las
> cuentas que automatizan mensajes; este bot reduce el riesgo, no lo elimina. Un
> chip barato cuesta menos que tu cuenta personal.

<h2 id="lo-que-lo-hace-distinto">Lo que lo hace distinto</h2>

<img src="docs/assets/pastel/banner-01.svg" alt="01 · Lo que lo hace distinto" width="100%">

<img src="docs/assets/pastel/razones.svg" alt="Seis razones medibles" width="100%">

Y si quieres comprobarlo en vez de creértelo, cada razón tiene su archivo:

| Lo que promete | Dónde está para leerlo |
|---|---|
| anti-ban (jitter, perfil, calentamiento) | `src/core/engine/throttler.js` |
| cola con prioridad y reintentos | `src/network/queue.js` |
| sesión en SQLite, sin `creds.json` corrupto | `src/core/auth.js` y `src/storage/database.js` |
| el bot se reinicia solo si se cae | `scripts/supervisor.mjs` y `scripts/vigia.mjs` |
| cada afirmación con su prueba | `test/` (una prueba por cosa que se dice) |
| capas separadas: motor por un lado, comandos por otro | `src/` y `cmds/` |

Eso es también la base para tus propios proyectos: no hace falta entenderlo
todo de golpe. Se empieza por un comando y se va bajando. El camino, con
ejemplos que funcionan tal cual, está en **[docs/DESARROLLO.md](docs/DESARROLLO.md)**.

<h2 id="el-anti-ban-por-dentro">El anti-ban por dentro</h2>

<img src="docs/assets/pastel/banner-02.svg" alt="02 · El anti-ban por dentro" width="100%">

Nada de «espero un `Math.random()`». Esto es lo que hace que el bot parezca una
persona y se proteja solo:

<img src="docs/assets/pastel/anti-ban-curva.svg" alt="Curva del jitter gaussiano y calentamiento diario 20 a 500" width="100%">

<img src="docs/assets/pastel/anti-ban-tabla.svg" alt="Tabla: las ocho piezas del anti-ban" width="100%">

**Lo que esto consigue y lo que no.** Estas piezas están en el código y se pueden
leer: riesgo medido por el watchdog (a 80 se pausa la cola de envíos, a 95 se
reconecta), jitter gaussiano entre mensajes, calentamiento diario, límite por
comando y sesión que no se borra por un corte de red. Ninguna de ellas puede
prometer que WhatsApp no suspenda una cuenta: eso lo decide WhatsApp con
señales que el bot no ve. Lo que sí se puede decir es que el bot no se
comporta como un robot que dispara mil mensajes por minuto. **Usa un número
secundario.**

<details>
<summary><b>Huella de Shin-MD (marcador de obras derivadas)</b></summary>

El motor anti-ban tiene una combinación de parámetros propia:

`shinJitter` gaussiano σ 0.25 · base **1200 ms** (400–5000, +25 ms por carácter)
· perfil nuevo **1500 ms** / veterano **700 ms** · penalización **×1.5** a
contactos nuevos · calentamiento **20→500** mensajes/día en **7 días**

Si ves esos parámetros exactos en otro bot, es una obra derivada de Shin-MD y
debe cumplir la atribución de la Sección 7 del `NOTICE`.

</details>

<h2 id="los-comandos">Los 213 comandos</h2>

<img src="docs/assets/pastel/banner-03.svg" alt="03 · Los 213 comandos" width="100%">

Escribe `.menu` dentro de WhatsApp y verás la tarjeta con botones y la lista
desplegable por categorías.

<img src="docs/assets/pastel/comandos.svg" alt="Los 213 comandos repartidos en 15 categorías" width="100%">

<img src="docs/assets/pastel/categorias.svg" alt="Las 15 categorías con sus comandos" width="100%">

**213 comandos únicos · 752 nombres en total (539 alias) · 15 categorías.** Nombres de
ejemplo: `.play` (y sus alias `yt`, `mp3`, `musica`), `.sticker` (`s`),
`.daily` (`diario`, `recompensa`), `.w` (`work`, `trabajar`), `.x` para Twitter,
`.ig` para Instagram y `.menu` (`ayuda`, `h`).

🔑 *`.instagram`, `.twitter` y `.imagen` funcionan solos; si quieres un plan B
cuando el método directo falla, se les puede configurar una API de respaldo en
el `.env` (`GINKO_API_URL`, `DELIRIUS_API_URL`…). Sin ella el comando lo dice y
el resto del bot no se entera. `.pinterest` está fuera de servicio: su API
gratuita cerró.*

<details>
<summary><b>Ver la lista completa de comandos (se genera del propio bot)</b></summary>

La página **[docs/web/index.html](docs/web/index.html)** lleva los 213 con su
buscador, filtros por categoría y descripción. Para regenerarla cuando añadas
comandos:

```bash
npm run docs:web
```

</details>

<h2 id="panel-local">Panel local</h2>

<img src="docs/assets/pastel/banner-04.svg" alt="04 · Panel local" width="100%">

<img src="docs/assets/pastel/panel.svg" alt="Panel en 127.0.0.1:3000 con /health y /metrics" width="100%">

<h2 id="instalación-en-un-comando">Instalación en un comando</h2>

<img src="docs/assets/pastel/banner-05.svg" alt="05 · Instalación en un comando" width="100%">

<img src="docs/assets/pastel/subbanner-1.svg" alt="Termux (Android)" width="100%">

**Android (Termux).** Instala Termux desde [F-Droid](https://f-droid.org/packages/com.termux/)
—la versión de Play Store está abandonada y rompe los paquetes— y pega esto:

```sh
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/shin.sh | sh
```

Una línea, y el bot queda arrancado. Ese archivo descarga el instalador de
**esa misma versión**, comprueba su huella SHA-256 y solo entonces lo ejecuta,
en modo autónomo: mira qué falta (Node, git, dependencias), instala o actualiza
lo que haga falta **sin duplicar nada**, deja el comando `shin` en el `PATH` y
arranca el bot. No hay `npm start` que escribir, ni `cd`, ni `pkg update`.

Es `| sh` a propósito, no `| bash`: el arranque está escrito en POSIX puro y se
prueba con dash (Debian), ash de busybox (Alpine) y bash (macOS). Si el primer
espejo no responde, prueba el segundo; si la red se corta a medias, reintenta
con espera creciente en vez de empezar de cero.

Si ya lo tenías instalado, volver a pegar ese mismo comando **no duplica**:
reconoce la instalación, mira si hay algo nuevo y, si no lo hay, arranca y ya.
Tus datos (`.env`, `Sessions/`, `data/`) no se tocan nunca.

Después de la primera vez, el bot se arranca con una palabra:

```bash
shin
```

| Escribes | Pasa |
|---|---|
| `shin` | arranca el bot (panel + bot) |
| `shin --code` | arranca pidiendo el código de vinculación (no hay QR) |
| `shin update` | actualiza y arranca |
| `shin repair` | reconstruye dependencias y arranca |
| `shin doctor` | foto del estado, para pegar si pides ayuda |
| `shin service` | lo deja como servicio de systemd (VPS) |
| `shin verify` · `shin uninstall` | comprobar · desinstalar guardando tus datos |

El lanzador son veinte líneas de shell que apuntan a `install.sh`; se puede leer
entero con `cat "$(command -v shin)"`.

**Si falta Node o git, los pone él.** En Termux con `pkg`; en un VPS con
`apt`/`dnf`/`apk`/`pacman`/`brew` (**preguntando antes**, y nunca sin terminal:
un `curl | sh` no decide eso por ti); y si no hay root, descarga Node oficial de
nodejs.org, **comprueba la huella que publica nodejs.org** y lo descomprime en
`~/.local/opt`, sin tocar el sistema.

<details>
<summary><b>Modo auditor: mirarlo antes de ejecutarlo</b></summary>

El comando de arriba ejecuta lo que baja. Quien prefiera leerlo primero, o
comprobarlo a mano, hace lo de siempre — con la diferencia de que ahora la
huella cubre también el arranque:

```bash
pkg update -y && pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/install.sh -o install.sh
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/SHA256SUMS -o SHA256SUMS
sha256sum -c SHA256SUMS && bash install.sh --version v3.7.0 --go
```

La cuarta línea solo ejecuta si la huella coincide: instala una versión
concreta, no lo que haya en `main` ese día. `--go` arranca el bot al terminar;
sin él, el instalador se queda en «instalado» y se arranca luego con `shin`.

¿Solo quieres saber si el archivo es el bueno, sin instalar nada?

```sh
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/shin.sh | sh -s -- --dry-run
```

</details>

Antes de arrancarlo, para que Android no lo mate mientras duerme:

1. Notificación de Termux → **Acquire wakelock**.
2. Ajustes → Batería → Termux → **Sin restricciones**.
3. Android 14 o más: Opciones de desarrollador → **Desactivar restricciones de procesos hijos**.

En el primer arranque, `shin --code` te pide el número una vez y luego enseña un
código de 8 caracteres en su propio panel. En WhatsApp: **Dispositivos
vinculados → Vincular con número de teléfono** y lo escribes ahí. No hay QR: en
la pantalla de un móvil no cabe y, partido, no hay quien lo escanee.

> **Nada de esto hay que memorizarlo.** Está paso a paso, con lo que debes ver
> en pantalla en cada momento y qué hacer cuando algo falla, en
> **[docs/INSTALACION.md](docs/INSTALACION.md)**.

**Un solo comando.** `shin` levanta el bot y dibuja el panel:

```
╭ SHIN-MD 3.5.1 ──────────────────────────────────────╮
│ ● ACTIVO  12 grupos  ↑ 2h 15m  ⟳ 1  pid 4242        │
│ mem 151M · cola 3 · riesgo 23 · disco 19.9G · bat 39│
│ web http://127.0.0.1:3000                           │
╰─────────────────────────────────────────────────────╯
 01:56:37  bot arrancado
 ✓ Bot listo ✓
 mensaje de 52155…
```

El panel se queda clavado arriba y lo que va diciendo el bot sale debajo. Si
escribes `.restart`, si el bot se cae, si lo reinicias con la tecla `r`: el
panel no se mueve, solo cambia el estado (`REINICIANDO · espera un momento`).
Y como se redibuja cada segundo, ni un `clear` se lo lleva por delante.

Teclas: `r` reiniciar, `q` o `Ctrl+C` salir. La dirección del panel local está
siempre en la cabecera, así que no se pierde al limpiar la pantalla.

**Sin terminal no hay panel, y está bien.** En un VPS, con systemd, pm2 o
`nohup`, `npm start` escribe líneas normales: el panel solo se dibuja cuando
hay una terminal de verdad. Ver [`docs/VPS.md`](docs/VPS.md).

**Cuando un mensaje sale como «no compatible con tu versión».** Ese cartel no
lo pone el bot: lo pone tu WhatsApp cuando no entiende un tipo de mensaje. Como
el envío sí funciona, no da ningún error y quedas a ciegas. Hay un comando que
lo mide: `.compat`, en privado, manda cuatro mensajes numerados —texto, botones,
hoja inferior y álbum— y el que salga mal es el culpable.

**Una foto del estado, sin arrancar nada.** `npm run panel` dibuja dos cajas:
una con el bot y otra con el teléfono donde corre. `npm run panel:vivir` la
refresca cada dos segundos. Es de solo lectura: no manda nada, no expone nada
hacia fuera y solo habla con `127.0.0.1`.

<img src="docs/assets/pastel/subbanner-2.svg" alt="Servidor o VPS" width="100%">

**Servidor o VPS.** El mismo comando, sin preparar nada antes:

```sh
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/shin.sh | sh
```

Si falta Node o git, el instalador lo resuelve: con el gestor de paquetes del
sistema si hay terminal y te deja preguntarte, o **sin root** descargando Node
oficial en `~/.local/opt` con su huella comprobada. En un contenedor o en un
`ssh -T` (sin terminal) no toca el sistema: va directo a la vía sin root.

Para que sobreviva a un reinicio del servidor, hay una orden y no hay que
escribir unidades a mano:

```sh
shin service              # unidad de systemd + arranque automático
shin service --print      # verla antes, sin escribir nada
```

Queda `systemctl status shin-md` y `journalctl -u shin-md -f` para ver qué dice.
En un servicio de usuario (sin root) avisa de lo único que falta:

```sh
sudo loginctl enable-linger $USER
```

Sin terminal de verdad no hay panel: el bot escribe líneas normales, que es
justo lo que quieres en un servidor. Si prefieres pm2, sigue funcionando igual
(`pm2 start index.js --name shin-md`). Detalle en **[docs/VPS.md](docs/VPS.md)**.

**Cuando algo no va.** Antes de tocar nada, pide la foto:

```sh
shin doctor
```

Dice plataforma, versiones, de dónde salió Node, si los parches del conector
están puestos, cuánto ocupa la sesión, espacio libre, si el bot corre y si hay
servicio. No lee secretos (del `.env` solo cuenta las claves) y no cambia nada.
Es el texto que hay que pegar cuando se pide ayuda.

**Ya instalado.** Un solo archivo manda sobre todo:

| Quiero… | Comando |
|---|---|
| arrancar el bot | `shin` |
| actualizar conservando mi sesión | `shin update` |
| arreglar una instalación rota | `shin repair` |
| saber si todo está bien | `shin verify` |
| ver qué pasa cuando algo falla | `shin doctor` |
| que arranque solo tras un reinicio | `shin service` |
| actualizar, arrancar o reparar sin el lanzador | `bash ~/Shin-MD/install.sh --update` · `--go` · `--repair` |
| desinstalar y guardar mis datos | `shin uninstall` |

`shin` es un archivo de veinte líneas que el instalador deja en `$PREFIX/bin`
(en Android) o en `~/.local/bin`, apuntando a la instalación de verdad: si
mueves la carpeta, vuelve a ejecutar `install.sh` y se reescribe solo.

**Por qué el comando de una línea no es un `curl | bash` a ciegas.** `shin.sh`
no descarga y ejecuta: descarga el instalador y su `SHA256SUMS`, calcula la
huella y compara. Si no coincide —porque el archivo llegó cortado o porque
alguien lo cambió— **no ejecuta nada** y lo dice. Lo único que ese esquema no
puede comprobar es `shin.sh` mismo, que es de donde cuelga la cadena: por eso
existe el modo auditor de arriba, y por eso el archivo va fijado a una etiqueta
y no a `main`.

### Las guías

El README es el resumen. Lo que de verdad hace falta para **hacer** algo está en
`docs/`, en texto que se puede copiar:

| Guía | Para quién |
|---|---|
| **[docs/INSTALACION.md](docs/INSTALACION.md)** | el que instala por primera vez: Termux o VPS, qué escribir, qué debe ver, y qué hacer cuando sale un error |
| **[docs/TERMUX.md](docs/TERMUX.md)** | el caso del teléfono con todo el detalle (wakelock, batería, procesos hijos) |
| **[docs/VPS.md](docs/VPS.md)** | servidor, systemd, pm2 y `0.0.0.0` con contraseña |
| **[docs/DESARROLLO.md](docs/DESARROLLO.md)** | el que quiere **entender**: cómo está montado, tu primer comando, botones, base de datos y migraciones |
| **[docs/FORK.md](docs/FORK.md)** | el que quiere **publicar su propia versión**: nombre, instalador, imágenes, su copyright y cómo no romper la licencia |
| **[docs/CONECTOR.md](docs/CONECTOR.md)** | los ocho parches de Baileys y por qué |
| **[docs/LID.md](docs/LID.md)** | identidades `@lid` contra teléfonos |
| **[docs/AUDITORIA-3.2.1.md](docs/AUDITORIA-3.2.1.md)** | qué se revisó y qué se encontró |


<h2 id="cómo-está-hecho">Cómo está hecho</h2>

<img src="docs/assets/pastel/banner-06.svg" alt="06 · Cómo está hecho" width="100%">

<img src="docs/assets/pastel/estructura.svg" alt="Estructura de carpetas y comandos npm" width="100%">

Los comandos que se usan de verdad, tal cual:

```bash
npm start              # arranca el bot y dibuja el panel
npm test               # las 378 pruebas
npm run lint           # 0 errores, o no entra
npm run typecheck      # tipos con JSDoc
npm run docs:web       # regenera docs/web/index.html desde el propio bot
npm run docs:pastel    # regenera las imágenes de este README
npm run publicar       # saca una versión: firma, suite, docs, commit, etiqueta, push y release
```

`npm run publicar` es la excepción de la lista: no es para tocar el código, es
**el único comando que hace falta para publicar**. Sube la versión en
`package.json` y `docs/assets/datos.json`, firma el instalador, pasa la suite
—si algo está en rojo, se detiene ahí y no deja nada a medias—, regenera la web
y las imágenes con los números reales de esa corrida, hace el commit, crea la
etiqueta, sube la rama y la etiqueta por separado y publica la release con las
notas que genera GitHub. Al terminar imprime la línea de instalación ya
apuntando a la versión nueva:

```bash
npm run publicar                  # sube el parche: 3.7.0 → 3.7.1
npm run publicar -- minor         # sube el menor:   3.7.0 → 3.8.0
npm run publicar -- 4.0.0         # esa versión, tal cual
npm run publicar -- --seco        # enseña el plan y no toca nada
```

Nada de eso hace falta para usarlo: se instala con un comando y se arranca con
`npm start`. Están aquí porque **el que quiera tocarlo tiene derecho a saber
dónde está cada cosa**. Si es tu caso, empieza por
**[docs/DESARROLLO.md](docs/DESARROLLO.md)**: cómo se carga un comando, dónde se
guarda un dato, qué puedes cambiar sin romper nada y las cinco reglas que este
proyecto no se salta.

<details>
<summary><b>Regenerar los gráficos del README (trazo vectorial, sin fuentes externas)</b></summary>

Las imágenes de arriba se generan solas y leen los números reales del bot
(`docs/assets/datos.json` si está; si no, los valores de respaldo del script),
así que nunca enseñan una cifra vieja. No usan fuentes de terceros ni peticiones
a internet: el texto va convertido a **trazado vectorial**, y así se dibuja
idéntico en cualquier móvil o navegador.

```bash
npm run docs:pastel        # o directamente: python3 tools/build_pastel.py
```

La primera vez hace falta `python3 -m pip install fonttools cairosvg pillow`
(y `fonts-noto-cjk` en Debian/Ubuntu para el kanji 反魂).

</details>

<h2 id="el-conector">El conector</h2>

El bot habla con WhatsApp a través de Baileys, y Baileys no está en su mejor
momento: la última versión es de julio y el proyecto lleva meses sin publicar,
con 46 arreglos esperando en la cola. En vez de esperar, el `npm install` aplica
un juego de parches propios —idempotentes, verificados y con su issue de
origen— que cubren lo que duele de verdad:

- **Vinculación**: QR que caduca, código que el teléfono rechaza por un nonce
  mal puesto y reconexión que manda el nodo equivocado.
- **Reconexiones**: los estados llegan como `<status>` y sin ack el servidor
  corta el stream cada ~50 minutos.
- **Multimedia**: una URL caducada ya no deja el archivo sin descargar; se pide
  el reenvío.
- **Memoria**: una fuga de `AsyncLocalStorage` por socket que crecía en cada
  reconexión.

Lo que no se puede arreglar (y por qué) también está escrito, con las 1 662
incidencias revisadas y su estado. Informe completo en
**[docs/CONECTOR.md](docs/CONECTOR.md)** · detalle de LID en
**[docs/LID.md](docs/LID.md)**.

```bash
node scripts/patch-baileys.cjs --check   # ¿están los ocho parches aplicados?
```

<h2 id="identidades-lid">Identidades: LID y teléfono</h2>

WhatsApp puede mandar al mismo usuario de dos formas: con su teléfono
(`521…@s.whatsapp.net`) o con un identificador interno, el **LID**
(`123…@lid`). Son **la misma persona**. Si el bot los tratara como dos, cada
usuario tendría dos carteras, el dueño dejaría de ser dueño y el admin de un
grupo dejaría de ser admin porque "no coincide el número".

Este bot los une:

- La llave de la economía es el **teléfono** siempre que se conozca, así los
  datos que ya estaban guardados siguen cuadrando.
- La pareja LID ↔ teléfono se aprende de donde venga (mensajes, metadatos del
  grupo, avisos del conector) y se guarda en SQLite: **sobrevive a reinicios y
  cambios de sesión**.
- El conector (Baileys 7) también guarda esas parejas en su propia sesión, así
  que «¿de quién es este LID?» se contesta **sin salir a internet**.
- Si alguien escribió cuando solo se conocía su LID, sus monedas se **fusionan**
  con la cuenta del teléfono en cuanto la pareja se aprende.
- Los permisos (dueño, admins) comparan las dos caras y la regla mexicana
  `521 = 52`, no cadenas de texto.

Lo que **no** se puede hacer, y conviene decirlo: saber el teléfono de un LID
que nadie vio nunca. Se contesta con lo aprendido por el conector y por el
tráfico; la consulta inversa (teléfono → LID) sí existe, pero sale a internet y
solo se usa cuando se pide a propósito con `.lid`.

Pruébalo en el teléfono con `.lid`: muestra tu llave, tu teléfono, tu LID, lo
que sabe el conector y si el bot ya conoce la pareja. En un grupo y en privado debes ver **la misma
llave**. Detalle técnico en **[docs/LID.md](docs/LID.md)**.

<h2 id="el-laboratorio">El laboratorio</h2>

<img src="docs/assets/pastel/banner-07.svg" alt="07 · El laboratorio" width="100%">

<img src="docs/assets/pastel/laboratorio.svg" alt="Experimentos de Shin-Lab" width="100%">

Todo lo experimental vive en [**Shin-Lab**](https://github.com/riokuroxi-svg/Shin-Lab).
**Nada migra a este repositorio sin estar probado.**

<h2 id="licencia-y-marca">Licencia y marca</h2>

<img src="docs/assets/pastel/banner-08.svg" alt="08 · Licencia y marca" width="100%">

<img src="docs/assets/pastel/licencia-tabla.svg" alt="Tabla de licencias por capa" width="100%">

<img src="docs/assets/pastel/licencia-reglas.svg" alt="Las cuatro reglas de la licencia" width="100%">

En corto, y por escrito:

- El núcleo es **AGPL-3.0-only**: úsalo, modifícalo y redistribúyelo, pero todo
  derivado sigue siendo AGPL (con su código disponible).
- **La marca no se hereda**: un fork es legítimo, llamarse Shin-MD o usar 反魂 no.
- **La atribución no se borra**: `LICENSE`, `NOTICE` y los encabezados SPDX
  siguen ahí. Puedes **añadir** tu propio copyright; quitar el original no.
- El bot lo comprueba al arrancar: si alguien borra `LICENSE` o `NOTICE`, no
  arranca.

El texto completo de la licencia está en **[LICENSE](LICENSE)** y las condiciones
de marca en **[NOTICE](NOTICE)**. Si tu idea es publicar tu propia versión, la
guía con los pasos exactos es **[docs/FORK.md](docs/FORK.md)**.

<h2 id="créditos">Créditos</h2>

<img src="docs/assets/pastel/banner-09.svg" alt="09 · Créditos" width="100%">

<img src="docs/assets/pastel/creditos.svg" alt="Creador, librería, laboratorio y licencia" width="100%">

<div align="center">

<img src="docs/assets/pastel/pie.svg" alt="Shin-MD · hecho para quedarse encendido" width="100%">

</div>
