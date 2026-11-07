# El instalador: qué hace, qué no toca y cómo se recupera

`install.sh` es el único punto de entrada. Sirve para instalar, actualizar,
reparar, verificar y desinstalar, y funciona igual en Termux que en un servidor
Linux. No necesita nada del repositorio para empezar: se descarga, se lee y se
ejecuta.

```bash
curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/main/install.sh -o install.sh
bash install.sh
```

## Las cinco acciones

| Comando | Qué hace | Qué toca |
|---|---|---|
| `bash install.sh` | instala; si ya hay una, **actualiza** | proyecto y dependencias |
| `--update` | trae los commits nuevos y reinstala dependencias | código; tus datos quedan donde están |
| `--repair` | borra `node_modules` y lo reconstruye desde el lockfile | solo dependencias |
| `--verify` | comprueba archivos, módulos y los ocho parches | nada (solo lee) |
| `--uninstall` | quita el proyecto y **mueve** tus datos a un lado | proyecto |

Opciones: `--dir RUTA` (otra carpeta), `--yes` (sin preguntas), `--shallow`
(clon sin historial: más rápido, pero impide volver a una versión anterior),
`--no-boost` (no pedir el wakelock en Termux).

## Dónde queda cada cosa

```
~/Shin-MD/
├── .env              ← tu configuración      (nunca se sobrescribe)
├── Sessions/Owner/   ← la sesión de WhatsApp (nunca se toca)
│   └── auth.db
├── data/shin.db      ← tu base de datos      (nunca se toca)
├── backups/          ← copias hechas antes de actualizar o reparar
└── .shin-install     ← marca de "instalación completa"
```

Esa marca es la que evita el error más caro: una instalación a medias
(`Ctrl+C`, corte de luz, npm que falla) **no** parece una instalación buena.
Se escribe al final, con un renombrado atómico.

## Cómo se recupera de cada desastre

| Situación | Qué pasó | Cómo se arregla |
|---|---|---|
| Falló `npm ci` | no hay dependencias | vuelve a ejecutar el instalador; continúa donde estaba |
| Falló el postinstall | el conector quedó incompleto | el instalador lo detecta y no marca la instalación como buena; `--repair` |
| `Ctrl+C` a mitad | clon descargado, sin dependencias | otra pasada reutiliza el clon y termina |
| La versión nueva no arranca | `--update` trae algo roto | el instalador **vuelve solo** al commit anterior y te avisa |
| El bot dejó de funcionar | dependencias corruptas | `--repair` (tus datos no están en `node_modules`) |
| Quieres empezar de cero | — | `--uninstall` guarda tus datos al lado; luego reinstalas |

## Antes de borrar algo

Todo lo que elimina pasa por una sola función, y no hay ningún `rm -rf` fuera
de ella. Antes de tocar el disco:

1. Resuelve la ruta real (enlaces simbólicos y `..` incluidos).
2. Rechaza `/`, `/home`, `/usr`, `/etc`, `/bin`, `/var`, `/opt`, `/system`,
   `/data`, `/storage` y compañía.
3. Rechaza tu carpeta personal entera.
4. Rechaza borrar un directorio que contenga al propio instalador.
5. Rechaza cualquier ruta que contenga algo de `SHIN_NO_BORRAR`.
6. Se niega si el objetivo es un enlace simbólico.
7. **Te enseña la ruta absoluta antes de borrar.**

Para llegar a ese punto, una acción destructiva exige saber sobre qué
instalación actúa (la carpeta desde la que ejecutas o la que indiques con
`--dir`, nunca una supuesta), que el `package.json` diga `shin-md` y que la
carpeta sea un clon con `.git`.

`--purge` no se conforma con `--yes`: hay que escribir **borrar todo**. Es la
única acción irreversible de todo el instalador.

## Integridad: la versión que instalas es la que se publicó

`main` cambia. Una release, no:

```bash
curl -fsSL .../releases/download/v3.2.1/install.sh -o install.sh
curl -fsSL .../releases/download/v3.2.1/SHA256SUMS -o SHA256SUMS
sha256sum -c SHA256SUMS        # → install.sh: OK
bash install.sh --version v3.2.1
```

Si alguien modificara el archivo en el camino, `sha256sum` dice `FAILED` y ahí
se acaba. La huella se regenera con `npm run firma` y se comprueba con
`npm run firma:check`; una prueba falla si se olvida regenerarla.

## Lo que el instalador no hace, nunca

- No ejecuta `git reset --hard` ni `git clean -fdx`.
- No borra `.env`, `Sessions/`, `session/` ni `data/` en `--update` ni en `--repair`.
- No toca un archivo del usuario: si hay cambios propios en archivos del
  proyecto, `--update` se niega y te dice cómo mirarlos.
- No actúa sobre una carpeta que no sea Shin-MD. Antes de actualizar,
  reparar o desinstalar comprueba el `name` de `package.json`; y si no sabe
  desde dónde se ejecuta, se detiene en vez de suponer `~/Shin-MD`.
- No pide contraseñas ni tokens, y no escribe credenciales en pantalla.

`--uninstall --purge` sí borra los datos, pero es la única forma de hacerlo y
avisa antes de empezar.

## Variables de entorno

Tres, todas opcionales:

| Variable | Para qué |
|---|---|
| `SHIN_REPO_URL` | clonar desde otro repositorio o un espejo (lo usan las pruebas) |
| `SHIN_INSTALL_DIR` | carpeta exacta del proyecto |
| `SHIN_INSTALL_ROOT` | carpeta base; el proyecto va en `$SHIN_INSTALL_ROOT/Shin-MD` |

## Cómo se prueba

`test/instalador.test.js` ejecuta el instalador real treinta y dos veces en carpetas
temporales, con bash, git y npm de verdad. Lo que no se puede tener aquí se
simula por el mismo camino que usaría el sistema:

- **Termux**: `PREFIX` y `TERMUX_VERSION` con un `pkg` de mentira que apunta lo
  que se le pide instalar.
- **npm que falla**: un `npm` de dos líneas en el `PATH`.
- **Ctrl+C**: `SIGINT` al grupo de procesos, igual que lo manda una terminal.

Cubre, además de lo anterior: protección de rutas (`/`, `$HOME`, `/usr`, `/etc`), enlaces simbólicos, carpetas que se hacen pasar por Shin-MD, `SHIN_NO_BORRAR`, disco lleno, permisos, `--version`, y que `SHA256SUMS` no se desincronice. Y en general: detección de Termux y de arquitectura, rechazo de Node y npm viejos,
instalación limpia, no duplicar instalaciones, no pisar una carpeta ajena,
fallo de npm, fallo del postinstall, actualización conservando los datos,
respeto a los cambios propios, reparación, desinstalación con y sin `--purge`,
protección contra borrar proyectos ajenos e interrupción con `Ctrl+C`.

Cada prueba comprueba antes de arrancar que trabaja dentro de `os.tmpdir()`, y
ejecuta siempre el `install.sh` de la instalación bajo prueba, nunca el del
repositorio desde el que corre.
