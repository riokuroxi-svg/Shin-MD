# Shin-MD en Termux (Android)

Guía para dejar el bot corriendo en el teléfono. Está escrita para alguien que
nunca ha usado una terminal: cada comando se pega tal cual.

> **Estado real, sin adornos.** Esto se escribió sin un Android delante. El
> instalador se probó simulando Termux (`PREFIX`, `TERMUX_VERSION` y un `pkg`
> que registra las llamadas) con bash, git y npm reales en Linux. Los nombres
> de los paquetes (`nodejs-lts`, `ffmpeg`, `yt-dlp`, `termux-tools`) están
> contrastados con la documentación de Termux, pero **que instalen bien en tu
> teléfono está pendiente de tu prueba**. La palabra "compatible" todavía no
> está ganada.

## Antes de empezar

| Cosa | Cuánto |
|---|---|
| Android | 7.0 o superior |
| Arquitectura | arm64 (casi todos), armv7 o x86_64 |
| Espacio libre | unos 1,5 GB (dependencias incluidas) |
| RAM | 2 GB; con 4 GB el bot respira mejor |
| Número de teléfono | **uno secundario**, nunca el tuyo de siempre |

## 1. Instalar Termux

Descárgalo de [F-Droid](https://f-droid.org/packages/com.termux/). La versión
de Play Store está sin mantenimiento desde hace años y sus paquetes están
congelados: con ella, `pkg install` falla o instala Node viejo.

## 2. Abrir y pegar un comando

```bash
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.9/shin.sh | sh
```

Ese archivo descarga el instalador de esa versión concreta y **comprueba su
huella** antes de ejecutarlo: si el archivo no es el que se publicó, no se
ejecuta nada. Como llega por una tubería, el propio arranque se baja primero
`SHA256SUMS` y compara. Si prefieres leerlo antes tú mismo, el README tiene el
"modo auditor" con los comandos sueltos.

El instalador hace esto, en orden, y se detiene en el primer problema:

1. Detecta que está en Termux y qué arquitectura tiene el teléfono.
2. Instala `git` y `nodejs-lts` si faltan. Si ya tienes un Node 22.5 o más
   reciente, **no lo toca ni lo degrada**.
3. Instala `ffmpeg` y `yt-dlp` para multimedia y descargas (si tu repositorio
   llama al segundo `python-yt-dlp`, prueba ese). Si ninguno aparece, avisa y
   sigue: el bot arranca igual.
4. Clona el proyecto en `~/Shin-MD`.
5. Instala las dependencias con `npm ci` (reproducible, desde el lockfile).
6. Comprueba que los **ocho parches** del conector están puestos, que los
   módulos clave están y que la carpeta se puede escribir.
7. Pide el wakelock y te dice cómo arrancar.

Si algo falla a medias, **nada queda marcado como instalado**: vuelves a
ejecutar el mismo comando y continúa donde se quedó.

## 3. Que Android no lo mate

Este es el paso que casi nadie documenta y el que hace que un bot "se caiga"
sin motivo. Android 12 y posteriores matan procesos en segundo plano que no
lanzó el sistema. Cuando eso pasa, Termux muestra `[Process completed (signal 9)]`
y el bot desaparece.

1. **Wakelock.** Baja la notificación de Termux y toca *Acquire wakelock*. Hay
   que volver a activarlo cada vez que reinicies el teléfono.
2. **Batería.** Ajustes de Android → Batería → Termux → *Sin restricciones*.
   En Xiaomi, OPPO, Vivo o Huawei hay además un "ahorro de batería" propio del
   fabricante que hay que desactivar aparte.
3. **Android 14 o superior.** Opciones de desarrollador → *Desactivar
   restricciones de procesos hijos*.
4. **Android 12 o 13.** No hay interruptor en Ajustes. El único remedio es un
   comando ADB desde un ordenador (`adb shell settings put global
   max_phantom_processes 2147483647`) o mantener la pantalla/el foco en Termux.
   Si no tienes ordenador, asúmelo: el bot vivirá mientras uses el teléfono.

Con eso puesto, [problema de Termux #2366](https://github.com/termux/termux-app/issues/2366)
es el hilo de referencia.

## 4. Arrancar y vincular

```bash
cd ~/Shin-MD && npm start
```

Eso levanta el bot y dibuja el panel: arriba el estado (grupos, memoria, disco,
batería, la dirección del panel web) y debajo lo que va diciendo el bot. El
panel no se mueve aunque el bot se reinicie, y `Ctrl+C` lo para todo.

- **Con código:** `npm run start:code`. WhatsApp → *Dispositivos vinculados* →
  *Vincular con número de teléfono* → mete el código de 8 caracteres que te
  enseña el panel. El bot te pregunta el número una sola vez.
- **No hay QR**: en la pantalla de un móvil no cabe y sale partido, así que la
  vinculación es siempre por código.

Para detenerlo: `Ctrl+C`. En Termux, `Ctrl` está en la fila de teclas extra.

### Que se reinicie solo

`npm start` ya lo hace: vigila al bot mientras te enseña el panel. Si escribes
`.restart` en WhatsApp, el bot vuelve a arrancar sin que toques el teléfono. Si
se cae por lo que sea (memoria, un plugin que explota), lo levanta otra vez,
esperando 1, 2, 4, 8 y 15 segundos entre intentos para no entrar en un bucle.

Si se cae **cinco veces en dos minutos**, se rinde y lo dice en la terminal:
reiniciar ya no arregla nada, hay que leer el error. Ahí es donde tienes que
mirar el log:

```bash
tail -f ~/Shin-MD/logs/*.log
```

En el panel lo ves sin hacer nada: pasa a `SE CAYÓ · lo levanto solo en un
momento` y luego vuelve a `ACTIVO`, con el contador `⟳` a la derecha.

Si quieres el bot **sin** panel (por ejemplo, para dejarlo con `nohup` o en un
VPS), lo mismo pero sin dibujo:

```bash
cd ~/Shin-MD && npm run vigia -- --code
```

El vigía no esquiva a Android. Si el sistema mata el proceso entero, se mueren
los dos. Para eso sirven los ajustes del punto 3.

### Mirar cómo está, sin abrir WhatsApp

```bash
npm run panel
```

Dibuja dos cajas. La primera es el bot: si está activo, cuánto lleva encendido,
memoria, cola de envíos, riesgo, grupos y versión; esa sale del panel local
(`127.0.0.1:3000`), así que necesita el bot arrancado. La segunda es el
teléfono: modelo, versión de Android, batería con su temperatura, memoria del
sistema y disco libre; esa se lee del propio Android ( `/sys`, `/proc`,
`/system/build.prop` ) y sale aunque el bot esté parado.

Con `npm run panel:vivir` se refresca cada dos segundos hasta que pulses
`Ctrl+C`. Es de solo lectura: no manda mensajes, no toca la sesión, no expone
nada hacia fuera. Todo lo que enseña es de la máquina donde lo ejecutas.

## 5. Actualizar, reparar, desinstalar

```bash
bash ~/Shin-MD/install.sh --update      # trae la versión nueva, conserva tus datos
bash ~/Shin-MD/install.sh --repair      # reconstruye dependencias si algo se rompió
bash ~/Shin-MD/install.sh --verify      # dice si está todo bien
bash ~/Shin-MD/install.sh --uninstall   # quita el proyecto y deja tus datos al lado
```

Antes de actualizar, el instalador copia `.env`, `Sessions/` y `data/` a
`~/Shin-MD/backups/`. Si la versión nueva no arranca, vuelve solo a la anterior
y te lo dice. Nunca ejecuta `git reset --hard` ni borra archivos que no sean suyos.

## 6. Cuando algo va mal

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| `[Process completed (signal 9)]` | Android mató el proceso | wakelock + batería sin restricciones (paso 3) |
| `Node 20.x es demasiado antiguo` | la Termux de Play Store trae Node viejo | F-Droid + `pkg install -y nodejs-lts` |
| `pkg: command not found` | PATH tocado | `export PATH=$PREFIX/bin:$PATH` |
| `E: Unable to locate package` | lista de paquetes vieja o espejo caído | `pkg update -y`; si sigue, `termux-change-repo` |
| `ENOSPC` al instalar | sin espacio | `pkg clean` y libera 1,5 GB |
| Se corta al vincular con datos móviles | red inestable | es lo que el bot ya tolera: no borra la sesión, reintenta solo |
| `conector: los parches NO están completos` | instalación a medias | `bash ~/Shin-MD/install.sh --repair` |

El instalador nunca pide contraseñas ni tokens, y no escribe credenciales en
ningún registro.

## 7. Si Termux se te queda corto

Cuando el teléfono no da (RAM justa, Android muy agresivo, dependencias que no
compilan), hay un camino intermedio: **proot-distro con Ubuntu dentro de Termux**.

```bash
pkg install -y proot-distro
proot-distro install ubuntu
proot-distro login ubuntu
# dentro de Ubuntu:
apt update && apt install -y curl git
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/main/install.sh -o install.sh
bash install.sh
```

Ventajas: binarios glibc normales (el `yt-dlp` oficial funciona sin trucos) y
el killer de procesos fantasma afecta menos. Desventaja: ~1 GB más y hay que
entrar con `proot-distro login ubuntu` cada vez.

## Estado de cada pieza

| Pieza | Comprobado | Cómo |
|---|---|---|
| Detección de Termux y ARM64 | sí | simulación (`PREFIX`, `uname`) |
| Nombres de paquetes `pkg` | sí | documentación de Termux |
| `pkg install nodejs-lts` real | **no** | pendiente de tu teléfono |
| `pkg install ffmpeg` / `yt-dlp` real | **no** | pendiente |
| `termux-wake-lock` real | **no** | pendiente; el comando viene de `termux-tools`, que ya está instalado de serie |
| `sharp` wasm32 en Android | parcial | simulé `platform=android` en Linux; falta el dispositivo |
| Persistencia en segundo plano | **no** | depende de Android, no del bot |
| Vinculación por código | **no** | requiere WhatsApp real |

## Lo que falta comprobar en tu teléfono

- [ ] `pkg install -y nodejs-lts` deja un Node ≥ 22.5.
- [ ] `npm ci` termina sin compilar nada nativo (sharp usa wasm).
- [ ] El bot sobrevive una hora en segundo plano con el wakelock.
- [ ] La vinculación por código funciona con la sesión guardada en `auth.db`.
- [ ] `yt-dlp` y `ffmpeg` de Termux responden (`yt-dlp --version`, `ffmpeg -version`).

Si algo de esta lista falla, el mensaje exacto sirve para arreglarlo: el
instalador está hecho para decodificar errores, no para esconderlos.
