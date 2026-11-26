# Cómo instalar Shin-MD, paso a paso

Esta guía es para instalar **desde cero**, sin saber nada de Linux. Se lee de
arriba a abajo. Cada comando va en un bloque que puedes **copiar tal cual**: no
hay nada dentro de una imagen.

> **Antes de empezar.** Usa un número de WhatsApp que **no sea el tuyo**. Un bot
> que responde solo desde tu número personal es la forma más rápida de que te
> bloqueen la cuenta que usas todos los días. Consigue un chip secundario o un
> número virtual.

---

## Índice

1. [Instalar en Android (Termux)](#1-instalar-en-android-termux)
2. [Instalar en una computadora o servidor](#2-instalar-en-una-computadora-o-servidor)
3. [Arrancar y vincular WhatsApp](#3-arrancar-y-vincular-whatsapp)
4. [Que Android no lo mate](#4-que-android-no-lo-mate)
5. [Comprobar que todo está bien](#5-comprobar-que-todo-está-bien)
6. [Actualizar, reparar, desinstalar](#6-actualizar-reparar-desinstalar)
7. [Cuando algo sale mal](#7-cuando-algo-sale-mal)
8. [Cuando algo no va: `shin doctor`](#8-cuando-algo-no-va-shin-doctor)
9. [Que arranque solo (servidor)](#9-que-arranque-solo-servidor)

Si lo que falla es la **actualización**, mira primero
[la sección 7](#7-cuando-algo-sale-mal): el caso más común está explicado
con el mensaje exacto que verás.

> Este documento es para **cualquier** aparato. El caso del teléfono, con todo
> el detalle (wakelock, batería, procesos hijos), está en
> [TERMUX.md](TERMUX.md); el del servidor, en [VPS.md](VPS.md). Aquí no se
> repiten.

---

## 1. Instalar en Android (Termux)

Termux es una terminal de Linux dentro del teléfono. No necesita root.

### 1.1 Instala Termux

Descárgalo de **F-Droid**, no de la Play Store:

<https://f-droid.org/packages/com.termux/>

La versión de Play Store está abandonada desde hace años y sus paquetes no son
compatibles. Si ya la tienes instalada, desinstálala primero.

### 1.2 Abre Termux y actualiza

Toca la pantalla, escribe esto y pulsa Enter. Tarda un rato: es normal.

```bash
pkg update -y && pkg upgrade -y
```

Si en algún momento pregunta algo, deja la opción por defecto (pulsa Enter).

### 1.3 Instala Shin-MD

Copia esta línea, pégala en Termux y pulsa Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.9/shin.sh | sh
```

**Qué hace, en orden:**

| Paso | Qué es |
|---|---|
| `shin.sh` | El arranque de **esa versión concreta**, no de lo último que haya en `main`. |
| descarga | Baja en una carpeta temporal el instalador y su `SHA256SUMS`. |
| huella | Calcula el SHA-256 y lo compara. Si no coincide —archivo cortado, o alguien lo cambió— **no ejecuta nada**. |
| instalador | `--auto`: instala lo que falte, o actualiza, o repara, deja `shin` en el PATH y arranca el bot. |

Lo único que ese esquema no puede comprobar es `shin.sh` mismo, que es de donde
cuelga la cadena. Si quieres comprobarlo también, baja el archivo, míralo y
ejecútalo tú: el README tiene los comandos sueltos en el apartado "modo
auditor".

### 1.4 Qué esperar

Verás algo así, y al final un resumen:

```
  ✓ Node 26.4.0   npm 11.20.0
  ✓ git listo
  ▸ descargando Shin-MD v3.7.9
  ✓ dependencias instaladas
  ✓ 8 parches del conector verificados
  ✓ wakelock activo

╭──────────────────────────────────────────────╮
│  Shin-MD 3.6.0 instalado                     │
╰──────────────────────────────────────────────╯
```

Tarda entre 2 y 10 minutos según el teléfono. Al terminar te dice **la ruta**
donde quedó y el comando exacto para arrancarlo.

---

## 2. Instalar en una computadora o servidor

Sirve para Linux y macOS. Hace falta **Node 22.5 o superior**:

```bash
node -v
```

Si dice menos de 22.5 (o dice "command not found"), instálalo desde
<https://nodejs.org> — versión LTS. Después, el mismo bloque de arriba:

```bash
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.9/shin.sh | sh
```

En un servidor donde quieras que siga corriendo sin tu sesión, mira
[`VPS.md`](VPS.md) (systemd, pm2, tmux).

---

## 2.5 Si falta Node o git

No hay que hacer nada: el instalador mira qué falta y lo resuelve.

| Situación | Qué hace |
|---|---|
| Termux | `pkg install nodejs-lts git` |
| Debian/Ubuntu, Fedora, Alpine, Arch | lo pide al gestor de paquetes **y te pregunta antes** |
| Sin root, o sin terminal (contenedor, `ssh -T`) | no toca el sistema: baja Node oficial de nodejs.org, comprueba la huella, lo deja en `~/.local/opt/node` y añade su `bin` al `PATH` (un bloque marcado, fácil de borrar) |

Si prefieres que nunca instale paquetes del sistema:

```sh
SHIN_NO_INSTALAR=1 curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.9/shin.sh | sh
```

Y si quieres autorizarlo sin que pregunte (para un script de aprovisionamiento):

```sh
SHIN_PERMITIR_PAQUETAS=1 curl … | sh
```

## 3. Arrancar y vincular WhatsApp

```bash
shin --code
```

Aparece el panel y, debajo, un **código de 8 caracteres** en su propia caja:

```
╭ tu código ─────────────────────────────────────────────╮
│                                                        │
│                escríbelo en el teléfono                │
│                                                        │
│                   A B C D - 1 2 3 4                    │
│                                                        │
│     caduca en ~60 s · si expira, vuelve a arrancar     │
│                                                        │
╰────────────────────────────────────────────────────────╯

  cuenta: 5215512345678
  1. abre WhatsApp en ese teléfono
  2. Ajustes › Dispositivos vinculados
  3. Vincular un dispositivo › con número
  4. teclea el código de arriba
```

En WhatsApp: **Ajustes → Dispositivos vinculados → Vincular un dispositivo →
Vincular con número de teléfono**, y tecleas el código.

```
╭ tu código ─────────────────────────────────────────────╮
│                   A B C D - 1 2 3 4                    │
╰────────────────────────────────────────────────────────╯

╭ en línea ──────────────────────────────────────────────╮
│ cuenta   Shin-MD                                       │
│ versión  v3.7.9                                        │
│ comandos 213                                           │
│ prefijo  .                                             │
│ panel    http://127.0.0.1:3000                         │
╰────────────────────────────────────────────────────────╯
```

**El panel de arriba no se mueve nunca**, aunque el bot se caiga o reinicie.
Debajo va saliendo lo que hace. Teclas: `r` reinicia, `q` o `Ctrl+C` sale.

Si alguna vez `Ctrl+C` no basta, añade `--force` al final del comando.

### ¿Por qué no hay QR?

Porque no funciona donde de verdad se instala esto: en la pantalla de un móvil
(Termux) el QR no cabe y sale partido, y partido no hay quien lo escanee. El
código de 8 caracteres se teclea y funciona igual en un teléfono, en un VPS y
en un contenedor. `--qr` se sigue aceptando por si algún guion viejo lo usa,
pero hace exactamente lo mismo que `--code` y avisa de que ya no hace falta.

### El número se pregunta una sola vez

La pregunta la hace **la consola**, no el bot, y esto no es un detalle: el bot
se lanza con la entrada cerrada para que el panel sea lo único que escribe en
pantalla, así que dentro del bot no hay dónde preguntar. Por eso `shin` te pide
el número antes de arrancar nada y se lo pasa ya resuelto.

Después, ese número queda en la sesión y no se vuelve a preguntar. Si algún día
quieres vincular otro, `shin --code` (o `shin --menu`) fuerza la pregunta.

| Situación | Qué hace |
| --- | --- |
| Primera vez, con terminal | Pregunta el número y enseña el código |
| Ya hay sesión buena | No pregunta nada |
| Servicio, contenedor o `nohup` | **No arranca**: se detiene y dice la orden exacta |
| Número en `--code 521…` o `PAIRING_NUMBER` | No pregunta; lo usa |

En la última fila de la tabla está la clave para un VPS sin terminal:

```bash
PAIRING_NUMBER=5215512345678 shin
```

Y si sospecha que la sesión quedó a medias (un corte durante la vinculación,
un `auth.db` copiado de otro sitio), lo dice con esas palabras en vez de
arrancar y pedir un QR.

---

## 4. Que Android no lo mate

Android cierra procesos en segundo plano cuando necesita memoria. Si no haces
esto, el bot se apaga solo a las horas y parece que "se rompió":

1. **Notificación de Termux → Acquire wakelock.** Se queda fija y evita que
   Android duerma el proceso.
2. **Ajustes → Apps → Termux → Batería → Sin restricciones.**
3. **Android 14 o superior:** Ajustes → Opciones de desarrollador →
   **Desactivar restricciones de procesos hijos**.

Este último es el que casi nadie hace y es el culpable de la mayoría de las
muertes silenciosas en Android 14+.

---

## 5. Comprobar que todo está bien

```bash
cd ~/Shin-MD && bash install.sh --verify
```

Comprueba la instalación sin tocar nada. Y desde WhatsApp, estos comandos te
dicen mucho:

| Comando | Qué te dice |
|---|---|
| `.health` | el riesgo de ban ahora mismo |
| `.status` | memoria, tiempo encendido, grupo |
| `.ping` | si responde y cuánto tarda |
| `.owner` | tu contacto con el crédito del bot |

---

## 6. Actualizar, reparar, desinstalar

Una sola regla: **tus datos nunca se tocan**. `.env`, `Sessions/` y `data/`
sobreviven a todo menos a `--purge`, que pregunta dos veces.

| Quiero… | Comando |
|---|---|
| actualizar conservando mi sesión | `cd ~/Shin-MD && bash install.sh --update` |
| pasar a una versión concreta | `bash install.sh --update --version v3.7.9` |
| seguir la rama `main` y dejar de estar fijado a una versión | `bash install.sh --update --branch main` |
| arreglar una instalación rota | `bash install.sh --repair` |
| saber si todo está bien | `bash install.sh --verify` |
| desinstalar guardando mis datos | `bash install.sh --uninstall` |
| desinstalar y borrar TODO | `bash install.sh --uninstall --purge` |

Si instalaste con `--version`, el instalador **no te mueve solo** al actualizar:
te avisa y te pide con cuál de las dos opciones quieres seguir. Es a propósito —
tú decides cuándo cambias de versión.

---

## 7. Cuando algo sale mal

### `npm start` dice "ENOENT: no such file or directory, open 'package.json'"

Estás fuera de la carpeta. Los comandos de npm hay que lanzarlos **dentro** de
`~/Shin-MD`:

```bash
cd ~/Shin-MD && npm start
```

### `Missing script: "panel"` o `Missing script: "vigia"`

La instalación es más vieja que el comando. Actualiza:

```bash
cd ~/Shin-MD && bash install.sh --update --version v3.7.9
```

### "Node 20 es demasiado antiguo"

```bash
pkg install -y nodejs-lts
node -v
```

Vuelve a ejecutar el instalador.

### El bot arranca, pero no responde a `.menu`

Suele ser el número del dueño. En `~/Shin-MD/.env` tiene que estar **tu número**
(el de tu WhatsApp personal, el que escribe), en el formato largo de México:

```
OWNER_NUMBER=5215574370307
```

Solo dígitos, sin `+`, sin espacios, sin guiones. Después: `npm start`.

### Un mensaje sale como "no compatible con tu versión"

No es un fallo del bot: es tu WhatsApp que no entiende ese tipo de mensaje.
Escribe **`.compat`** en un chat contigo (solo funciona en privado): manda
cuatro mensajes numerados y el que salga mal es el culpable.

### Se reinicia solo en bucle

El panel te lo dice: `● SE CAYÓ` y luego vuelve a `ACTIVO`. Si se cae **cinco
veces en dos minutos**, el vigía se rinde a propósito (`● RENDIDO`) y se para:
eso ya no lo arregla reiniciar. Mira el error:

```bash
tail -f ~/Shin-MD/logs/*.log
```

### Al actualizar dice «No se pudo consultar el repositorio (¿sin conexión?)»

Con internet funcionando. En la 3.7.8 y anteriores ese mensaje culpaba a la red
sin comprobarlo, y se comía el error real de git. Desde la **3.7.8** el
instalador reintenta tres veces (la segunda por HTTP/1.1, porque en datos
móviles el HTTP/2 se corta) y, si aun así falla, **te enseña lo que dijo git** y
traduce el motivo: DNS, certificados, credenciales, `git` sin HTTPS o la red
cortando la transferencia.

Si estás en una versión anterior y ves ese mensaje, actualiza primero:

```bash
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.9/shin.sh | sh
```

Y si el error real resulta ser `would clobber existing tag`, es que el proyecto
rehízo una etiqueta: `git -C ~/Shin-MD fetch --tags --force origin` lo resuelve,
y es exactamente lo que hace el instalador nuevo.

### Nada de esto funciona

```bash
cd ~/Shin-MD && bash install.sh --verify
```

Y si sigue igual, `bash install.sh --repair` reconstruye las dependencias sin
tocar tus datos.

---

## 8. Cuando algo no va: `shin doctor`

```sh
shin doctor
```

Imprime, sin cambiar nada, todo lo que hace falta para diagnosticar: plataforma,
versiones, de dónde salió Node, si los módulos y los parches del conector están,
cuánto ocupa la sesión, espacio libre, si el bot corre y si hay servicio de
systemd. Del `.env` solo dice cuántas claves tiene, nunca su contenido.

## 9. Que arranque solo (servidor)

```sh
shin service            # systemd, con arranque automático
shin service --print    # ver la unidad antes de escribirla
shin service --user     # servicio de usuario (sin root) + aviso de linger
```

Después: `systemctl status shin-md` y `journalctl -u shin-md -f`.
