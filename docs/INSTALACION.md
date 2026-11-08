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

Copia el bloque entero, pégalo en Termux y pulsa Enter:

```bash
d=$(mktemp -d) && cd "$d" && curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.5.1/install.sh -o install.sh && curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.5.1/SHA256SUMS -o SHA256SUMS && sha256sum -c SHA256SUMS && bash install.sh --version v3.5.1
```

**Qué hace, en orden:**

| Paso | Qué es |
|---|---|
| `d=$(mktemp -d)` | Crea una carpeta temporal y entra en ella. No ensucia tu casa. |
| `curl ... install.sh` | Descarga el instalador **de esa versión concreta**, no de lo último que haya. |
| `curl ... SHA256SUMS` | Descarga la huella del archivo. |
| `sha256sum -c` | Comprueba que el instalador es **exactamente** el que se publicó. Si no coincide, se para aquí. |
| `bash install.sh` | Ejecuta la instalación. |

Ese `&&` no es decoración: si cualquier paso falla, los siguientes **no** se
ejecutan. No vas a instalar un archivo a medio descargar.

### 1.4 Qué esperar

Verás algo así, y al final un resumen:

```
  ✓ Node 26.4.0   npm 11.20.0
  ✓ git listo
  ▸ descargando Shin-MD v3.5.1
  ✓ dependencias instaladas
  ✓ 8 parches del conector verificados
  ✓ wakelock activo

╭──────────────────────────────────────────────╮
│  Shin-MD 3.5.0 instalado                     │
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
d=$(mktemp -d) && cd "$d" && curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.5.1/install.sh -o install.sh && curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.5.1/SHA256SUMS -o SHA256SUMS && sha256sum -c SHA256SUMS && bash install.sh --version v3.5.1
```

En un servidor donde quieras que siga corriendo sin tu sesión, mira
[`VPS.md`](VPS.md) (systemd, pm2, tmux).

---

## 3. Arrancar y vincular WhatsApp

```bash
cd ~/Shin-MD && npm start -- --code
```

Aparece el panel y, debajo, un **código de 8 dígitos**. En WhatsApp:

**Ajustes → Dispositivos vinculados → Vincular un dispositivo → Vincular con
número de teléfono**

Y tecleas el código. Si prefieres QR: `npm start -- --qr`.

```
╭ SHIN-MD 3.5.1 ──────────────────────────────────────╮
│ ● ACTIVO  0 grupos  ↑ 1m  pid 4242                   │
│ web http://127.0.0.1:3000                            │
╰──────────────────────────────────────────────────────╯
 ✓ Bot listo ✓
 ● Grupos: 12
```

**El panel de arriba no se mueve nunca**, aunque el bot se caiga o reinicie.
Debajo va saliendo lo que hace. Teclas: `r` reinicia, `q` o `Ctrl+C` sale.

Si alguna vez `Ctrl+C` no basta, añade `--force` al final del comando.

### ¿Por qué `--code` y no QR?

El QR no cabe en la pantalla de muchos móviles y en Termux se ve cortado. El
código de 8 dígitos se teclea y no tiene ese problema. Si eliges QR, usa
`npm start -- --qr` en una ventana ancha o con `npm run vigia -- --qr`, que lo
imprime sin panel.

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
| pasar a una versión concreta | `bash install.sh --update --version v3.5.1` |
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
cd ~/Shin-MD && bash install.sh --update --version v3.5.1
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

### Nada de esto funciona

```bash
cd ~/Shin-MD && bash install.sh --verify
```

Y si sigue igual, `bash install.sh --repair` reconstruye las dependencias sin
tocar tus datos.
