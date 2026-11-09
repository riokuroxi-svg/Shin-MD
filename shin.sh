#!/usr/bin/env sh
# ═══════════════════════════════════════════════════════════════════
#  Shin-MD — arranque en un comando
#  https://github.com/riokuroxi-svg/Shin-MD
#  Copyright (C) 2026 riokuroxi-svg · SPDX-License-Identifier: AGPL-3.0-only
#
#    curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/v3.7.1/shin.sh | sh
#
#  Eso es todo. No hace falta `pkg update`, ni descargar tres archivos,
#  ni comprobar huellas a mano, ni `cd`, ni `npm start`.
#
#  QUÉ HACE, EN ORDEN
#    1. Mira dónde está corriendo (Termux, Linux, Alpine, macOS, WSL,
#       contenedor) y con qué arquitectura.
#    2. Descarga el instalador de SU MISMA versión, probando varios
#       espejos y reintentando si la red falla a medias.
#    3. Comprueba la huella SHA-256. Si no coincide, NO ejecuta nada.
#    4. Ejecuta el instalador en modo autónomo: instala lo que falte
#       (Node, git), actualiza o repara, deja el comando `shin` en el
#       PATH y arranca el bot.
#
#  POR QUÉ ESTÁ ESCRITO EN `sh` Y NO EN `bash`
#    Porque quien escribe `curl … | sh` está pidiendo sh, y en Alpine,
#    Debian o un contenedor mínimo `sh` no es bash. Este archivo no usa
#    nada que no esté en POSIX: ni arrays, ni `[[ ]]`, ni `local`.
#    Se prueba con dash y con busybox ash, no solo con bash.
#
#  VARIABLES
#    SHIN_VERSION=vX.Y.Z     usar otra etiqueta
#    SHIN_REPO=usuario/repo  otro repositorio (forks)
#    SHIN_BASE_URL=URL       un espejo concreto (incluye file:// para probar)
#    SHIN_MIRRORS="a b"      lista de espejos, en orden
#    SHIN_SIN_ARRANQUE=1     instalar/actualizar sin arrancar el bot
#    SHIN_DRY_RUN=1          comprobar y contar lo que haría, sin ejecutar
#    NO_COLOR=1              sin colores
#
#  ARGUMENTOS
#    Todo lo que no entienda se lo pasa al instalador, así que
#    `… | sh -s -- --code` arranca pidiendo el código de vinculación y
#    `… | sh -s -- --dir /otra/ruta` instala en otro sitio.
#    `--help` lo explica; `--version vX.Y.Z` fija la versión.
#
#  LO QUE ESTE ARCHIVO NO PUEDE HACER
#    Comprobarse a sí mismo: la huella que trae la cadena está en
#    SHA256SUMS y protege al instalador. Quien quiera auditarlo, que lo
#    baje y lo lea antes (`curl -o shin.sh … && less shin.sh`); el README
#    lo tiene explicado en el apartado "modo auditor".
# ═══════════════════════════════════════════════════════════════════
set -eu

readonly VERSION="${SHIN_VERSION:-v3.7.1}"
REPO="${SHIN_REPO:-riokuroxi-svg/Shin-MD}"

# ─────────────────────────── salida ───────────────────────────
# Color solo si hay terminal de verdad, nadie lo ha prohibido y el
# terminal no es tonto. Redirigir a un archivo nunca debe meter códigos
# de escape dentro de un log.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ] && [ -z "${SHIN_SIN_COLOR:-}" ]; then
  R=$(printf '\033[0m'); RO=$(printf '\033[38;5;205m'); GR=$(printf '\033[38;5;245m')
  RJ=$(printf '\033[38;5;203m'); VD=$(printf '\033[38;5;114m'); AM=$(printf '\033[38;5;221m')
  NG=$(printf '\033[1m')
else
  R=""; RO=""; GR=""; RJ=""; VD=""; AM=""; NG=""
fi

paso()  { printf '\n%s▸ %s%s\n' "$RO$NG" "$*" "$R"; }
bien()  { printf '  %s✓%s %s\n' "$VD" "$R" "$*"; }
dato()  { printf '  %s·%s %s\n' "$GR" "$R" "$*"; }
aviso() { printf '  %s!%s %s\n' "$AM" "$R" "$*" >&2; }
morir() { printf '\n  %s✗ %s%s\n\n' "$RJ" "$*" "$R" >&2; exit 1; }

hay() { command -v "$1" >/dev/null 2>&1; }

ayuda() {
  # Heredoc sin comillas: así la URL sale con la versión de ESTE archivo y
  # no con una copia escrita a mano que se queda vieja al publicar.
  cat <<AYUDA
Shin-MD — instalación y arranque en un comando.

  curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/${VERSION}/shin.sh | sh

Opciones que entiende este archivo:
  -h, --help            esta ayuda
  --version vX.Y.Z      usar otra etiqueta (por defecto, la de este archivo)
  --dry-run             comprobar la huella y decir qué haría, sin ejecutar

Cualquier otra opción se pasa al instalador: --dir RUTA, --code,
--no-arrancar, --branch RAMA, --repair, --uninstall, --doctor, --service…

Ejemplos:
  … | sh -s -- --code                 instala y arranca pidiendo el código
  … | sh -s -- --dir ~/mi-bot         instala en otra carpeta
  … | sh -s -- --no-arrancar          deja todo listo, sin arrancar nada
  SHIN_VERSION=v3.6.0 … | sh          instala una versión concreta

Variables: SHIN_VERSION, SHIN_REPO, SHIN_BASE_URL, SHIN_MIRRORS,
SHIN_SIN_ARRANQUE, SHIN_DRY_RUN, NO_COLOR.
AYUDA
}

# ─────────────────────── dónde estamos ───────────────────────
# No es decoración: de aquí salen las decisiones que importan (Termux
# necesita `pkg`, Alpine necesita apk, macOS necesita otro paquete de
# Node, y en un contenedor no hay systemd).
detectar_entorno() {
  SO="$(uname -s 2>/dev/null || echo desconocido)"
  ARQ_CRUDA="$(uname -m 2>/dev/null || echo desconocida)"
  case "$ARQ_CRUDA" in
    aarch64|arm64)      ARQ="arm64" ;;
    armv7l|armv8l|arm)  ARQ="armv7" ;;
    x86_64|amd64)       ARQ="x86_64" ;;
    i686|i386)          ARQ="x86" ;;
    *)                  ARQ="$ARQ_CRUDA" ;;
  esac

  DISTRO=""
  if [ -r /etc/os-release ]; then
    DISTRO="$(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/os-release 2>/dev/null | head -n1)"
  fi

  ENTORNO="$SO"
  case "${PREFIX:-}" in
    */com.termux/*) ENTORNO="Termux (Android)" ;;
  esac
  if [ -n "${TERMUX_VERSION:-}" ]; then ENTORNO="Termux (Android)"; fi
  case "$SO" in
    Darwin) ENTORNO="macOS" ;;
    Linux)
      if [ -n "$DISTRO" ]; then ENTORNO="$DISTRO"; fi
      if grep -qi microsoft /proc/version 2>/dev/null; then ENTORNO="WSL ($ENTORNO)"; fi
      ;;
  esac
  if [ -f /.dockerenv ] || [ -f /run/.containerenv ]; then
    ENTORNO="$ENTORNO · contenedor"
  fi

  MUSL=0
  if [ -f /lib/ld-musl-x86_64.so.1 ] || [ -f /lib/ld-musl-aarch64.so.1 ] \
     || [ -f /lib/libc.musl-x86_64.so.1 ] || [ -f /lib/libc.musl-aarch64.so.1 ]; then
    MUSL=1
  fi
  TERMUX=0
  case "$ENTORNO" in Termux*) TERMUX=1 ;; esac
}

# ─────────────────────── descargar ───────────────────────
# Un `curl -fsSL` a secas falla si el otro lado tiene un mal minuto, y
# en datos móviles eso pasa a diario. Se reintenta con espera creciente
# (1 s, 2 s, 4 s) solo cuando el fallo puede ser pasajero: un 404 no se
# reintenta, porque no va a aparecer por insistir.
INTENTOS="${SHIN_INTENTOS:-4}"
ESPERA_BASE="${SHIN_ESPERA:-1}"

_pedir() {  # $1 url, $2 destino; 0 bien · 1 reintentar · 2 definitivo · 3 sin herramientas
  _codigo="000"
  _rc=0
  if hay curl; then
    _codigo="$(curl -sSL --connect-timeout 20 --max-time 900 --retry 0 \
                 -o "$2" -w '%{http_code}' "$1" 2>/dev/null)" || _rc=$?
  elif hay wget; then
    if wget -q -T 20 -O "$2" "$1" >/dev/null 2>&1; then _codigo="200"; else _rc=1; fi
  else
    return 3
  fi
  [ -n "$_codigo" ] || _codigo="000"
  # curl sale con 0 aunque el servidor conteste 404 (sin -f no hay error
  # HTTP), así que el código de respuesta se mira aparte. Y cuando no hay
  # HTTP de por medio —un archivo local, un espejo file://— el código es
  # 000 y lo que vale es que curl haya salido bien.
  case "$_rc" in
    0) case "$_codigo" in
         2*)   return 0 ;;
         000)  return 0 ;;
       esac ;;
  esac
  case "$_codigo" in
    404|410|403) return 2 ;;
  esac
  return 1
}

descargar() {  # $1 url, $2 destino
  _intento=1
  while [ "$_intento" -le "$INTENTOS" ]; do
    _estado=0
    _pedir "$1" "$2" || _estado=$?
    case "$_estado" in
      0) return 0 ;;
      2) return 2 ;;
      3) return 3 ;;
    esac
    if [ "$_intento" -lt "$INTENTOS" ]; then
      _espera=$((ESPERA_BASE * _intento))
      # Solo se dice cuando de verdad se está esperando: en una descarga
      # que va bien, la pantalla queda limpia.
      dato "la red falló (intento $_intento de $INTENTOS); reintento en ${_espera}s"
      sleep "$_espera" 2>/dev/null || true
    fi
    _intento=$((_intento + 1))
  done
  return 1
}

# La misma huella con lo que haya: GNU, macOS, openssl o busybox.
huella() {
  if hay sha256sum; then
    sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  elif hay shasum; then
    shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
  elif hay openssl; then
    openssl dgst -sha256 "$1" 2>/dev/null | sed 's/.*= *//'
  elif hay busybox; then
    busybox sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  else
    return 1
  fi
}

# ─────────────────────── espejos ───────────────────────
# raw.githubusercontent.com va bien casi siempre, pero está limitado y a
# veces se atasca. jsDelivr sirve el mismo archivo (misma etiqueta, mismo
# contenido) desde una CDN, así que es un buen segundo intento. Se prueban
# en orden y gana el primero cuyo archivo cuadre con su huella: si un
# espejo sirve basura, no sirve.
espejos() {
  if [ -n "${SHIN_BASE_URL:-}" ]; then
    printf '%s\n' "$SHIN_BASE_URL"
    return 0
  fi
  if [ -n "${SHIN_MIRRORS:-}" ]; then
    printf '%s\n' "$SHIN_MIRRORS"
    return 0
  fi
  printf '%s\n' "https://raw.githubusercontent.com/$REPO/$VERSION"
  printf '%s\n' "https://cdn.jsdelivr.net/gh/$REPO@$VERSION"
}

# ─────────────────────── argumentos ───────────────────────
# Se leen sin consumirlos: el instalador recibe "$@" tal cual. Así
# `… | sh -s -- --code` funciona sin que este archivo sepa qué es --code.
AYUDA_PEDIDA=0
DRY_RUN="${SHIN_DRY_RUN:-0}"
_previo=""
for _a in "$@"; do
  case "$_previo" in
    --version|-v) VERSION="$_a" ;;
  esac
  case "$_a" in
    -h|--help) AYUDA_PEDIDA=1 ;;
    --dry-run) DRY_RUN=1 ;;
  esac
  _previo="$_a"
done

[ "$AYUDA_PEDIDA" -eq 1 ] && { ayuda; exit 0; }
case "$VERSION" in
  v*) ;;
  *[0-9]*) VERSION="v$VERSION" ;;
esac

detectar_entorno

# ─────────────────────── empezar ───────────────────────
paso "Shin-MD $VERSION"
printf '  %s·%s %s · %s%s\n' "$GR" "$R" "$ENTORNO" "$ARQ" \
  "$( [ "$MUSL" -eq 1 ] && printf ' · musl' || true )"

if ! hay curl && ! hay wget; then
  if [ "$TERMUX" -eq 1 ] && hay pkg; then
    dato "instalando curl…"
    pkg install -y curl >/dev/null 2>&1 || morir "No pude instalar curl con pkg."
  else
    morir "Hace falta curl (o wget) para descargar. Instálalo y vuelve a intentarlo."
  fi
fi

TEMPORAL="$(mktemp -d 2>/dev/null || mktemp -d -t shin 2>/dev/null || true)"
[ -n "${TEMPORAL:-}" ] && [ -d "$TEMPORAL" ] || morir "No pude crear una carpeta temporal."
limpiar() { rm -rf -- "$TEMPORAL" 2>/dev/null || true; }
trap limpiar EXIT
trap 'exit 130' INT TERM

# ─────────────────────── descargar y comprobar ───────────────────────
paso "Comprobando la huella"
INSTALADOR=""
ESPEJO_USADO=""
HUELLA_INSTALADOR=""
mkdir -p "$TEMPORAL/espejos"

_n=0
for base in $(espejos); do
  _n=$((_n + 1))
  _dir="$TEMPORAL/espejos/$_n"
  mkdir -p "$_dir"
  _estado_ins=0
  descargar "$base/install.sh" "$_dir/install.sh" || _estado_ins=$?
  if [ "$_estado_ins" -eq 3 ]; then morir "No hay curl ni wget disponibles."; fi
  if [ "$_estado_ins" -ne 0 ]; then
    if [ "$_estado_ins" -eq 2 ]; then
      aviso "la versión $VERSION no está en ese espejo ($base)"
    else
      aviso "no pude bajar el instalador de $base"
    fi
    continue
  fi

  if ! descargar "$base/SHA256SUMS" "$_dir/SHA256SUMS"; then
    aviso "hay instalador pero no su huella en $base; no ejecuto nada de ahí"
    continue
  fi

  _declarada="$(grep -E '  install\.sh$' "$_dir/SHA256SUMS" 2>/dev/null | head -n1 | cut -d' ' -f1 || true)"
  if [ -z "$_declarada" ]; then
    aviso "el SHA256SUMS de $base no menciona install.sh; no me fío"
    continue
  fi
  if ! _calculada="$(huella "$_dir/install.sh")"; then
    morir "No tengo con qué calcular la huella (sha256sum, shasum, openssl o busybox)."
  fi
  if [ "$_declarada" != "$_calculada" ]; then
    aviso "la huella de $base NO coincide; no ejecuto su instalador"
    printf '      esperada   %s\n      descargada %s\n' "$_declarada" "$_calculada" >&2
    continue
  fi

  INSTALADOR="$_dir/install.sh"
  ESPEJO_USADO="$base"
  HUELLA_INSTALADOR="$_calculada"
  break
done

if [ -z "$INSTALADOR" ]; then
  morir "No pude descargar un instalador que cuadre con su huella.
  Probé $VERSION en:
$(espejos | sed 's/^/    /')

  Si la etiqueta no existe, mira las que hay:
    git ls-remote --tags https://github.com/$REPO

  Si el problema es la red, vuelve a intentarlo: los cortes a medias se
  reintentan solos y hay dos espejos."
fi

bien "coincide ($(printf '%s' "$HUELLA_INSTALADOR" | cut -c1-16)…)"
case "$ESPEJO_USADO" in
  *jsdelivr*) dato "servido por la CDN: el primer espejo no respondió" ;;
esac

if [ "$DRY_RUN" -eq 1 ]; then
  printf '\n'
  dato "modo comprobación: descargado y verificado, no ejecuto nada"
  dato "instalaría en ${SHIN_INSTALL_DIR:-$HOME/Shin-MD} y arrancaría el bot"
  printf '\n'
  exit 0
fi

# ─────────────────────── ejecutar ───────────────────────
# El comando normal llega por una tubería, así que la entrada estándar es
# este mismo archivo: cuando termina de leerse, cualquier pregunta del
# instalador —o la vinculación del bot, que también lee del teclado—
# recibiría el final del script en lugar de lo que escribes. Se devuelve
# la entrada a la terminal antes de cederle el control.
if [ "${SHIN_SIN_ARRANQUE:-0}" = "1" ]; then
  set -- "$@" --no-arrancar
fi

# Sin terminal no se puede preguntar nada: se contesta por adelantado. Con
# terminal, el instalador pregunta lo que tenga que preguntar (por ejemplo
# antes de usar sudo para instalar git o Node).
SIN_TTY=1
# La prueba va en una subshell a propósito: en dash/bash, un fallo de
# redirección sin terminal de control (SSH con -T, cron, Docker) mata el
# script entero aunque esté dentro de un `if`. En una subshell, solo muere
# la subshell y nos enteramos de que no hay terminal.
if [ -r /dev/tty ] && ( : < /dev/tty ) 2>/dev/null; then
  SIN_TTY=0
else
  aviso "sin terminal interactiva: no habrá preguntas (modo automático)"
fi

# La huella que se ejecutó queda guardada dentro de la instalación: si
# mañana algo va mal, se puede saber exactamente qué archivo corrió.
SHIN_INSTALADOR_HUELLA="$HUELLA_INSTALADOR"
SHIN_INSTALADOR_ESPEJO="$ESPEJO_USADO"
export SHIN_INSTALADOR_HUELLA SHIN_INSTALADOR_ESPEJO

if [ "$SIN_TTY" -eq 0 ]; then
  exec bash "$INSTALADOR" --version "$VERSION" --auto "$@" < /dev/tty
fi
exec bash "$INSTALADOR" --version "$VERSION" --auto --yes "$@" < /dev/null
