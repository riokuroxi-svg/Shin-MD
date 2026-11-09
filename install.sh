#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Shin-MD — instalador
#  https://github.com/riokuroxi-svg/Shin-MD
#  Copyright (C) 2026 riokuroxi-svg · SPDX-License-Identifier: AGPL-3.0-only
#
#  Un comando. Detecta Android/Termux, comprueba Node, clona, instala,
#  verifica los ocho parches del conector y dice cómo arrancar.
#
#    curl -fsSL https://raw.githubusercontent.com/riokuroxi-svg/Shin-MD/main/install.sh -o install.sh
#    bash install.sh
#
#  Regla de oro: NUNCA toca tus datos. `.env`, `Sessions/` y `data/`
#  sobreviven a --update, --repair y --uninstall (este último los mueve
#  a un lado; solo --purge los borra, y pregunta dos veces).
#
#  Uso:
#    bash install.sh                 instalar (o actualizar si ya existe)
#    bash install.sh --update        actualizar conservando datos
#    bash install.sh --repair        reconstruir dependencias sin tocar datos
#    bash install.sh --verify        comprobar la instalación actual
#    bash install.sh --uninstall     desinstalar conservando datos
#    bash install.sh --uninstall --purge   desinstalar y borrar todo
#    bash install.sh --run           arrancar el bot, sin comprobar nada
#    bash install.sh --auto          instalar, arreglar o actualizar, y arrancar
#    bash install.sh --doctor        foto del estado, para pegar si pides ayuda
#    bash install.sh --service       dejarlo como servicio de systemd (VPS)
#
#  Opciones:
#    --dir RUTA     instalar en otra carpeta (por defecto ~/Shin-MD)
#    --version TAG  instalar (o pasar a) una versión concreta
#    --branch RAMA  seguir esa rama en vez de main
#    --go           arrancar el bot al terminar (lo que hace `shin`)
#    --no-arrancar  aunque sea --auto, no arrancar el bot
#    --code, --qr   pasárselos al bot: pedir código de vinculación o QR
#    --print        con --service: enseñar la unidad, sin escribir nada
#    --user/--system  ámbito del servicio (por defecto, el que se pueda)
#    --yes          no preguntar
#    --shallow      clon rápido sin historial (no permite volver atrás)
#    --no-boost     no intentar el wakelock en Termux
#
#  Repetir el comando es seguro: si ya está instalado y al día, no copia,
#  no duplica y no vuelve a descargar. Y deja un comando `shin` en el PATH.
# ═══════════════════════════════════════════════════════════════════
set -Eeuo pipefail

readonly REPO_URL="${SHIN_REPO_URL:-https://github.com/riokuroxi-svg/Shin-MD.git}"
RAMA="${SHIN_BRANCH:-main}"
readonly REPO_URL_INFO="${SHIN_REPO_URL_INFO:-${REPO_URL%.git}}"
readonly NODE_MINIMO="22.5.0"
readonly NPM_MINIMO="10.0.0"
readonly NOMBRE="${SHIN_NOMBRE:-Shin-MD}"
# El "name" de package.json, que es lo que distingue una instalación de
# cualquier otro proyecto. Se deduce del nombre visible (Shin-MD → shin-md,
# Levi-MD → levi-md) para que un fork no tenga que tocar el instalador por
# dentro; si tu paquete se llama distinto, se dice y ya:
#   SHIN_PKG=mi-paquete bash install.sh
PAQUETE="${SHIN_PKG:-$(printf '%s' "$NOMBRE" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9._ -]//g' -e 's/ /-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')}"

BASE_DIR="${SHIN_INSTALL_ROOT:-$HOME}"
DESTINO="${SHIN_INSTALL_DIR:-$BASE_DIR/$NOMBRE}"
DESTINO_EXPLICITO=0
ULTIMO_APARTADO=""
if [ -n "${SHIN_INSTALL_DIR:-}" ] || [ -n "${SHIN_INSTALL_ROOT:-}" ]; then
  DESTINO_EXPLICITO=1
fi

ORIGEN_DEDUCIDO=0
VERSION_PEDIDA=""
RAMA_EXPLICITA=0
ACCION=""
ACTUALIZANDO=0
PEDIR_CONFIRMACION=1
SUPERFICIAL=0
PURGAR=0
BOOST=1
GO=0                 # --go: arrancar el bot al terminar
SIN_ARRANQUE=0       # --no-arrancar: aunque --auto pida arrancar
ARRANQUE_ARGS=()     # --code / --qr, tal cual se le pasan al bot
SERVICIO_PRINT=0     # --print: enseñar la unidad y no escribir nada
SERVICIO_AMBITO=""   # system | user (por defecto, lo que se pueda)

# ─────────────────────────── salida ───────────────────────────
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_ROSA=$'\033[38;5;205m'; C_GRIS=$'\033[38;5;245m'
  C_ROJO=$'\033[38;5;203m'; C_VERDE=$'\033[38;5;114m'; C_AMAR=$'\033[38;5;221m'
  C_NEG=$'\033[1m'
else
  C_RESET=""; C_ROSA=""; C_GRIS=""; C_ROJO=""; C_VERDE=""; C_AMAR=""; C_NEG=""
fi

paso()   { printf '\n%s▸ %s%s\n' "$C_ROSA$C_NEG" "$*" "$C_RESET"; }
bien()   { printf '  %s✓%s %s\n' "$C_VERDE" "$C_RESET" "$*"; }
aviso()  { printf '  %s!%s %s\n' "$C_AMAR" "$C_RESET" "$*" >&2; }
dato()   { printf '  %s·%s %s\n' "$C_GRIS" "$C_RESET" "$*"; }
error()  { printf '\n  %s✗ %s%s\n' "$C_ROJO" "$*" "$C_RESET" >&2; }
morir()  { error "$*"; exit 1; }

# ═══════════════════════════════════════════════════════════════════
#  PROTECCIÓN DE RUTAS
#
#  Todo lo que borra o reemplaza pasa por aquí. La regla es simple:
#  si no puedo demostrar que la ruta es la correcta, no la toco.
#
#  SHIN_NO_BORRAR contiene rutas que jamás se borran (separadas por
#  dos puntos o espacios). La suite de pruebas la usa para blindar el
#  repositorio desde el que se ejecuta: aunque algo saliera mal, el
#  borrado se detiene aquí.
# ═══════════════════════════════════════════════════════════════════

# Ruta absoluta y real: resuelve `..` y enlaces simbólicos. Si el
# último tramo todavía no existe (una instalación que se va a crear),
# resuelve el directorio padre.
resolver_real() {
  local p="${1:-}" padre base
  [ -n "$p" ] || return 1
  while [ "${p%/}" != "$p" ] && [ "$p" != "/" ]; do p="${p%/}"; done
  if [ -e "$p" ]; then
    ( cd "$p" 2>/dev/null && pwd -P )
    return
  fi
  padre="$(dirname "$p")"
  base="$(basename "$p")"
  if [ -d "$padre" ]; then
    printf '%s/%s\n' "$( cd "$padre" 2>/dev/null && pwd -P )" "$base"
  else
    printf '%s\n' "$p"
  fi
}

# ¿La ruta es intocable? Devuelve 0 (sí) si es el sistema, $HOME o
# algo que contiene al propio instalador.
ruta_intocable() {
  local real="$1" propio p rp base_termux=""
  # En Android TODO vive bajo /data/data, incluida la carpeta personal de
  # Termux (/data/data/com.termux/files/home). Si se veta /data/data a secas,
  # el instalador se niega a instalar en la única carpeta donde puede.
  case "${PREFIX:-}" in
    */com.termux/*) base_termux="${PREFIX%/files/*}/files" ;;
  esac

  case "$real" in
    ""|"/")     echo "es la raíz del sistema"; return 0 ;;
    "/home"|"/Users"|"/root"|"/storage"|"/storage/emulated") echo "es una carpeta de usuarios"; return 0 ;;
    "/usr"|"/usr/"*|"/etc"|"/etc/"*|"/bin"|"/sbin"|"/lib"|"/lib64"|"/boot"|"/dev"|"/proc"|"/sys"|"/var"|"/opt"|"/system"|"/vendor"|"/data"|"/data/data"|"/data/data/"*)
      # Dentro de /data/data solo se deja pasar la carpeta de trabajo de
      # Termux: su home (y por debajo), nunca la raíz del home ni el prefijo.
      if [ -n "$base_termux" ]; then
        case "$real" in
          "$base_termux/home/"?*) : ;;
          *) echo "es una ruta del sistema"; return 0 ;;
        esac
      else
        echo "es una ruta del sistema"; return 0
      fi
      ;;
  esac
  if [ "$real" = "$HOME" ]; then echo "es tu carpeta personal"; return 0; fi
  if [ "${#real}" -lt 4 ]; then echo "es una ruta demasiado corta"; return 0; fi

  # Nunca borrar un ANCESTRO de este script (borraría el instalador y, con
  # él, todo lo que lo rodea), pero sí el proyecto donde vive: para eso
  # existe justamente --uninstall.
  propio="$(resolver_real "$(dirname "${BASH_SOURCE[0]}")")"
  if [ "$real" != "$propio" ]; then
    case "$propio/" in
      "$real"/*) echo "contiene al propio instalador ($propio)"; return 0 ;;
    esac
  fi

  if [ -n "${SHIN_NO_BORRAR:-}" ]; then
    local lista="${SHIN_NO_BORRAR//:/ }"
    for p in $lista; do
      [ -n "$p" ] || continue
      rp="$(resolver_real "$p")"
      case "$rp/" in
        "$real"/*) echo "contiene $rp, que está protegido por SHIN_NO_BORRAR"; return 0 ;;
      esac
    done
  fi
  return 1
}

# Un enlace en CUALQUIER tramo del camino permite que /a/b/c acabe siendo
# /otra/cosa. En una ruta que se va a borrar, eso no se tolera.
sin_enlaces_en_el_camino() {
  local ruta="$1" actual="" parte
  local IFS=/
  for parte in $ruta; do
    [ -n "$parte" ] || continue
    actual="$actual/$parte"
    if [ -L "$actual" ]; then
      echo "$actual"
      return 0
    fi
  done
  return 1
}

# La única forma de borrar un árbol. Sin excepciones.
borrar_arbol() {
  local objetivo="${1:-}" motivo="${2:-}" real razon
  [ -n "$objetivo" ] || morir "borrar_arbol sin objetivo"
  if [ -L "$objetivo" ]; then
    morir "$objetivo es un enlace simbólico; no borro a través de enlaces."
  fi
  # Los enlaces se buscan en la ruta TAL COMO se dio, no en la resuelta:
  # resolver primero esconde justo el enlace que hay que detectar.
  local como_se_dio="$objetivo"
  case "$como_se_dio" in
    /*) : ;;
    *) como_se_dio="$(pwd -P)/$como_se_dio" ;;
  esac
  local tramo
  if tramo="$(sin_enlaces_en_el_camino "$como_se_dio")"; then
    morir "no borro $como_se_dio: el camino pasa por el enlace $tramo."
  fi
  real="$(resolver_real "$objetivo")" || morir "no pude resolver la ruta de $objetivo"
  if razon="$(ruta_intocable "$real")"; then
    morir "me niego a borrar $real: $razon."
  fi

  # Entre la comprobación de arriba y el borrado hay subshells de por medio.
  # Si en ese hueco alguien sustituye un tramo por un enlace, el rm seguiría
  # la ruta ya resuelta y borraría otra cosa. Se vuelve a mirar justo antes:
  #   - los enlaces, sobre la ruta TAL COMO se dio (mirar la resuelta no sirve:
  #     si el enlace ya estaba al resolver, la resuelta ya no lo contiene);
  #   - que resolver otra vez dé exactamente lo mismo (si cambió, algo cambió).
  # Queda un hueco entre esta línea y el rm. Cerrarlo del todo pediría borrar
  # por descriptor de directorio, que sh no ofrece. Es un hueco de microsegundos
  # y hace falta poder escribir en el padre de la carpeta para aprovecharlo.
  if tramo="$(sin_enlaces_en_el_camino "$como_se_dio")"; then
    morir "no borro $como_se_dio: el camino pasa por el enlace $tramo."
  fi
  local real_otra
  real_otra="$(resolver_real "$como_se_dio")" || morir "no pude volver a resolver $como_se_dio"
  if [ "$real_otra" != "$real" ]; then
    morir "no borro $real: la ruta cambió mientras la comprobaba (ahora es $real_otra)."
  fi
  if razon="$(ruta_intocable "$real")"; then
    morir "me niego a borrar $real: $razon."
  fi

  dato "borrando $real${motivo:+ ($motivo)}"
  rm -rf -- "$real"
  bien "borrado $real"
}

# ¿Se puede instalar aquí? Se rechazan las rutas del sistema y las que
# no cuelgan de un sitio razonable (tu casa, /tmp o la raíz que pidas).
destino_instalable() {
  local real razon base
  real="$(resolver_real "$1")" || return 1
  if razon="$(ruta_intocable "$real")"; then
    morir "no puedo instalar en $real: $razon."
  fi
  base="$(resolver_real "$BASE_DIR")"
  case "$real" in
    "$base"|"$base/"*) : ;;
    "/tmp/"*|"/var/tmp/"*) : ;;
    *) if [ "$DESTINO_EXPLICITO" -eq 1 ]; then
         : # el usuario lo pidió a propósito con --dir
       else
         morir "no puedo instalar en $real: no está dentro de $base."
       fi ;;
  esac
  return 0
}

# ───────────────────── limpieza ante interrupción ─────────────────────
INSTALANDO=0
al_salir() {
  local codigo=$?
  if [ -n "${DESTINO:-}" ] && [ -f "$DESTINO/.shin-install.tmp" ] && [ ! -L "$DESTINO/.shin-install.tmp" ]; then
    rm -f -- "$DESTINO/.shin-install.tmp" || true
  fi
  if [ "$codigo" -ne 0 ] && [ "$INSTALANDO" -eq 1 ]; then
    printf '\n%s  La instalación no terminó. Nada quedó marcado como instalado:%s\n' "$C_GRIS" "$C_RESET" >&2
    printf '  %svuelve a ejecutar el mismo comando y continuará donde se quedó.%s\n\n' "$C_GRIS" "$C_RESET" >&2
  fi
  return "$codigo"
}
trap al_salir EXIT
trap 'exit 130' INT TERM

# ─────────────────────────── utilidades ───────────────────────────
version_mayor_o_igual() {  # $1 >= $2
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

hay() { command -v "$1" >/dev/null 2>&1; }

es_termux() {
  [ -n "${TERMUX_VERSION:-}" ] && return 0
  case "${PREFIX:-}" in */com.termux/*) return 0 ;; esac
  [ "$(uname -s 2>/dev/null || true)" = "Android" ]
}

arquitectura() {
  local a
  a="$(uname -m 2>/dev/null || echo desconocida)"
  case "$a" in
    aarch64|arm64)      echo "arm64" ;;
    armv7l|armv8l|arm)  echo "armv7" ;;
    x86_64|amd64)       echo "x86_64" ;;
    i686|i386)          echo "x86" ;;
    *)                  echo "$a" ;;
  esac
}

leer_version_paquete() {
  [ -f "$DESTINO/package.json" ] || { echo "?"; return; }
  node -p "require('$DESTINO/package.json').version" 2>/dev/null || echo "?"
}

# Para actualizar, reparar, verificar o desinstalar hay que saber CUÁL es la
# instalación. Se acepta la carpeta desde la que se ejecuta (deducida) o una
# ruta que pida el usuario. Nunca se actúa sobre ~/Shin-MD por suposición:
# ahí puede haber una instalación de otra persona.
exigir_destino_conocido() {
  [ "$DESTINO_EXPLICITO" -eq 1 ] && return 0
  [ "$ORIGEN_DEDUCIDO" -eq 1 ] && return 0
  # Volver a pegar el mismo comando en Termux es lo más normal del mundo: el
  # archivo se descarga en ~ y se ejecuta desde ahí, así que el instalador no
  # está dentro de la instalación y antes se plantaba con "No sé sobre qué
  # instalación actuar". Si en la ruta por defecto hay una instalación con
  # nuestro nombre, es ESA y no otra: se acepta solo si se puede demostrar
  # (package.json con el nombre del paquete, .git y sin enlaces), que es lo
  # mismo que exige el resto del script antes de tocar nada.
  if [ -d "$DESTINO" ] && [ ! -L "$DESTINO" ] && es_propia "$DESTINO" && [ -d "$DESTINO/.git" ]; then
    ORIGEN_DEDUCIDO=1
    dato "instalación reconocida en $DESTINO"
    return 0
  fi
  morir "No sé sobre qué instalación actuar.
  Ejecuta este script desde la carpeta de la instalación, o indica la ruta:
    bash install.sh --dir RUTA --$1"
}

# ¿Esta carpeta es una instalación nuestra? Dos formas de saberlo:
#   · lleva la marca .shin-install, que escribió este mismo instalador, o
#   · su package.json se llama como el paquete ($PAQUETE).
# Lo segundo es lo que salva a un fork hecho antes del instalador (un clon a
# mano de Levi-MD, por ejemplo): se reconoce por el nombre, sin marca.
es_propia() {
  local dir="${1:-}"
  [ -f "$dir/package.json" ] || return 1
  [ -f "$dir/.shin-install" ] && return 0
  grep -q "\"name\"[[:space:]]*:[[:space:]]*\"$PAQUETE\"" "$dir/package.json"
}

# Antes de tocar nada: ¿esta carpeta es de verdad una instalación?
exigir_proyecto() {
  [ -f "$DESTINO/package.json" ] || morir "No hay ninguna instalación de $NOMBRE en $DESTINO."
  if ! es_propia "$DESTINO"; then
    morir "$DESTINO no parece una instalación de $NOMBRE (package.json no se llama $PAQUETE y no hay marca .shin-install); no voy a tocar esa carpeta."
  fi
  # Un clon tiene .git; una carpeta cualquiera llamada shin-md, no.
  if [ ! -d "$DESTINO/.git" ]; then
    morir "$DESTINO no es un clon de $NOMBRE (no tiene .git); no voy a tocar esa carpeta."
  fi
  if [ -L "$DESTINO" ]; then
    morir "$DESTINO es un enlace simbólico; esa es justo la forma de borrar otra cosa sin querer."
  fi
  return 0
}

# ═══════════════════════════════════════════════════════════════════
#  ENTORNO — lo que tiene que existir antes de instalar nada
#
#  La versión 3.5 daba por hecho que ya tenías Node 22.5 y git. En un
#  teléfono con Termux eso se resuelve con `pkg`, pero en un VPS recién
#  creado, en un contenedor de Docker o en un macOS sin Homebrew, no:
#  el instalador se paraba y mandaba a leer la documentación.
#
#  Ahora mira qué falta y lo resuelve, en este orden de preferencia:
#    1. Lo que ya está — no se toca nada.
#    2. El gestor de paquetes del sistema (pkg, apt, dnf, apk, pacman,
#       brew), pidiendo permiso antes de usar sudo.
#    3. Sin root y sin paquetes: Node oficial (nodejs.org) descomprimido
#       en ~/.local/opt, con su huella comprobada. Sirve en cualquier
#       Linux con glibc y en macOS, sin tocar el sistema.
#    4. Si nada de eso es posible, se dice qué falta y qué escribir.
#
#  Y queda guardado en `.shin-install` de dónde salió cada cosa, para
#  que `--doctor` pueda contarlo después.
# ═══════════════════════════════════════════════════════════════════

detectar_plataforma() {
  SO="$(uname -s 2>/dev/null || echo desconocido)"
  ARQ_SIS="$(arquitectura)"
  GESTOR=""
  SUDO=""
  PLATAFORMA="otro"
  NODE_DE_PAQUETE=0

  if es_termux; then
    PLATAFORMA="termux"
    hay pkg && GESTOR="pkg"
  elif [ "$SO" = "Darwin" ]; then
    PLATAFORMA="macos"
    hay brew && GESTOR="brew"
  elif hay apk; then
    PLATAFORMA="alpine"
    GESTOR="apk"
  elif hay apt-get; then
    PLATAFORMA="debian"
    GESTOR="apt"
  elif hay dnf; then
    PLATAFORMA="fedora"
    GESTOR="dnf"
  elif hay yum; then
    PLATAFORMA="rhel"
    GESTOR="yum"
  elif hay pacman; then
    PLATAFORMA="arch"
    GESTOR="pacman"
  fi

  if [ "$(id -u 2>/dev/null || echo 1)" != "0" ] && hay sudo; then
    # `sudo -n` cuando la contraseña no se puede pedir: falla en el acto en
    # vez de dejar la instalación colgada esperando algo que nadie va a
    # escribir (esto es lo que pasa dentro de un contenedor o de un cron).
    if sudo -n true 2>/dev/null; then
      SUDO="sudo -n"
    elif [ "$PEDIR_CONFIRMACION" -eq 1 ]; then
      SUDO="sudo"
    fi
  fi
  return 0
}

# ¿Se permite tocar el sistema? Con --yes se asume que sí (el usuario pidió
# automatización), pero solo se usa `sudo -n`: nunca se queda esperando una
# contraseña que no puede leer.
# Regla: sin terminal no se toca el sistema. Un instalador que corre por una
# tubería no puede decidir por ti si instala paquetes con root; lo que sí
# puede hacer sin preguntar es poner Node en tu carpeta personal, que no toca
# nada del sistema (ver instalar_node_oficial). Quien quiera que sí, lo dice:
#   SHIN_PERMITIR_PAQUETAS=1 curl … | sh
puedo_instalar_sistema() {
  [ "${SHIN_NO_INSTALAR:-0}" = "1" ] && return 1
  [ -n "$GESTOR" ] || return 1
  if [ "${SHIN_PERMITIR_PAQUETAS:-0}" = "1" ]; then
    [ "$(id -u 2>/dev/null || echo 1)" = "0" ] || [ -n "$SUDO" ]
    return $?
  fi
  # Con terminal se puede preguntar, y `pedir_permiso` lo hará.
  [ -t 0 ] || return 1
  [ "$(id -u 2>/dev/null || echo 1)" = "0" ] || [ -n "$SUDO" ]
}

pedir_permiso() {  # $1 = qué, $2... = comando sugerido
  local que="$1"; shift
  [ "$PEDIR_CONFIRMACION" -eq 1 ] || return 0
  if [ ! -t 0 ]; then return 1; fi
  printf '  %s?%s Falta %s. ¿Lo instalo ahora? [S/n] ' "$C_AMAR" "$C_RESET" "$que" >&2
  local respuesta=""
  read -r respuesta || return 1
  case "$respuesta" in
    ""|s|S|si|sí|SI|Sí|y|Y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

instalar_paquete_sistema() {  # $@ = nombres de paquete
  [ -n "$GESTOR" ] || return 1
  case "$GESTOR" in
    pkg)     pkg install -y "$@" >/dev/null 2>&1 ;;
    apt)     $SUDO apt-get update -qq >/dev/null 2>&1 && $SUDO apt-get install -y "$@" >/dev/null 2>&1 ;;
    dnf|yum) $SUDO "$GESTOR" install -y "$@" >/dev/null 2>&1 ;;
    apk)     $SUDO apk add --no-cache "$@" >/dev/null 2>&1 ;;
    pacman)  $SUDO pacman -S --noconfirm --needed "$@" >/dev/null 2>&1 ;;
    brew)    brew install "$@" >/dev/null 2>&1 ;;
    *)       return 1 ;;
  esac
}

# ─────────────── descargas con red floja ───────────────
# Mismo criterio que en el arranque: reintentar lo que puede mejorar solo.
descargar_url() {  # $1 url, $2 destino
  local intento=1 estado codigo
  local intentos="${SHIN_INTENTOS:-3}"
  while [ "$intento" -le "$intentos" ]; do
    estado=0
    codigo="000"
    if hay curl; then
      codigo="$(curl -sSL --connect-timeout 20 --max-time 900 --retry 0 \
                  -o "$2" -w '%{http_code}' "$1" 2>/dev/null)" || estado=$?
    elif hay wget; then
      wget -q -T 20 -O "$2" "$1" >/dev/null 2>&1 || estado=$?
      [ "$estado" -eq 0 ] && codigo="200"
    else
      return 3
    fi
    [ -n "$codigo" ] || codigo="000"
    if [ "$estado" -eq 0 ]; then
      case "$codigo" in
        2*|000) return 0 ;;
      esac
    fi
    case "$codigo" in
      404|410|403) return 2 ;;
    esac
    if [ "$intento" -lt "$intentos" ]; then
      dato "la red falló (intento $intento de $intentos); reintento en $((intento))s"
      sleep "$intento" 2>/dev/null || true
    fi
    intento=$((intento + 1))
  done
  return 1
}

huella_archivo() {
  if hay sha256sum; then sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  elif hay shasum; then shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1
  elif hay openssl; then openssl dgst -sha256 "$1" 2>/dev/null | sed 's/.*= *//'
  elif hay busybox; then busybox sha256sum "$1" 2>/dev/null | cut -d' ' -f1
  else return 1; fi
}

# ─────────────── git ───────────────
asegurar_git() {
  hay git && { GIT_ORIGEN="sistema"; return 0; }
  paso "Instalando git"
  if puedo_instalar_sistema && pedir_permiso "git (para descargar el proyecto)"; then
    case "$PLATAFORMA" in
      termux) instalar_paquete_sistema git ;;
      alpine) instalar_paquete_sistema git ;;
      macos)  instalar_paquete_sistema git ;;
      *)      instalar_paquete_sistema git ;;
    esac
  fi
  if hay git; then
    GIT_ORIGEN="instalado"
    bien "git $(git --version 2>/dev/null | awk '{print $3}')"
    return 0
  fi
  return 1
}

# ─────────────── Node ───────────────
node_sirve() {
  hay node || return 1
  local v
  v="$(node -p 'process.versions.node' 2>/dev/null || echo "0.0.0")"
  version_mayor_o_igual "$v" "$NODE_MINIMO"
}

# Node oficial, descomprimido en ~/.local/opt, sin root y sin tocar el
# sistema. La huella sale del SHASUMS256.txt que publica nodejs.org junto a
# los archivos: se comprueba igual que la del instalador.
instalar_node_oficial() {
  [ "${SHIN_NO_INSTALAR:-0}" = "1" ] && return 1
  local base="${SHIN_NODE_BASE:-https://nodejs.org/dist/latest-v22.x}"
  local tmp="$DESTINO/.node-tmp" so arch archivo esperada
  case "$(uname -s)" in
    Darwin) so="darwin" ;;
    *)      so="linux" ;;
  esac
  case "$ARQ_SIS" in
    x86_64) arch="x64" ;;
    arm64)  arch="arm64" ;;
    armv7)  arch="armv7l" ;;
    *)
      aviso "no hay Node oficial para $ARQ_SIS; instálalo a mano."
      return 1 ;;
  esac

  dato "descargando Node desde nodejs.org (sin root, no toca el sistema)"
  rm -rf -- "$tmp"
  mkdir -p "$tmp"
  if ! descargar_url "$base/SHASUMS256.txt" "$tmp/SHASUMS256.txt"; then
    rm -rf -- "$tmp"
    aviso "no pude consultar nodejs.org"
    return 1
  fi
  archivo="$(grep -oE "node-v[0-9.]+-${so}-${arch}\.tar\.gz" "$tmp/SHASUMS256.txt" | head -n1 || true)"
  if [ -z "$archivo" ]; then
    rm -rf -- "$tmp"
    aviso "nodejs.org no publica un paquete para ${so}-${arch}"
    return 1
  fi
  esperada="$(awk -v f="$archivo" '$2==f {print $1}' "$tmp/SHASUMS256.txt" | head -n1 || true)"
  if ! descargar_url "$base/$archivo" "$tmp/$archivo"; then
    rm -rf -- "$tmp"
    aviso "no pude descargar $archivo"
    return 1
  fi
  local obtenida
  obtenida="$(huella_archivo "$tmp/$archivo" || true)"
  if [ -z "$esperada" ] || [ "$esperada" != "$obtenida" ]; then
    rm -rf -- "$tmp"
    error "la huella de Node no coincide; no lo instalo."
    return 1
  fi

  local destino_base="$HOME/.local/opt"
  local carpeta
  carpeta="$(printf '%s' "$archivo" | sed 's/\.tar\.gz$//')"
  mkdir -p "$destino_base"
  if ! tar -xzf "$tmp/$archivo" -C "$tmp" 2>/dev/null; then
    rm -rf -- "$tmp"
    aviso "no pude descomprimir $archivo (¿falta tar?)"
    return 1
  fi
  rm -rf -- "$destino_base/$carpeta"
  mv -- "$tmp/$carpeta" "$destino_base/$carpeta" || { rm -rf -- "$tmp"; return 1; }
  ln -sfn "$destino_base/$carpeta" "$destino_base/node"
  rm -rf -- "$tmp"

  NODE_RAIZ="$destino_base/node"
  NODE_ORIGEN="nodejs.org ($carpeta)"
  PATH="$NODE_RAIZ/bin:$PATH"
  export PATH
  hash -r 2>/dev/null || true
  bien "node $("$NODE_RAIZ/bin/node" -p 'process.versions.node' 2>/dev/null || echo '?') en $NODE_RAIZ"
  persistir_path "$NODE_RAIZ/bin"
  return 0
}

asegurar_node() {
  if node_sirve && hay npm; then
    NODE_ORIGEN="sistema"
    comprobar_npm_minimo
    return 0
  fi
  # Se guarda lo que había para poder decir la verdad al final: no es lo
  # mismo "no hay Node" que "hay uno viejo que no sirve".
  NODE_VIEJO=""
  if hay node; then NODE_VIEJO="$(node -p 'process.versions.node' 2>/dev/null || echo '?')"; fi
  paso "Preparando Node.js"
  case "$PLATAFORMA" in
    termux)
      if pedir_permiso "Node.js (paquete de Termux)"; then
        dato "instalando nodejs-lts… (puede tardar varios minutos)"
        instalar_paquete_sistema nodejs-lts || instalar_paquete_sistema nodejs
      fi
      ;;
    alpine)
      # Alpine usa musl: el paquete oficial de nodejs.org no arranca aquí.
      if pedir_permiso "nodejs y npm (apk)"; then
        instalar_paquete_sistema nodejs npm
      fi
      ;;
    macos)
      if [ "$GESTOR" = "brew" ] && pedir_permiso "node@22 (Homebrew)"; then
        instalar_paquete_sistema node@22
        [ -d "$(brew --prefix 2>/dev/null)/opt/node@22/bin" ] && {
          PATH="$(brew --prefix)/opt/node@22/bin:$PATH"; export PATH
        }
      fi
      ;;
    *)
      if puedo_instalar_sistema && pedir_permiso "Node 22 (gestor de paquetes del sistema)"; then
        # El nodejs de las distribuciones suele ser viejo; se prueba y, si
        # no llega al mínimo, se cae al paquete oficial sin root.
        instalar_paquete_sistema nodejs npm || true
      fi
      ;;
  esac
  hash -r 2>/dev/null || true

  if node_sirve && hay npm; then
    bien "node $(node -p 'process.versions.node') (paquete del sistema)"
    NODE_ORIGEN="paquete del sistema"
    comprobar_npm_minimo
    return 0
  fi

  case "$PLATAFORMA" in
    termux)
      morir "Termux tiene Node pero no la versión mínima ($NODE_MINIMO).
  Pruébalo a mano:  pkg install nodejs-lts && node -v" ;;
    alpine)
      morir "No pude instalar Node en Alpine.
  A mano:  apk add --no-cache nodejs npm" ;;
  esac

  if instalar_node_oficial; then
    comprobar_npm_minimo
    return 0
  fi

  if [ -n "${NODE_VIEJO:-}" ]; then
    morir "Node $NODE_VIEJO es demasiado antiguo (hace falta $NODE_MINIMO o más) y no pude actualizarlo.
  Opciones:
    · Ubuntu/Debian:  sudo apt install -y nodejs npm
    · Fedora:         sudo dnf install -y nodejs npm
    · Alpine:         sudo apk add nodejs npm
    · macOS:          brew install node@22
    · sin root:       descárgalo de https://nodejs.org y añade su bin/ al PATH
  Después vuelve a ejecutar este mismo comando."
  fi

  morir "Hace falta Node $NODE_MINIMO o superior y no pude instalarlo.
  Opciones:
    · Ubuntu/Debian:  sudo apt install -y nodejs npm     (o nodejs desde nodesource)
    · Fedora:         sudo dnf install -y nodejs npm
    · macOS:          brew install node@22
    · sin root:       descárgalo de https://nodejs.org y añade su bin/ al PATH
  Después vuelve a ejecutar este mismo comando."
}

comprobar_npm_minimo() {
  hay npm || morir "Hay Node pero no npm, y sin npm no puedo instalar las dependencias."
  local v
  v="$(npm -v 2>/dev/null || echo '0.0.0')"
  if ! version_mayor_o_igual "$v" "$NPM_MINIMO"; then
    morir "npm $v es demasiado antiguo (hace falta $NPM_MINIMO o más).
  Actualízalo:  npm install -g npm@latest"
  fi
  return 0
}

# ─────────────── PATH que sobrevive al reinicio ───────────────
# Escribir en el rc del shell es de las pocas veces en que un instalador
# toca algo fuera de su carpeta, así que se hace con tres cuidados: solo
# si la carpeta no está ya en el PATH, solo con marcas propias para poder
# volver atrás, y nunca dos veces (repetir el comando no añade otra línea).
persistir_path() {
  local dir="$1" archivo marcado=0 rc
  [ -n "$dir" ] || return 0
  [ "${SHIN_NO_PATH:-0}" = "1" ] && return 0
  case ":$PATH:" in
    *":$dir:"*) ;;
  esac
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    [ -f "$rc" ] || continue
    if grep -qF "# >>> Shin-MD >>>" "$rc" 2>/dev/null; then
      marcado=1
      # Ya hay bloque: si no tiene esta carpeta, se añade dentro.
      if ! grep -qF "$dir" "$rc" 2>/dev/null; then
        # Se inserta una línea antes del cierre del bloque.
        local tmp="$rc.shin-tmp"
        awk -v d="$dir" '
          /# >>> Shin-MD >>>/ {dentro=1}
          dentro && /# <<< Shin-MD <<</ && !hecho {print "export PATH=\"" d ":$PATH\""; hecho=1}
          {print}
        ' "$rc" > "$tmp" 2>/dev/null && mv -f -- "$tmp" "$rc"
      fi
    fi
  done
  [ "$marcado" -eq 1 ] && return 0

  # Sin bloque todavía: se crea en el rc que de verdad se lee.
  local destino_rc=""
  case "${SHELL:-}" in
    */zsh) [ -f "$HOME/.zshrc" ] && destino_rc="$HOME/.zshrc" ;;
    */bash) [ -f "$HOME/.bashrc" ] && destino_rc="$HOME/.bashrc" ;;
  esac
  if [ -z "$destino_rc" ]; then
    for rc in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc"; do
      [ -f "$rc" ] && { destino_rc="$rc"; break; }
    done
  fi
  [ -n "$destino_rc" ] || destino_rc="$HOME/.profile"

  {
    printf '\n# >>> Shin-MD >>>\n'
    printf '# Añadido por el instalador de %s. Para quitarlo, borra este bloque.\n' "$NOMBRE"
    printf 'export PATH="%s:$PATH"\n' "$dir"
    printf '# <<< Shin-MD <<<\n'
  } >> "$destino_rc" 2>/dev/null || { aviso "no pude escribir en $destino_rc"; return 0; }
  dato "PATH actualizado en $destino_rc (solo este bloque; se puede borrar)"
}

# ─────────────── la puerta única ───────────────
asegurar_entorno() {
  detectar_plataforma
  paso "Entorno"
  dato "$(describir_plataforma)"

  if ! hay curl && ! hay wget; then
    if puedo_instalar_sistema && pedir_permiso "curl"; then
      instalar_paquete_sistema curl || true
    fi
    if ! hay curl && ! hay wget; then
      morir "No hay curl ni wget, y sin uno de los dos no puedo descargar nada.
  Instálalo:  $(sugerencia_paquete curl)"
    fi
  fi

  if ! asegurar_git; then
    morir "Hace falta git para descargar $NOMBRE.
  Instálalo a mano:  $(sugerencia_paquete git)
  Y vuelve a ejecutar este mismo comando."
  fi

  asegurar_node
  comprobar_npm_minimo
  NODE_V="$(node -p 'process.versions.node' 2>/dev/null || echo '?')"
  NPM_V="$(npm -v 2>/dev/null || echo '?')"
  bien "node $NODE_V · npm $NPM_V · $(ARQ_SIS=$ARQ_SIS; arquitectura)"
}

describir_plataforma() {
  case "$PLATAFORMA" in
    termux) printf 'Termux (Android) · %s' "$ARQ_SIS" ;;
    debian) printf 'Debian/Ubuntu · %s' "$ARQ_SIS" ;;
    fedora) printf 'Fedora/RHEL · %s' "$ARQ_SIS" ;;
    alpine) printf 'Alpine (musl) · %s' "$ARQ_SIS" ;;
    arch)   printf 'Arch · %s' "$ARQ_SIS" ;;
    macos)  printf 'macOS · %s' "$ARQ_SIS" ;;
    *)      printf '%s · %s' "$(uname -s 2>/dev/null || echo '?')" "$ARQ_SIS" ;;
  esac
}

sugerencia_paquete() {
  case "$PLATAFORMA:$1" in
    termux:*) printf 'pkg install %s' "$1" ;;
    debian:*) printf 'sudo apt install -y %s' "$1" ;;
    fedora:*) printf 'sudo dnf install -y %s' "$1" ;;
    alpine:*) printf 'sudo apk add %s' "$1" ;;
    arch:*)   printf 'sudo pacman -S %s' "$1" ;;
    macos:*)  printf 'brew install %s' "$1" ;;
    *)        printf '%s (con el gestor de paquetes de tu sistema)' "$1" ;;
  esac
}

# ─────────────────────── comprobaciones ───────────────────────
comprobar_node() {
  if ! hay node; then
    error "No hay Node.js instalado."
    if es_termux; then
      printf '  %sEn Termux se instala así:%s\n    pkg install -y nodejs-lts\n\n' "$C_GRIS" "$C_RESET" >&2
    else
      printf '  %sNecesitas Node %s o superior: https://nodejs.org%s\n\n' "$C_GRIS" "$NODE_MINIMO" "$C_RESET" >&2
    fi
    return 1
  fi
  NODE_V="$(node -p 'process.versions.node' 2>/dev/null || echo "0.0.0")"
  if ! version_mayor_o_igual "$NODE_V" "$NODE_MINIMO"; then
    error "Node $NODE_V es demasiado antiguo (hace falta $NODE_MINIMO o más)."
    if es_termux; then
      printf '  %sSolución:%s pkg install -y nodejs-lts\n\n' "$C_GRIS" "$C_RESET" >&2
    else
      printf '  %sInstala Node %s o superior:%s https://nodejs.org\n\n' "$C_GRIS" "$NODE_MINIMO" "$C_RESET" >&2
    fi
    return 1
  fi
  return 0
}

comprobar_npm() {
  if ! hay npm; then
    error "No hay npm (viene con Node.js)."
    return 1
  fi
  NPM_V="$(npm -v 2>/dev/null || echo "0.0.0")"
  if ! version_mayor_o_igual "$NPM_V" "$NPM_MINIMO"; then
    error "npm $NPM_V es antiguo (hace falta $NPM_MINIMO o más)."
    printf '  %sActualizar:%s npm install -g npm@latest\n\n' "$C_GRIS" "$C_RESET" >&2
    return 1
  fi
  return 0
}

# ───────────────────────── Termux ─────────────────────────
# Extras de Termux. No son obligatorios para arrancar —el bot funciona sin
# ellos— así que un fallo aquí se avisa y se sigue: música, stickers animados
# y descargas pierden alguna función, nada más.
extras_termux() {
  es_termux || return 0
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
    case ":$PATH:" in
      *":$PREFIX/bin:"*) ;;
      *) PATH="$PREFIX/bin:$PATH"; export PATH ;;
    esac
  fi
  hay pkg || { aviso "Estás en Termux pero no encuentro 'pkg'. Instala lo que falte a mano."; return 0; }
  if ! hay ffmpeg; then
    dato "instalando ffmpeg (multimedia y stickers)…"
    pkg install -y ffmpeg >/dev/null 2>&1 || aviso "ffmpeg no se instaló; stickers animados y audio pueden fallar."
  fi
  if ! hay yt-dlp; then
    dato "instalando yt-dlp (descargas)…"
    # Termux lo empaqueta como `yt-dlp` en unas ramas y como `python-yt-dlp`
    # (que provee el comando) en otras.
    if ! pkg install -y yt-dlp >/dev/null 2>&1; then
      pkg install -y python-yt-dlp >/dev/null 2>&1 \
        || aviso "yt-dlp no se instaló; las descargas usarán solo los proveedores web."
    fi
  fi
  # termux-wake-lock vive en termux-tools, que viene de serie. Solo se
  # instala si alguien lo quitó; termux-api es otra cosa y aquí no se usa.
  if ! hay termux-wake-lock; then
    pkg install -y termux-tools >/dev/null 2>&1 || true
  fi
  return 0
}

wakelock() {
  [ "$BOOST" -eq 1 ] || return 0
  es_termux || return 0
  if hay termux-wake-lock; then
    termux-wake-lock >/dev/null 2>&1 && bien "wakelock activo (Android no dormirá el bot)"
  else
    aviso "sin wakelock: ejecuta pkg install termux-tools y actívalo desde la notificación de Termux."
  fi
}

# ─────────────────────── esquema de la base ───────────────────────
# El bot migra su SQLite al arrancar (`src/storage/migrations.js`). Las
# migraciones de hoy son aditivas (CREATE IF NOT EXISTS y ALTER TABLE ADD
# COLUMN), pero la base no se revierte con el código: si una versión nueva
# migra a v7 y se vuelve a una que solo conoce v5, el esquema queda por
# delante del código. Esto lo detecta y lo dice, en vez de dejarlo pasar.

version_esquema_db() {
  local db="$1"
  [ -f "$db" ] || { echo ""; return 0; }
  node -e '
    const { DatabaseSync } = require("node:sqlite");
    try {
      const d = new DatabaseSync(process.argv[1], { readOnly: true });
      const r = d.prepare("SELECT MAX(version) AS v FROM migrations").get();
      d.close();
      process.stdout.write(r && r.v != null ? String(r.v) : "");
    } catch { process.stdout.write(""); }
  ' "$db" 2>/dev/null || true
}

version_esquema_codigo() {
  local f="$1/src/storage/migrations.js"
  [ -f "$f" ] || { echo ""; return 0; }
  grep -o 'version:[[:space:]]*[0-9]\+' "$f" 2>/dev/null | grep -o '[0-9]\+' | sort -n | tail -1
}

comprobar_esquema_tras_revertir() {
  local db="$1" version_codigo version_db
  version_codigo="$(version_esquema_codigo "$DESTINO")"
  version_db="$(version_esquema_db "$db")"
  [ -n "$version_db" ] || return 0
  [ -n "$version_codigo" ] || return 0
  if [ "$version_db" -gt "$version_codigo" ] 2>/dev/null; then
    error "La base quedó en el esquema v$version_db y el código al que volviste solo conoce v$version_codigo."
    printf '  El bot puede arrancar pero encontrarse columnas que no espera.\n'
    if [ -n "${RESPALDO_HECHO:-}" ] && [ -d "$RESPALDO_HECHO/data" ]; then
      printf '  %sCopia de la base de ANTES de actualizar:%s %s/data\n' "$C_GRIS" "$C_RESET" "$RESPALDO_HECHO"
      printf '  Para volver a ella: para el bot y copia esos archivos sobre data/ (incluye -wal y -shm).\n'
    fi
    return 1
  fi
  return 0
}

# ───────────────────────── respaldo de datos ─────────────────────────
rutas_de_datos() {
  local r
  for r in ".env" "Sessions" "session" "data"; do
    [ -e "$DESTINO/$r" ] && printf '%s\n' "$r"
  done
}

# Lo que se lleva --uninstall antes de borrar la carpeta. Incluye backups/:
# borrar la instalación no puede llevarse por delante respaldos que siguen
# siendo válidos. No se usa en respaldar_datos() para no copiar respaldos
# dentro de respaldos.
rutas_a_conservar() {
  rutas_de_datos
  [ -d "$DESTINO/backups" ] && printf 'backups\n'
  return 0
}

# Copia CONSISTENTE de una base SQLite.
#
# Un `cp` del .db mientras el bot escribe puede dejar la copia a medias: en
# modo WAL, las últimas transacciones viven en `-wal` y el `.db` por sí solo
# no las tiene; copiar los tres archivos tampoco basta si el WAL se está
# escribiendo en ese instante. `VACUUM INTO` sí: escribe una base nueva y
# completa a partir de una lectura transactionally-consistent, con el bot
# corriendo o no.
copia_consistente_sqlite() {
  local origen="$1" destino="$2" salida
  COPIAS_ERROR=""
  # El fragmento JS no lleva comillas simples: el shell ya usa las suyas para
  # envolverlo, y una comilla suelta dentro rompería el script en silencio.
  salida="$(node --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const [origen, destino] = process.argv.slice(1);
    const q = String.fromCharCode(39);
    const literal = q + destino.split(q).join(q + q) + q;
    let db = null;
    try {
      db = new DatabaseSync(origen, { readOnly: true });
      db.exec("VACUUM INTO " + literal);
      db.close();
      db = null;
      const copia = new DatabaseSync(destino, { readOnly: true });
      const fila = copia.prepare("PRAGMA integrity_check").get();
      copia.close();
      const r = Object.values(fila || {})[0];
      process.stdout.write(r === "ok" ? "ok" : "la copia no pasa integrity_check: " + r);
    } catch (e) {
      process.stdout.write("VACUUM INTO falló: " + String((e && e.message) || e));
    } finally {
      try { if (db) db.close(); } catch (e) {}
    }
  ' "$origen" "$destino" 2>&1)" || salida="node no llegó a ejecutarse (${salida:-sin salida})"
  if [ "$salida" = "ok" ]; then
    return 0
  fi
  COPIAS_ERROR="${salida:-sin explicación}"
  return 1
}

respaldar_datos() {
  local motivo="${1:-manual}" destino parcial marca r archivo base
  local -a presentes=()
  while IFS= read -r r; do [ -n "$r" ] && presentes+=("$r"); done < <(rutas_de_datos)
  if [ "${#presentes[@]}" -eq 0 ]; then
    dato "sin datos que respaldar todavía"
    return 0
  fi

  marca="$(date +%Y%m%d-%H%M%S)"
  destino="$DESTINO/backups/$motivo-$marca"
  # Se escribe en una carpeta aparte y solo se renombra al final. Así un
  # respaldo a medias nunca queda con el nombre bueno: no hay forma de
  # confundir un montón de archivos sueltos con un respaldo válido.
  parcial="$DESTINO/backups/.$motivo-$marca.parcial"
  rm -rf -- "$parcial"
  mkdir -p "$parcial"

  fallo() {
    rm -rf -- "$parcial"
    morir "No he tocado nada, pero tampoco puedo respaldar tus datos:

  $1

  Sin un respaldo completo no sigo: prefiero dejarte donde estabas antes que
  actualizar o reparar encima de una copia a medias. Los respaldos anteriores,
  si los hay, siguen en $DESTINO/backups/."
  }

  for r in "${presentes[@]}"; do
    if [ "$r" = "data" ] && [ -d "$DESTINO/data" ]; then
      mkdir -p "$parcial/data"
      shopt -s nullglob
      for archivo in "$DESTINO"/data/*.db; do
        base="$(basename "$archivo")"
        # Un archivo vacío no contiene nada que perder: se ignora, no es un
        # fallo. Una base de verdad, o se copia bien o se para todo.
        [ -s "$archivo" ] || continue
        if ! copia_consistente_sqlite "$archivo" "$parcial/data/$base"; then
          shopt -u nullglob
          fallo "no pude copiar $base de forma consistente.
  $COPIAS_ERROR
  (el archivo sigue donde estaba; nada se ha modificado)"
        fi
      done
      # Todo lo demás de data/ (json, configuraciones…) se copia tal cual.
      # Los .db-wal/.db-shm no: ya están dentro de la copia del .db.
      for archivo in "$DESTINO"/data/*; do
        case "$archivo" in
          *.db|*.db-wal|*.db-shm) continue ;;
        esac
        cp -a "$archivo" "$parcial/data/" 2>/dev/null \
          || { shopt -u nullglob; fallo "no pude copiar $(basename "$archivo") de data/."; }
      done
      shopt -u nullglob
    else
      cp -a "$DESTINO/$r" "$parcial/" 2>/dev/null \
        || fallo "no pude copiar $r."
    fi
  done

  # Mismo sistema de archivos, así que este mv es un rename: o está entero
  # con su nombre definitivo, o no está.
  mv -- "$parcial" "$destino" || fallo "no pude cerrar el respaldo en $destino."
  RESPALDO_HECHO="$destino"
  bien "datos respaldados en ${destino#"$DESTINO/"}"
  podar_respaldos "$motivo"
}

# Los respaldos automáticos no pueden crecer sin fin: cada uno lleva dentro
# Sessions/ y data/ enteros, y en un teléfono eso son cientos de megas por
# copia. Se conservan los últimos (5 por defecto, SHIN_RESPALDOS_A_GUARDAR) y
# los que alguien haya hecho a mano no se tocan nunca: solo se poda el prefijo
# que pone este script, y solo con el nombre exacto que él mismo escribe.
podar_respaldos() {
  local motivo="$1" limite="${SHIN_RESPALDOS_A_GUARDAR:-5}" n=0 d patron
  case "$motivo" in pre-*) ;; *) return 0 ;; esac
  [ -d "$DESTINO/backups" ] || return 0
  case "$limite" in ''|*[!0-9]*) limite=5 ;; esac
  patron="^${motivo}-[0-9]{8}-[0-9]{6}$"
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    n=$((n + 1))
    [ "$n" -le "$limite" ] && continue
    # En una subshell: si la protección de rutas dijera que no, se avisa y se
    # sigue, en vez de tumbar una actualización que ya estaba bien.
    ( borrar_arbol "$DESTINO/backups/$d" "respaldo antiguo" ) 2>/dev/null \
      || aviso "no pude retirar el respaldo antiguo $d (puedes borrarlo tú)"
  done < <(ls -1 "$DESTINO/backups" 2>/dev/null | grep -E "$patron" | sort -r)
  return 0
}

# ¿Está el bot corriendo ahora mismo? Con WAL la copia consistente lo soporta,
# pero conviene decirlo: actualizar con el bot vivo puede dejarlo a medias.
bot_corriendo() {
  if hay pgrep; then
    pgrep -f "node .*index\.js" >/dev/null 2>&1 && return 0
    return 1
  fi
  # Sin pgrep (Termux mínimo): se mira la lista de procesos a mano.
  # shellcheck disable=SC2009
  ps -A 2>/dev/null | grep -q "[n]ode .*index\.js"
}

# ───────────────────────── instalar ─────────────────────────
clonar() {
  paso "Descargando $NOMBRE"
  destino_instalable "$DESTINO"
  local referencia="${VERSION_PEDIDA:-$RAMA}"

  if [ -d "$DESTINO" ] && [ -n "$(ls -A "$DESTINO" 2>/dev/null || true)" ]; then
    if [ -d "$DESTINO/.git" ]; then
      if estado_instalado; then
        morir "Ya existe una instalación en $DESTINO. Usa: bash install.sh --update"
      fi
      dato "instalación incompleta encontrada en $DESTINO"

      # Se INTENTA aprovecharla, pero no se depende de ello: git dentro de esa
      # carpeta puede fallar por motivos que no controlamos (en un Android, el
      # sistema mata procesos cuando se queda sin memoria, y git se muere sin
      # decir nada). Si no sale, se aparta y se instala limpio.
      if reutilizar_incompleta "$referencia"; then
        return 0
      fi
      apartar_instalacion
    else
      morir "La carpeta $DESTINO no está vacía y no es una instalación de $NOMBRE.
  Elige otra con --dir RUTA o vacíala tú mismo."
    fi
  fi

  descargar_limpio "$referencia"
}

# Intenta dejar una instalación a medias en la versión pedida, sin descargar
# nada nuevo. Devuelve 1 (y explica por qué) si no es seguro reutilizarla.
reutilizar_incompleta() {
  local referencia="$1" salida codigo
  if [ -n "$(git -C "$DESTINO" status --porcelain --untracked-files=no 2>/dev/null || true)" ]; then
    aviso "tiene cambios propios; no la reutilizo (se apartará entera, sin perderla)."
    return 1
  fi
  # Con set -e, una asignación desde un comando que falla mata el script
  # antes de poder mirar el código. El "|| codigo=$?" lo evita.
  codigo=0
  salida="$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS='' git -C "$DESTINO" fetch --quiet --tags "$REPO_URL" 2>&1)" || codigo=$?
  if [ "$codigo" -ne 0 ]; then
    # Un git que falla en silencio es lo peor: el usuario no sabe qué mirar.
    aviso "git no pudo actualizarla (código $codigo)."
    if [ -n "$salida" ]; then
      printf '        %s\n' "$salida" >&2
    else
      printf '        %s\n' "git no dijo nada; suele ser falta de memoria o un repositorio dañado." >&2
    fi
    return 1
  fi

  local objetivo
  if [ -n "$VERSION_PEDIDA" ]; then
    if ! git -C "$DESTINO" rev-parse --verify --quiet "refs/tags/$VERSION_PEDIDA" >/dev/null 2>&1 \
       && git -C "$DESTINO" rev-parse --verify --quiet "refs/tags/v$VERSION_PEDIDA" >/dev/null 2>&1; then
      VERSION_PEDIDA="v$VERSION_PEDIDA"
    fi
    objetivo="refs/tags/$VERSION_PEDIDA"
    if ! git -C "$DESTINO" rev-parse --verify --quiet "$objetivo" >/dev/null 2>&1; then
      aviso "la versión $VERSION_PEDIDA no llegó a esa carpeta; la instalo limpia."
      return 1
    fi
  else
    objetivo="FETCH_HEAD"
  fi

  if ! git -C "$DESTINO" merge-base HEAD "$objetivo" >/dev/null 2>&1; then
    aviso "esa carpeta es de otra versión del proyecto (no comparten historia)."
    return 1
  fi

  if [ -n "$VERSION_PEDIDA" ]; then
    git -C "$DESTINO" checkout --quiet --detach "$VERSION_PEDIDA" 2>/dev/null || return 1
  else
    git -C "$DESTINO" checkout --quiet -B "$RAMA" "FETCH_HEAD" 2>/dev/null || return 1
  fi
  bien "continuando en $referencia (el código de antes no se reutiliza)"
  return 0
}

# Aparta la carpeta entera con fecha en el nombre. No borra nada.
apartar_instalacion() {
  local apartada
  apartada="$DESTINO-viejo-$(date +%Y%m%d-%H%M%S)"
  aviso "aparto la carpeta anterior a $apartada y tus datos se copian a la nueva."
  if ! mv -- "$DESTINO" "$apartada"; then
    morir "No pude apartar $DESTINO. Muévela tú a otro sitio y vuelve a ejecutar."
  fi
  ULTIMO_APARTADO="$apartada"
}

# Descarga en una carpeta temporal y solo la coloca si salió bien: si el clon
# falla a mitad, no queda nada a medio escribir en su sitio definitivo.
descargar_limpio() {
  local referencia="$1" temporal salida codigo
  temporal="$DESTINO.parcial-$$"

  intentar_clon() {
    local ref="$1"
    rm -rf -- "$temporal"
    local -a args=(clone --quiet)
    if [ "$SUPERFICIAL" -eq 1 ]; then
      args+=(--depth 1 --branch "$ref")
    else
      args+=(--branch "$ref")
    fi
    codigo=0
    salida="$(GIT_TERMINAL_PROMPT=0 GIT_ASKPASS='' git "${args[@]}" "$REPO_URL" "$temporal" 2>&1)" || codigo=$?
    [ "$codigo" -eq 0 ]
  }

  local primera_salida="" primera_codigo=0
  if ! intentar_clon "$referencia"; then
    primera_salida="$salida"; primera_codigo="$codigo"
    # Escribir la versión con o sin "v" es lo normal: se prueba la otra forma
    # antes de darse por vencido.
    if [ -n "$VERSION_PEDIDA" ]; then
      local alternativa
      case "$referencia" in
        v*) alternativa="${referencia#v}" ;;
        *)  alternativa="v$referencia" ;;
      esac
      if ! intentar_clon "$alternativa"; then
        rm -rf -- "$temporal"
        salida="$primera_salida"; codigo="$primera_codigo"
        if printf '%s' "$salida" | grep -qi "not found\|does not exist\|couldn't find\|does not appear"; then
          morir "No existe la versión ${VERSION_PEDIDA} (probé con y sin la «v»).
  git dijo: ${salida}
  Lista las disponibles: git ls-remote --tags $REPO_URL"
        fi
        morir "No pude descargar la versión $VERSION_PEDIDA (código $codigo).
  git dijo: ${salida:-nada}
  Comprueba la conexión con: git ls-remote --tags $REPO_URL"
      fi
      VERSION_PEDIDA="$alternativa"
    else
      rm -rf -- "$temporal"
      morir "No pude descargar el repositorio (código $codigo).
  git dijo: ${salida:-nada}"
    fi
  fi

  # Si DESTINO existe y está vacío, `mv` metería la carpeta DENTRO de ella.
  if [ -d "$DESTINO" ]; then
    rmdir -- "$DESTINO" 2>/dev/null || true
  fi
  if ! mv -- "$temporal" "$DESTINO"; then
    rm -rf -- "$temporal"
    morir "Descargué el proyecto pero no pude colocarlo en $DESTINO."
  fi
  bien "descargado ${VERSION_PEDIDA:-$RAMA} en $DESTINO"

  # Si se apartó una instalación anterior, sus datos vuelven aquí: sesiones,
  # .env, base y respaldos. Las carpetas del código NO se copian.
  if [ -n "${ULTIMO_APARTADO:-}" ] && [ -d "$ULTIMO_APARTADO" ]; then
    local r
    for r in .env Sessions session data backups; do
      [ -e "$ULTIMO_APARTADO/$r" ] || continue
      if cp -a "$ULTIMO_APARTADO/$r" "$DESTINO/" 2>/dev/null; then
        dato "recuperado $r de la instalación anterior"
      else
        aviso "no pude recuperar $r; sigue en $ULTIMO_APARTADO/$r"
      fi
    done
    bien "la instalación anterior quedó intacta en $ULTIMO_APARTADO"
  fi
}

comprobar_espacio() {
  # Dos umbrales: por debajo del duro no se empieza (las dependencias no
  # caben), entre ambos se avisa y se deja decidir al usuario.
  local libre_kb duro_mb="${SHIN_ESPACIO_MIN_MB:-400}" aviso_mb=1200 libre_mb
  libre_kb="$(df -Pk "$DESTINO" 2>/dev/null | awk 'NR==2 {print $4}')"
  case "$libre_kb" in ''|*[!0-9]*) return 0 ;; esac   # si no se puede medir, no se bloquea
  libre_mb=$((libre_kb / 1024))
  if [ "$libre_mb" -lt "$duro_mb" ]; then
    error "Queda muy poco espacio: ${libre_mb} MB libres."
    printf '  Hacen falta al menos %s MB solo para descomprimir las dependencias.\n' "$duro_mb"
    if es_termux; then
      printf '  %sLibera espacio:%s pkg clean && rm -rf ~/.npm/_cacache\n\n' "$C_GRIS" "$C_RESET" >&2
    else
      printf '  %sLibera espacio y vuelve a intentarlo.%s\n\n' "$C_GRIS" "$C_RESET" >&2
    fi
    morir "no empiezo una instalación que no cabe."
  fi
  if [ "$libre_mb" -lt "$aviso_mb" ]; then
    aviso "quedan ${libre_mb} MB libres; la instalación completa ronda 1,2 GB."
  else
    dato "espacio libre: $(awk -v k="$libre_kb" 'BEGIN{printf "%.1f", k/1048576}') GB"
  fi
}

# ─────────────────────── npm que se atasca ───────────────────────
# En el teléfono, la segunda instalación encima de la primera acaba muchas
# veces así:
#
#   npm ERR! code EEXIST
#   npm ERR! File exists: …/node_modules/…
#   npm ERR! Remove the existing file and try again
#
# Eso es lo que en pantalla parece "archivos duplicados": no hay dos
# instalaciones, es npm intentando escribir sobre un árbol que quedó a medias
# (Android mata procesos cuando anda justo de memoria, y un `npm` que muere a
# mitad deja justo eso). No es un fallo del proyecto ni de tu teléfono: es un
# estado que se puede reconocer y reparar sin molestar al usuario.
#
# Se ejecuta npm dejando el registro en un archivo (para poder leer el motivo
# sin quitarle al usuario la barra de progreso, que en Android dura minutos).
# Si el fallo es de este tipo, se borra node_modules —se regenera solo, no hay
# nada que perder ahí— y se repite UNA vez. Cualquier otro error se devuelve
# tal cual: adivinar más que esto sería tapar un problema de verdad.
npm_instalar() {
  local modo="$1" registro="$DESTINO/.npm-instalar.log" codigo=0
  ( cd "$DESTINO" && npm "$modo" --include=optional --no-audit --no-fund 2>&1 ) \
    | tee "$registro" || codigo=$?
  if [ "$codigo" -eq 0 ]; then
    rm -f -- "$registro"
    return 0
  fi
  if grep -qiE 'EEXIST|ENOTEMPTY|file exists|already exists|dest already exists' "$registro" 2>/dev/null; then
    aviso "npm chocó con restos de una instalación anterior (archivos duplicados)."
    dato "borro node_modules y lo repito una sola vez; se regenera solo."
    if [ -d "$DESTINO/node_modules" ]; then
      borrar_arbol "$DESTINO/node_modules" "dependencias a medias"
    fi
    codigo=0
    # --prefer-offline: la caché de npm ya tiene casi todo lo descargado, y en
    # datos móviles eso se nota. Si algo falta, se baja sin más.
    ( cd "$DESTINO" && npm "$modo" --include=optional --no-audit --no-fund --prefer-offline 2>&1 ) \
      | tee "$registro" || codigo=$?
  fi
  if [ "$codigo" -eq 0 ]; then
    rm -f -- "$registro"
    return 0
  fi
  rm -f -- "$registro"
  return 1
}

instalar_dependencias() {
  paso "Instalando dependencias"
  dato "en Android esto tarda varios minutos; no cierres la terminal"
  comprobar_espacio
  local modo="install"
  [ -f "$DESTINO/package-lock.json" ] && modo="ci"
  # En una actualización NO se sale del proceso: hay que dejar que el llamador
  # revierta al commit anterior. Matar el script aquí dejaría el código nuevo
  # a medio instalar y sin vuelta atrás.
  if ! npm_instalar "$modo"; then
    if [ "$ACTUALIZANDO" -eq 1 ]; then
      error "Falló la instalación de dependencias."
      return 1
    fi
    morir "Falló la instalación de dependencias.
  Nada quedó marcado como instalado. Vuelve a ejecutar el instalador;
  si el error se repite, revisa los mensajes de npm de arriba."
  fi
  bien "dependencias instaladas"
}

# ¿Están los cuatro módulos que el bot necesita para arrancar? Es la pregunta
# más barata que se puede hacer a una instalación, y la que más veces acierta.
dependencias_sanas() {
  local m
  for m in express pino baileys sharp; do
    ( cd "$DESTINO" && node -e "require.resolve('$m')" >/dev/null 2>&1 ) || return 1
  done
  return 0
}

parches_aplicados() {
  local script
  script="$(script_de_parches || true)"
  [ -n "$script" ] || return 0
  [ -d "$DESTINO/node_modules/baileys" ] || return 1
  ( cd "$DESTINO" && node "$script" --check >/dev/null 2>&1 )
}

# ¿Ya está la carpeta en la versión objetivo y sana? Es lo que decide si una
# segunda pasada del instalador tiene algo que hacer o no.
al_dia() {
  local cabeza="$1" objetivo="" etiqueta="$VERSION_PEDIDA"
  case "$etiqueta" in
    "") ;;
    v*) ;;
    *) etiqueta="v$etiqueta" ;;
  esac
  # Pedir --branch a propósito es pedir algo, aunque el código sea el mismo:
  # una instalación fijada a una etiqueta está desprendida, y volver a la rama
  # es justo lo que se ha venido a hacer.
  if [ -z "$VERSION_PEDIDA" ] && [ "$RAMA_EXPLICITA" -eq 1 ]; then
    if [ "$(git -C "$DESTINO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)" = "HEAD" ]; then
      return 1
    fi
  fi
  if [ -n "$VERSION_PEDIDA" ]; then
    objetivo="$(git -C "$DESTINO" rev-parse --verify --quiet "refs/tags/${etiqueta}^{commit}" 2>/dev/null || true)"
  else
    objetivo="$(git -C "$DESTINO" rev-parse --verify --quiet "refs/remotes/origin/${RAMA}^{commit}" 2>/dev/null || true)"
  fi
  [ -n "$objetivo" ] || return 1
  [ "$cabeza" = "$objetivo" ] || return 1
  dependencias_sanas || return 1
  parches_aplicados
}

preparar_env() {
  [ -f "$DESTINO/.env" ] && return 0
  if [ -f "$DESTINO/.env.example" ]; then
    cp "$DESTINO/.env.example" "$DESTINO/.env"
    bien "creado .env a partir del ejemplo"
  fi
}

# ───────────────────────── verificar ─────────────────────────
# El script que aplica los parches del conector. Se llama distinto según la
# versión (patch-baileys.cjs desde 3.3; antes, patch-baileys-pairing.cjs), y un
# fork puede traer el viejo. Si no hay ninguno, es una versión anterior a los
# parches y no hay nada que reprocharle.
script_de_parches() {
  local f
  for f in scripts/patch-baileys.cjs scripts/patch-baileys-pairing.cjs; do
    if [ -f "$DESTINO/$f" ]; then printf '%s' "$f"; return 0; fi
  done
  return 1
}

verificar() {
  local fallos=0 modulos=(express pino baileys sharp) m parches=""
  parches="$(script_de_parches || true)"
  paso "Comprobando la instalación"

  if [ ! -f "$DESTINO/index.js" ]; then
    error "falta index.js en $DESTINO"; fallos=$((fallos+1))
  fi
  if [ ! -f "$DESTINO/package.json" ]; then
    error "falta package.json en $DESTINO"; fallos=$((fallos+1))
  fi
  [ "$fallos" -eq 0 ] && bien "archivos del proyecto presentes"

  for m in "${modulos[@]}"; do
    if ! ( cd "$DESTINO" && node -e "require.resolve('$m')" >/dev/null 2>&1 ); then
      error "módulo '$m' no instalado"; fallos=$((fallos+1))
    fi
  done
  [ "$fallos" -eq 0 ] && bien "dependencias clave presentes (${modulos[*]})"

  if [ -d "$DESTINO/node_modules/baileys" ]; then
    if [ -z "$parches" ]; then
      aviso "conector: esta versión no trae script de parches; no hay nada que comprobar"
    elif ( cd "$DESTINO" && node "$parches" --check >/dev/null 2>&1 ); then
      PARCHES_OK="$parches"
      bien "conector: parches aplicados ($parches)"
    else
      error "conector: los parches NO están completos ($parches)"
      printf '  %sreparar con:%s bash install.sh --repair\n' "$C_GRIS" "$C_RESET" >&2
      fallos=$((fallos+1))
    fi
  else
    aviso "conector: sin baileys instalado, no se puede comprobar todavía"
    fallos=$((fallos+1))
  fi

  if [ -w "$DESTINO" ]; then
    bien "la carpeta del proyecto es escribible"
  else
    error "la carpeta del proyecto no es escribible"; fallos=$((fallos+1))
  fi

  return "$fallos"
}

escribir_estado() {
  local version
  version="$(leer_version_paquete)"
  {
    printf 'version=%s\n' "$version"
    printf 'fecha=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "-")"
    printf 'node=%s\n' "${NODE_V:-?}"
    printf 'arquitectura=%s\n' "$(arquitectura)"
    printf 'entorno=%s\n' "$(describir_plataforma 2>/dev/null || echo '?')"
    printf 'node_origen=%s\n' "${NODE_ORIGEN:-?}"
    printf 'git_origen=%s\n' "${GIT_ORIGEN:-?}"
    printf 'instalador_sha=%s\n' "${SHIN_INSTALADOR_HUELLA:-desconocido}"
    printf 'instalador_espejo=%s\n' "${SHIN_INSTALADOR_ESPEJO:-desconocido}"
  } > "$DESTINO/.shin-install.tmp"
  mv -f "$DESTINO/.shin-install.tmp" "$DESTINO/.shin-install"
}

estado_instalado() { [ -f "$DESTINO/.shin-install" ] && [ -d "$DESTINO/node_modules" ]; }

# ¿Este proyecto trae ese script de npm? Sirve para no recomendar comandos que
# un fork antiguo no tiene: Levi-MD 3.0.3, por ejemplo, no conoce `vigia`.
tiene_script() {
  [ -f "$DESTINO/package.json" ] || return 1
  node -e 'const s=(require(process.argv[1]).scripts||{});process.exit(s[process.argv[2]]?0:1)' \
    "$DESTINO/package.json" "$1" 2>/dev/null
}

# ───────────────────────── resumen final ─────────────────────────
resumen() {
  local version
  version="$(leer_version_paquete)"
  printf '\n%s╭──────────────────────────────────────────────╮%s\n' "$C_ROSA" "$C_RESET"
  printf '%s│%s  %s%s %s%s instalado%s\n' "$C_ROSA" "$C_RESET" "$C_NEG" "$NOMBRE" "$version" "$C_RESET" "$C_RESET"
  printf '%s╰──────────────────────────────────────────────╯%s\n' "$C_ROSA" "$C_RESET"
  dato "carpeta    $DESTINO"
  dato "node       ${NODE_V:-?}   npm ${NPM_V:-?}   $(arquitectura)"
  if [ -n "${PARCHES_OK:-}" ]; then
    dato "conector   parches verificados ($PARCHES_OK)"
  fi
  # Un solo bloque por tarea, con el cd dentro: si se copia la segunda línea
  # suelta, npm se queja de que no hay package.json y no se entiende por qué.
  # Un solo comando para todo: panel arriba y el bot vigilado debajo.
  printf '\n%s  Arrancar%s\n' "$C_NEG" "$C_RESET"
  if [ -n "${LANZADOR_NOMBRE:-}" ]; then
    printf '    %s --code                  (desde cualquier carpeta, sin cd)\n' "$LANZADOR_NOMBRE"
  fi
  printf '    cd %s && npm start -- --code\n\n' "$DESTINO"
  if tiene_script consola; then
    printf '    (el panel se queda arriba y lo que dice el bot va debajo;\n'
    printf '     si se cae o pides .restart, vuelve solo y el panel no se mueve)\n\n'
  fi
  if tiene_script vigia; then
    printf '%s  En un servidor, sin panel%s\n' "$C_NEG" "$C_RESET"
    printf '    cd %s && npm run vigia -- --code\n\n' "$DESTINO"
  fi
  printf '%s  Vincular WhatsApp%s\n' "$C_NEG" "$C_RESET"
  printf '    la opción --code pide un código de 8 dígitos (WhatsApp → Dispositivos vinculados)\n'
  if tiene_script start:qr; then
    printf '    si prefieres QR:  cd %s && npm run start:qr\n\n' "$DESTINO"
  else
    printf '\n'
  fi
  printf '%s  Parar%s\n' "$C_NEG" "$C_RESET"
  printf '    Ctrl+C\n\n'
  printf '%s  Mantenerlo vivo%s\n' "$C_NEG" "$C_RESET"
  if es_termux; then
    printf '    1. baja la notificación de Termux → "Acquire wakelock"\n'
    printf '    2. Ajustes de Android → Batería → Termux → Sin restricciones\n'
    printf '    3. Android 14+: Opciones de desarrollador → Desactivar restricciones de procesos hijos\n'
    printf '    (sin esto, Android puede matar el bot al rato: no es un fallo del bot)\n\n'
  else
    printf '    en un servidor: usa tmux o systemd, o deja la terminal abierta\n\n'
  fi
  printf '%s  Actualizar / reparar / ver registros%s\n' "$C_NEG" "$C_RESET"
  if [ -n "${LANZADOR_NOMBRE:-}" ]; then
    printf '    %s update                  (actualiza y arranca)\n' "$LANZADOR_NOMBRE"
    printf '    %s repair                  (repara y arranca)\n' "$LANZADOR_NOMBRE"
  fi
  printf '    bash %s/install.sh --update\n' "$DESTINO"
  printf '    bash %s/install.sh --repair\n' "$DESTINO"
  printf '    tail -f %s/logs/*.log\n\n' "$DESTINO"
  printf '%s  Tus datos (.env, Sessions/, data/) nunca se tocan.%s\n\n' "$C_GRIS" "$C_RESET"
}

# ═══════════════════════════════════════════════════════════════════
#  ARRANCAR Y EL COMANDO `shin`
#
#  Instalar está bien; acordarse de `cd ~/Shin-MD && npm start -- --code`
#  cada vez, no. El instalador deja un lanzador en el PATH que sabe dónde
#  vive la instalación:
#
#      shin              arrancar el bot
#      shin update       actualizar y arrancar
#      shin repair       reparar y arrancar
#      shin --code       arrancar pidiendo código de vinculación
#
#  Es un archivo de veinte líneas, sin dependencias y sin magia: si algo
#  va mal, `cat "$(command -v shin)"` lo enseña entero.
# ═══════════════════════════════════════════════════════════════════

# ¿Hay ya un bot corriendo DESDE ESTA carpeta? No basta con ver un `node
# index.js` suelto: eso podría ser otro proyecto, y negarse a arrancar por un
# falso positivo deja al usuario sin bot y sin saber por qué. Se mira la carpeta
# de trabajo real de cada proceso, que es la que dice de quién es.
nuestro_bot_corriendo() {
  local pid cwd_real
  cwd_real="$(resolver_real "$DESTINO" 2>/dev/null || printf '%s' "$DESTINO")"
  hay pgrep || return 1
  for pid in $(pgrep -f 'node .*index\.js' 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    local suyo=""
    suyo="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    [ -n "$suyo" ] || suyo="$( cd "/proc/$pid/cwd" 2>/dev/null && pwd -P )" || true
    [ "$suyo" = "$cwd_real" ] && return 0
  done
  return 1
}

arrancar_bot() {
  hay node || morir "No hay Node.js instalado, así que no puedo arrancar el bot."
  [ -f "$DESTINO/index.js" ] || morir "No hay nada que arrancar en $DESTINO. Instálalo con: bash install.sh"
  # Pegar el comando otra vez con el bot en marcha no puede acabar en dos bots
  # peleándose por la misma sesión de WhatsApp y el mismo puerto.
  if nuestro_bot_corriendo; then
    aviso "ya hay un $NOMBRE corriendo desde $DESTINO; no arranco otro."
    dato "para reiniciarlo: Ctrl+C en su terminal y vuelve a escribir shin"
    return 0
  fi
  local entrada="index.js"
  [ -f "$DESTINO/scripts/consola.mjs" ] && entrada="scripts/consola.mjs"
  paso "Arrancando $NOMBRE"
  cd "$DESTINO" || morir "No pude entrar en $DESTINO."
  if [ -t 1 ]; then
    dato "deja esta terminal abierta · Ctrl+C para parar · tecla r reinicia el bot"
  fi
  # exec: el bot pasa a SER este proceso. Así Ctrl+C y el código de salida son
  # los del bot, no queda un instalador colgado detrás y, cuando el bot se
  # muere, no hay un zombie esperando a nadie.
  exec node "$entrada" ${ARRANQUE_ARGS[@]+"${ARRANQUE_ARGS[@]}"}
}

carpeta_del_lanzador() {
  if es_termux && [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
    printf '%s' "$PREFIX/bin"
    return 0
  fi
  local d="$HOME/.local/bin"
  [ -d "$d" ] || mkdir -p "$d" 2>/dev/null || return 1
  printf '%s' "$d"
}

# Deja `shin` en el PATH. Se puede repetir sin miedo: si ya está y es nuestro,
# se reescribe (por si la instalación cambió de sitio); si hay un `shin` que no
# es nuestro, no se toca y se usa el nombre del paquete.
instalar_lanzador() {
  local dir nombre="shin" archivo bash_real
  case "$DESTINO" in
    *"'"*|*'"'*|*'$'*|*'`'*|*'\'*)
      aviso "la ruta tiene comillas o \$; no creo el comando 'shin' para no escribir un script roto."
      return 0 ;;
  esac
  dir="$(carpeta_del_lanzador)" || return 0
  [ -n "$dir" ] && [ -w "$dir" ] || { aviso "$dir no es escribible; sigo sin comando 'shin'."; return 0; }
  if [ -e "$dir/shin" ] && ! grep -q 'Shin-MD' "$dir/shin" 2>/dev/null; then
    nombre="$PAQUETE"
  fi
  archivo="$dir/$nombre"
  bash_real="$(command -v bash 2>/dev/null || true)"
  [ -n "$bash_real" ] || bash_real="/bin/sh"
  # El intérprete se escribe con su ruta real porque en Android no existe
  # /bin/sh ni /usr/bin/env: un shebang "bonito" no arrancaría.
  {
    printf '#!%s\n' "$bash_real"
    printf '# %s — arranca %s desde cualquier carpeta.\n' "$nombre" "$NOMBRE"
    printf '# Lo escribe el instalador de %s. Si mueves la instalación de sitio,\n' "$NOMBRE"
    printf '# vuelve a ejecutar install.sh y se reescribe solo.\n'
    printf 'INST=%s\n' "'$DESTINO/install.sh'"
    printf 'BASH=%s\n' "'$bash_real'"
    cat <<'LANZADOR'
case "${1:-}" in
  "")                     exec "$BASH" "$INST" --run ;;
  update|actualizar)      shift; exec "$BASH" "$INST" --update --go "$@" ;;
  repair|reparar)         shift; exec "$BASH" "$INST" --repair --go "$@" ;;
  verify|comprobar)       shift; exec "$BASH" "$INST" --verify "$@" ;;
  doctor|diagnostico)     shift; exec "$BASH" "$INST" --doctor "$@" ;;
  service|servicio)       shift; exec "$BASH" "$INST" --service "$@" ;;
  uninstall|desinstalar)  shift; exec "$BASH" "$INST" --uninstall "$@" ;;
  -h|--help|help)         exec "$BASH" "$INST" --help ;;
  *)                      exec "$BASH" "$INST" --run "$@" ;;
esac
LANZADOR
  } > "$archivo.tmp.$$" || { rm -f "$archivo.tmp.$$"; aviso "no pude escribir $archivo"; return 0; }
  # Si ya estaba igual, no se toca: así `shin update` no reescribe archivos ni
  # dice nada que el usuario no necesite saber.
  if [ -f "$archivo" ] && cmp -s "$archivo" "$archivo.tmp.$$"; then
    rm -f -- "$archivo.tmp.$$"
    LANZADOR_NOMBRE="$nombre"
    return 0
  fi
  chmod 755 "$archivo.tmp.$$" 2>/dev/null || true
  mv -f "$archivo.tmp.$$" "$archivo" || { rm -f "$archivo.tmp.$$"; aviso "no pude dejar $archivo"; return 0; }
  LANZADOR_NOMBRE="$nombre"
  bien "comando '$nombre' listo ($archivo)"
  # Si esa carpeta no está en el PATH, el comando existe pero no se encuentra.
  # Solo se dice cuando el lanzador se escribe de verdad, que es cuando se
  # puede arreglar; repetirlo en cada actualización sería ruido.
  case ":$PATH:" in
    *":$dir:"*) ;;
    *) aviso "añade $dir al PATH para poder escribir solo '$nombre':"
       printf '      echo '\''export PATH="%s:$PATH"'\'' >> ~/.bashrc && . ~/.bashrc\n' "$dir" >&2 ;;
  esac
}

# ───────────────────────── acciones ─────────────────────────
accion_instalar() {
  asegurar_entorno
  extras_termux

  INSTALANDO=1
  clonar
  instalar_dependencias
  preparar_env

  if ! verificar; then
    INSTALANDO=0
    morir "La instalación quedó incompleta. Vuelve a ejecutar el instalador
  (completa solo lo que falte) o usa --repair. Tus datos no se tocaron."
  fi

  escribir_estado
  INSTALANDO=0
  wakelock
  instalar_lanzador
  resumen
}

# --run: arrancar y nada más. Es lo que hace `shin` cuando se escribe a secas.
# No comprueba versiones ni consulta el repositorio: si tienes el bot instalado
# y quieres que hable, esperar a un `git fetch` sería una tontería.
accion_arrancar() {
  arrancar_bot
}

# --auto: lo que ejecuta el comando de una línea. Mira en qué estado está la
# carpeta y hace lo mínimo: instalar si no hay nada, reparar si hay algo roto,
# actualizar si hay algo nuevo. Siempre termina arrancando el bot.
accion_auto() {
  GO=1
  if ! es_propia "$DESTINO" || [ ! -d "$DESTINO/.git" ]; then
    accion_instalar
    return 0
  fi
  if ! estado_instalado || ! dependencias_sanas || ! parches_aplicados; then
    accion_reparar
    return 0
  fi
  accion_actualizar
}

accion_actualizar() {
  exigir_destino_conocido update
  exigir_proyecto
  [ -d "$DESTINO/.git" ] || morir "$DESTINO no es un repositorio git; no puedo actualizarlo.
  Si lo instalaste sin git, vuelve a ejecutar el comando de una línea."
  asegurar_entorno
  paso "Actualizando $NOMBRE"
  if [ -n "$(git -C "$DESTINO" status --porcelain --untracked-files=no 2>/dev/null || true)" ]; then
    morir "Tienes cambios propios en archivos del proyecto. No los toco.
  Revísalos con: git -C $DESTINO status
  Guárdalos o descártalos tú, y vuelve a intentarlo."
  fi
  if bot_corriendo; then
    aviso "parece que el bot está corriendo. Para que no quede a medias, páralo"
    aviso "con Ctrl+C antes de continuar. La copia de la base sí es consistente."
  fi
  local previo esquema_antes db_del_bot
  previo="$(git -C "$DESTINO" rev-parse HEAD)"
  db_del_bot="$DESTINO/data/shin.db"
  esquema_antes="$(version_esquema_db "$db_del_bot")"

  # La consulta al repositorio va ANTES del respaldo, no después. Si no hay
  # red, se para aquí y no se ha copiado ni un byte; antes se respaldaba
  # primero, así que cada intento sin conexión dejaba un respaldo inútil
  # (y en un teléfono eso son cientos de megas repetidos).
  if ! git -C "$DESTINO" fetch --quiet --tags origin; then
    morir "No se pudo consultar el repositorio (¿sin conexión?)."
  fi

  # Repetir el mismo comando tiene que ser barato e idempotente: si el código
  # ya es el objetivo, las dependencias están enteras y los parches puestos,
  # no hay nada que hacer. Ni respaldo nuevo, ni npm, ni un segundo de espera.
  if al_dia "$previo"; then
    dato "versión actual ${previo:0:7}, que es la última de ${VERSION_PEDIDA:-$RAMA}"
    bien "no hay nada que actualizar: ni el código ni tus datos se tocan"
    instalar_lanzador
    escribir_estado
    return 0
  fi

  dato "versión actual ${previo:0:7}${esquema_antes:+   base en esquema v$esquema_antes}"
  respaldar_datos "pre-actualizacion"

  local fijada=""
  fijada="$(git -C "$DESTINO" describe --tags --exact-match HEAD 2>/dev/null || true)"
  if [ -n "$fijada" ] || [ "$(git -C "$DESTINO" rev-parse --abbrev-ref HEAD)" = "HEAD" ]; then
    # Instalación fijada a una versión concreta (clone --branch de una etiqueta
    # deja la cabeza desprendida). No se mueve sola a la rama: eso rompería la
    # promesa de "esta instalación es exactamente vX".
    if [ "$RAMA_EXPLICITA" -eq 1 ] && [ -z "$VERSION_PEDIDA" ]; then
      dato "instalación fijada en ${fijada:-${previo:0:7}}; volviendo a la rama $RAMA"
      if ! git -C "$DESTINO" checkout --quiet -B "$RAMA" "origin/$RAMA"; then
        morir "No se pudo volver a la rama $RAMA; nada se movió."
      fi
      bien "siguiendo la rama $RAMA (ya no está fijada a una versión)"
    elif [ -n "$VERSION_PEDIDA" ]; then
      dato "instalación fijada en ${fijada:-$previo}; pasando a la versión $VERSION_PEDIDA"
      if ! git -C "$DESTINO" rev-parse --verify --quiet "refs/tags/$VERSION_PEDIDA" >/dev/null 2>&1; then
        morir "No existe la versión $VERSION_PEDIDA.
  Lista las disponibles: git ls-remote --tags $REPO_URL"
      fi
      if ! git -C "$DESTINO" checkout --quiet --detach "$VERSION_PEDIDA"; then
        morir "No se pudo cambiar a la versión $VERSION_PEDIDA; nada se movió."
      fi
      bien "fijada en $VERSION_PEDIDA"
    else
      morir "Esta instalación está fijada a la versión ${fijada:-${previo:0:7}}, no a la rama $RAMA.
  No la muevo sola porque pediste esa versión concreta. Elige una de dos:
    bash install.sh --update --version vNUEVA   cambiar a otra versión
    bash install.sh --update --branch $RAMA     seguir la rama (deja de estar fijada)"
    fi
  else
    if [ -n "$VERSION_PEDIDA" ]; then
      if ! git -C "$DESTINO" rev-parse --verify --quiet "refs/tags/$VERSION_PEDIDA" >/dev/null 2>&1; then
        morir "No existe la versión $VERSION_PEDIDA.
  Lista las disponibles: git ls-remote --tags $REPO_URL"
      fi
      git -C "$DESTINO" checkout --quiet --detach "$VERSION_PEDIDA" \
        || morir "No se pudo cambiar a la versión $VERSION_PEDIDA; nada se movió."
      bien "fijada en $VERSION_PEDIDA"
    else
      if ! git -C "$DESTINO" merge --quiet --ff-only "origin/$RAMA"; then
        morir "La actualización no es una simple suma de cambios.
  No fuerzo nada: tus archivos siguen como estaban."
      fi
      bien "código actualizado a $(git -C "$DESTINO" rev-parse --short HEAD)"
    fi
  fi

  INSTALANDO=1
  ACTUALIZANDO=1
  if ! instalar_dependencias || ! verificar; then
    ACTUALIZANDO=0
    error "La nueva versión no supera las comprobaciones; vuelvo a la anterior."
    git -C "$DESTINO" checkout --quiet --detach "$previo" || aviso "no se pudo volver al commit ${previo:0:7}"
    ( cd "$DESTINO" && npm ci --include=optional --no-audit --no-fund >/dev/null 2>&1 ) || true
    INSTALANDO=0
    error "Actualización revertida. Sigues en la versión ${previo:0:7} y tus datos están intactos."
    comprobar_esquema_tras_revertir "$db_del_bot" || true
    if [ -n "${RESPALDO_HECHO:-}" ]; then dato "respaldo: ${RESPALDO_HECHO#"$DESTINO/"}"; fi
    exit 1
  fi
  ACTUALIZANDO=0
  escribir_estado
  INSTALANDO=0
  instalar_lanzador
  aviso "reinicia el bot para usar la versión nueva (Ctrl+C y npm start)."
  resumen
}

accion_reparar() {
  exigir_destino_conocido repair
  exigir_proyecto
  asegurar_entorno
  paso "Reparando dependencias"
  respaldar_datos "pre-reparacion"
  if [ -d "$DESTINO/node_modules" ]; then
    borrar_arbol "$DESTINO/node_modules" "dependencias, se regeneran"
  fi
  INSTALANDO=1
  instalar_dependencias
  if ! verificar; then
    INSTALANDO=0
    morir "La reparación no dejó la instalación sana. Revisa los mensajes de arriba."
  fi
  escribir_estado
  INSTALANDO=0
  instalar_lanzador
  bien "instalación reparada; tus sesiones y tu base siguen donde estaban"
}

accion_verificar() {
  exigir_destino_conocido verify
  exigir_proyecto
  comprobar_node || exit 1
  if [ -d "$DESTINO/.git" ]; then
    local etiqueta
    etiqueta="$(git -C "$DESTINO" describe --tags --exact-match HEAD 2>/dev/null || true)"
    if [ -n "$etiqueta" ]; then
      dato "fijada a la versión $etiqueta (no sigue la rama)"
    fi
    local esquema
    esquema="$(version_esquema_db "$DESTINO/data/shin.db")"
    [ -n "$esquema" ] && dato "base de datos en esquema v$esquema"
  fi
  if [ -f "$DESTINO/.shin-install" ]; then
    dato "marcada como instalada el $(grep -m1 '^fecha=' "$DESTINO/.shin-install" | cut -d= -f2- || echo '?')"
  else
    aviso "no hay marca de instalación completa: puede ser una instalación a medias"
  fi
  if verificar; then
    bien "todo correcto"
    return 0
  fi
  morir "hay problemas (ver arriba). Prueba: bash install.sh --repair"
}

accion_desinstalar() {
  exigir_destino_conocido uninstall
  exigir_proyecto
  case "$DESTINO" in
    "/"|"$HOME"|"") morir "Me niego a borrar $DESTINO." ;;
  esac

  local destino_datos real_destino
  real_destino="$(resolver_real "$DESTINO")"
  destino_datos="$BASE_DIR/$NOMBRE-datos-$(date +%Y%m%d-%H%M%S)"
  paso "Desinstalando $NOMBRE"
  printf '  %sSe va a borrar:%s %s\n' "$C_NEG" "$C_RESET" "$real_destino"
  if [ -d "$DESTINO/.git" ]; then
    dato "repositorio   $(git -C "$DESTINO" config --get remote.origin.url 2>/dev/null || echo 'sin remoto')"
    dato "en el commit  $(git -C "$DESTINO" rev-parse --short HEAD 2>/dev/null || echo '?')"
  fi
  if [ "$PURGAR" -eq 1 ]; then
    local cuantos_respaldos=0
    if [ -d "$DESTINO/backups" ]; then
      cuantos_respaldos="$(find "$DESTINO/backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"
    fi
    printf '  %sY TAMBIÉN tus sesiones, tu base de datos y tu .env.%s\n' "$C_ROJO" "$C_RESET"
    if [ "${cuantos_respaldos:-0}" -gt 0 ]; then
      # Con --uninstall normal los respaldos se conservan; con --purge se van
      # con todo, y eso hay que decirlo, no que se descubra después.
      printf '  %sY tus %s respaldo(s) de backups/, que con --uninstall se conservarían.%s\n' \
        "$C_ROJO" "$cuantos_respaldos" "$C_RESET"
    fi
    printf '  Eso es volver a vincular WhatsApp desde cero y perder tus datos.\n'
  else
    printf '  Tus datos (Sessions/, data/, .env) se moverán a:\n    %s\n' "$destino_datos"
    printf '  No se borra nada.\n'
  fi
  if [ "$PEDIR_CONFIRMACION" -eq 1 ]; then
    printf '\n  Escribe "si" para continuar: '
    local respuesta=""
    read -r respuesta || true
    case "$respuesta" in
      si|sí|SI|Sí|yes|y) ;;
      *) morir "cancelado; no se tocó nada." ;;
    esac
  fi
  # Borrar los datos es lo único irreversible de todo el instalador, así que
  # no se conforma con --yes: hay que escribir la frase entera.
  if [ "$PURGAR" -eq 1 ] && [ "${SHIN_PURGA_CONFIRMADA:-0}" != "1" ]; then
    printf '\n  Esta acción no se puede deshacer. Para seguir escribe: borrar todo\n  > '
    local frase=""
    read -r frase || true
    [ "$frase" = "borrar todo" ] || morir "cancelado; no se tocó nada."
  fi

  if [ "$PURGAR" -eq 0 ]; then
    mkdir -p "$destino_datos"
    local r
    while IFS= read -r r; do [ -n "$r" ] && cp -a "$DESTINO/$r" "$destino_datos/"; done < <(rutas_a_conservar)
    bien "datos guardados en $destino_datos"
  fi
  borrar_arbol "$DESTINO" "desinstalación"
  if [ "$PURGAR" -eq 1 ]; then
    printf '\n%s  Todo borrado.%s\n\n' "$C_GRIS" "$C_RESET"
  else
    printf '\n%s  Para volver: instala otra vez y copia de vuelta esas carpetas.%s\n\n' "$C_GRIS" "$C_RESET"
  fi
}

# ═══════════════════════════════════════════════════════════════════
#  --doctor : la foto de todo, en texto que se puede pegar
#
#  Existe porque "no me funciona" no es una descripción. Esto imprime,
#  de una vez y sin tocar nada, lo que hace falta para saber qué pasa:
#  plataforma, versiones, de dónde salió Node, si los parches están,
#  cuánto ocupa la sesión, espacio libre y qué dice systemd. No pide
#  red (salvo SHIN_DOCTOR_RED=1) y no lee secretos: del `.env` solo
#  dice si existe y cuántas claves tiene.
# ═══════════════════════════════════════════════════════════════════
accion_doctor() {
  [ -n "${PLATAFORMA:-}" ] || detectar_plataforma
  local fallos=0 avisos=0
  printf '\n%s%s — diagnóstico%s\n' "$C_ROSA$C_NEG" "$NOMBRE" "$C_RESET"
  printf '%s  pégalo tal cual si pides ayuda%s\n\n' "$C_GRIS" "$C_RESET"

  seccion() { printf '\n%s[%s]%s\n' "$C_NEG" "$1" "$C_RESET"; }
  ok()      { printf '  %s✓%s %s\n' "$C_VERDE" "$C_RESET" "$*"; }
  mal()     { printf '  %s✗%s %s\n' "$C_ROJO" "$C_RESET" "$*"; fallos=$((fallos+1)); }
  ojo()     { printf '  %s!%s %s\n' "$C_AMAR" "$C_RESET" "$*"; avisos=$((avisos+1)); }
  neutro()  { printf '  %s·%s %s\n' "$C_GRIS" "$C_RESET" "$*"; }

  seccion "equipo"
  neutro "$(describir_plataforma)"
  neutro "kernel $(uname -r 2>/dev/null || echo '?') · shell ${SHELL:-?}"
  if [ -n "${TERMUX_VERSION:-}" ]; then neutro "Termux $TERMUX_VERSION"; fi
  if [ -f /.dockerenv ]; then ojo "estás dentro de un contenedor: no hay systemd"; fi

  seccion "node y npm"
  if hay node; then
    local v; v="$(node -p 'process.versions.node' 2>/dev/null || echo '?')"
    if version_mayor_o_igual "$v" "$NODE_MINIMO"; then ok "node $v ($(command -v node))"
    else mal "node $v es más viejo que $NODE_MINIMO ($(command -v node))"; fi
  else mal "no hay node en el PATH"; fi
  if hay npm; then ok "npm $(npm -v 2>/dev/null || echo '?')"
  else mal "no hay npm"; fi
  hay git && ok "git $(git --version 2>/dev/null | awk '{print $3}') ($(command -v git))" || ojo "no hay git"

  seccion "instalación"
  if [ -f "$DESTINO/package.json" ]; then
    neutro "carpeta $DESTINO"
    neutro "versión $(leer_version_paquete)"
    if [ -f "$DESTINO/.shin-install" ]; then
      ok "marcada como instalada"
      neutro "$(tr '\n' ' ' < "$DESTINO/.shin-install" 2>/dev/null | cut -c1-160)"
    else ojo "sin marca .shin-install (instalación a medias o hecha a mano)"; fi
    [ -d "$DESTINO/.git" ] && neutro "git: $(git -C "$DESTINO" describe --tags --always 2>/dev/null)" \
      || neutro "sin .git (instalación sin historial)"
  else
    mal "no hay instalación en $DESTINO"
  fi

  if [ -d "$DESTINO/node_modules" ]; then
    if dependencias_sanas; then ok "módulos clave presentes"
    else mal "faltan módulos clave (express, pino, baileys o sharp)"; fi
    neutro "node_modules ocupa $(du -sh "$DESTINO/node_modules" 2>/dev/null | cut -f1)"
  else mal "no hay node_modules (ejecuta: shin repair)"; fi

  if [ -n "$(script_de_parches || true)" ]; then
    if parches_aplicados; then ok "parches del conector aplicados ($(script_de_parches))"
    else mal "los parches del conector NO están completos (ejecuta: shin repair)"; fi
  else ojo "esta versión no trae script de parches"; fi

  seccion "datos"
  [ -f "$DESTINO/.env" ] \
    && neutro ".env presente ($(grep -cE '^[A-Z_]+=' "$DESTINO/.env" 2>/dev/null || echo 0) claves; no se muestra su contenido)" \
    || ojo "no hay .env (se crea solo desde .env.example al instalar)"
  for r in Sessions session data backups; do
    [ -e "$DESTINO/$r" ] && neutro "$r: $(du -sh "$DESTINO/$r" 2>/dev/null | cut -f1)"
  done
  if [ -d "$DESTINO/backups" ]; then
    neutro "respaldos: $(ls -1 "$DESTINO/backups" 2>/dev/null | wc -l | tr -d ' ')"
  fi

  seccion "sistema"
  local libre
  libre="$(df -Pk "$DESTINO" 2>/dev/null | awk 'NR==2 {printf "%.1f GB", $4/1048576}')"
  [ -n "$libre" ] && neutro "espacio libre donde vive la instalación: $libre"
  if hay pgrep && pgrep -f "node .*index\\.js" >/dev/null 2>&1; then
    ok "hay un proceso del bot corriendo ($(pgrep -fc "node .*index\\.js" 2>/dev/null || echo 1))"
  else
    neutro "el bot no está corriendo ahora mismo"
  fi
  if hay systemctl; then
    local unidad
    for unidad in "$PAQUETE" "$PAQUETE.service" "shin-md"; do
      if systemctl list-unit-files 2>/dev/null | grep -q "^${unidad%.service}\.service"; then
        neutro "servicio $unidad: $(systemctl is-active "${unidad%.service}" 2>/dev/null || echo '?')"
        break
      fi
    done
  fi

  if [ "${SHIN_DOCTOR_RED:-0}" = "1" ]; then
    seccion "red"
    if hay curl; then
      if curl -fsS -o /dev/null --connect-timeout 8 --max-time 15 "$REPO_URL_INFO" 2>/dev/null; then
        ok "el repositorio responde"
      else ojo "no pude llegar al repositorio (¿sin conexión?)"; fi
    fi
  fi

  printf '\n'
  if [ "$fallos" -eq 0 ]; then
    if [ "$avisos" -eq 0 ]; then
      printf '  %s✓ todo en orden%s\n\n' "$C_VERDE" "$C_RESET"
    else
      printf '  %s✓ sin fallos, %s aviso(s)%s\n\n' "$C_VERDE" "$avisos" "$C_RESET"
    fi
    return 0
  fi
  printf '  %s✗ %s fallo(s)%s — lo más probable: %s\n\n' "$C_ROJO" "$fallos" "$C_RESET" \
    "$( [ -d "$DESTINO/node_modules" ] && echo 'shin repair' || echo 'volver a instalar con el comando de una línea' )"
  return 1
}

# ═══════════════════════════════════════════════════════════════════
#  --service : que el bot aguante un reinicio del VPS
#
#  En Termux esto no se usa (ahí manda Android), pero en un servidor la
#  pregunta "¿y si se reinicia?" tiene una respuesta concreta: una unidad
#  de systemd. Se genera aquí, con las rutas reales de esta instalación,
#  y se puede ver antes de escribir nada (`--print`).
# ═══════════════════════════════════════════════════════════════════
unidad_systemd() {
  local ambito="$1" node_bin ruta_servicio
  node_bin="$(command -v node 2>/dev/null || echo /usr/bin/node)"
  # El PATH de un servicio NO es el de tu terminal: si Node se instaló sin
  # root en ~/.local/opt, systemd no lo encontraría y el servicio moriría
  # con "node: not found". Se escribe el PATH exacto que funciona.
  ruta_servicio="$(dirname "$node_bin"):$HOME/.local/bin:$HOME/.local/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  cat <<UNIDAD
[Unit]
Description=$NOMBRE — bot de WhatsApp
Documentation=$REPO_URL_INFO
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DESTINO
ExecStart=$node_bin $DESTINO/index.js
Restart=always
RestartSec=5
# Si se cae 5 veces en 5 minutos, se para en vez de reiniciar en bucle.
StartLimitIntervalSec=300
StartLimitBurst=5
Environment=NODE_ENV=production
Environment=PATH=$ruta_servicio
EnvironmentFile=-$DESTINO/.env
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$PAQUETE
# Endurecimiento: sin privilegios nuevos, /tmp propio y el sistema de
# archivos del sistema de solo lectura. La carpeta del bot queda escribible.
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=no
# Lo que el bot necesita escribir de verdad: su carpeta, la caché de npm
# (por si reinstalas dependencias desde el servicio) y su propia /tmp.
ReadWritePaths=$DESTINO $HOME/.npm

[Install]
WantedBy=$( [ "$ambito" = "system" ] && echo multi-user.target || echo default.target )
UNIDAD
}

accion_servicio() {
  exigir_destino_conocido service
  exigir_proyecto
  # Un clon de desarrollo también es un proyecto válido, pero un servicio
  # del sistema apuntando a una carpeta de trabajo (que se mueve, se borra
  # o está a medio editar) es una mala idea. Solo instalaciones terminadas.
  if [ ! -f "$DESTINO/.shin-install" ]; then
    morir "$DESTINO no está marcada como instalación terminada (falta .shin-install).
  Instálala primero con el comando de una línea y vuelve a pedir el servicio."
  fi
  detectar_plataforma

  local ambito="${SERVICIO_AMBITO:-}"
  if [ -z "$ambito" ]; then
    if [ "$(id -u 2>/dev/null || echo 1)" = "0" ] || [ -n "${SUDO:-}" ]; then
      ambito="system"
    else
      ambito="user"
    fi
  fi
  local unidad
  unidad="$(unidad_systemd "$ambito")"

  if [ "$SERVICIO_PRINT" -eq 1 ] || ! hay systemctl; then
    printf '\n%s  Unidad de systemd (%s)%s\n\n' "$C_NEG" "$ambito" "$C_RESET"
    printf '%s\n' "$unidad"
    if ! hay systemctl; then
      printf '\n  %s!%s Este equipo no tiene systemd. Guarda el bloque de arriba en\n' "$C_AMAR" "$C_RESET" >&2
      printf '     /etc/systemd/system/%s.service si lo hubiera, o usa pm2:\n' "$PAQUETE" >&2
      printf '       npm install -g pm2 && pm2 start index.js --name %s && pm2 save\n\n' "$PAQUETE" >&2
      return 0
    fi
    return 0
  fi

  local archivo como
  if [ "$ambito" = "system" ]; then
    archivo="/etc/systemd/system/$PAQUETE.service"
    como="$SUDO"
  else
    archivo="$HOME/.config/systemd/user/$PAQUETE.service"
    como=""
  fi

  step_confirmar() {
    [ "$PEDIR_CONFIRMACION" -eq 1 ] || return 0
    printf '  %s?%s Voy a escribir %s y activar el servicio. ¿Sigo? [S/n] ' "$C_AMAR" "$C_RESET" "$archivo" >&2
    local r=""; read -r r || return 1
    case "$r" in ""|s|S|si|sí|SI|Sí|y|Y) return 0 ;; *) return 1 ;; esac
  }
  if ! step_confirmar; then
    printf '\n  %scancelado; no escribí nada.%s\n\n' "$C_GRIS" "$C_RESET" >&2
    return 1
  fi

  # Se escribe en un temporal y se mueve con `mv`: si algo falla a mitad, no
  # queda una unidad a medio escribir que systemd intentaría cargar.
  local tmp="$archivo.tmp.$$" carpeta
  carpeta="$(dirname "$archivo")"
  if [ -n "$como" ] && [ "$(id -u 2>/dev/null || echo 1)" != "0" ]; then
    $como mkdir -p "$carpeta" || morir "No pude crear $carpeta (¿hacen falta permisos?)."
    printf '%s\n' "$unidad" | $como tee "$tmp" >/dev/null 2>&1 \
      || morir "No pude escribir en $archivo (¿hacen falta permisos?)."
    $como mv -f "$tmp" "$archivo" || morir "No pude dejar la unidad en $archivo."
    $como systemctl daemon-reload || true
    $como systemctl enable --now "$PAQUETE" \
      || morir "La unidad está escrita, pero no arrancó. Mira: journalctl -u $PAQUETE -n 50"
  else
    mkdir -p "$carpeta" || morir "No pude crear $carpeta."
    printf '%s\n' "$unidad" > "$tmp" || morir "No pude escribir en $archivo."
    mv -f "$tmp" "$archivo" || morir "No pude dejar la unidad en $archivo."
    if [ "$ambito" = "system" ]; then
      systemctl daemon-reload || true
      systemctl enable --now "$PAQUETE" \
        || morir "La unidad está escrita, pero no arrancó. Mira: journalctl -u $PAQUETE -n 50"
    else
      systemctl --user daemon-reload || true
      systemctl --user enable --now "$PAQUETE" \
        || morir "La unidad está escrita, pero no arrancó. Mira: journalctl --user -u $PAQUETE -n 50"
      printf '\n'
      aviso "los servicios de usuario se paran al cerrar la sesión."
      dato "para que siga tras el logout:  sudo loginctl enable-linger $USER"
    fi
  fi
  bien "servicio $PAQUETE activo (ámbito $ambito)"
  dato "ver qué dice:      journalctl -u $PAQUETE -f   (o --user)"
  dato "pararlo:           systemctl disable --now $PAQUETE"
  printf '\n'
}

ayuda() {
  # La ayuda es la cabecera de este mismo archivo. Se busca por marcadores y no
  # por número de línea: con rangos fijos, añadir una opción dejaba la mitad de
  # la ayuda fuera (y nadie lo nota hasta que alguien la pide).
  sed -n '/^#  Uso:/,/^# ═/p' "$0" | sed 's/^# \{0,1\}//' | sed '$d'
}

# ───────────────────────── argumentos ─────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --update|--actualizar)     ACCION="update" ;;
    --repair|--reparar)        ACCION="repair" ;;
    --verify|--verificar)      ACCION="verify" ;;
    --uninstall|--desinstalar) ACCION="uninstall" ;;
    --purge|--purgar)          PURGAR=1 ;;
    --yes|-y)                  PEDIR_CONFIRMACION=0 ;;
    --shallow)                 SUPERFICIAL=1 ;;
    --branch)
      [ $# -ge 2 ] || morir "--branch necesita un nombre (por ejemplo main)"
      RAMA="$2"; RAMA_EXPLICITA=1; shift ;;
    --version|-v)
      [ $# -ge 2 ] || morir "--version necesita una etiqueta (por ejemplo v3.2.1)"
      VERSION_PEDIDA="$2"; shift ;;
    --no-boost)                BOOST=0 ;;
    --auto|--automatico)       ACCION="auto" ;;
    --run|--arrancar)          ACCION="run" ;;
    --doctor|--diagnostico)    ACCION="doctor" ;;
    --service|--servicio)      ACCION="service" ;;
    --print|--imprimir)        SERVICIO_PRINT=1 ;;
    --user|--usuario)          SERVICIO_AMBITO="user" ;;
    --system|--sistema)        SERVICIO_AMBITO="system" ;;
    --no-arrancar|--no-start)  SIN_ARRANQUE=1 ;;
    --go|--iniciar)            GO=1 ;;
    --code|--qr)               ARRANQUE_ARGS+=("$1") ;;
    --dir)
      [ $# -ge 2 ] || morir "--dir necesita una ruta"
      DESTINO="$2"; DESTINO_EXPLICITO=1; shift ;;
    -h|--help)                 ayuda; exit 0 ;;
    *) morir "opción desconocida: $1 (usa --help)" ;;
  esac
  shift
done

# Si se ejecuta desde dentro de una instalación, opera sobre ella.
if [ "$DESTINO_EXPLICITO" -eq 0 ]; then
  ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$ORIGEN/package.json" ] && es_propia "$ORIGEN"; then
    # Si se llegó hasta aquí por un enlace, se trabaja sobre la ruta real:
    # así el resto de protecciones no tiene que pelear con el enlace del cwd.
    DESTINO="$(resolver_real "$ORIGEN")"
    ORIGEN_DEDUCIDO=1
    # Los datos deben quedar JUNTO a la instalación, no en $HOME.
    BASE_DIR="$(dirname "$DESTINO")"
  fi
fi

case "$ACCION" in
  update)    accion_actualizar ;;
  repair)    accion_reparar ;;
  verify)    accion_verificar ;;
  uninstall) accion_desinstalar ;;
  auto)      accion_auto ;;
  run)       accion_arrancar ;;
  doctor)    accion_doctor ;;
  service)   accion_servicio ;;
  "")
    if estado_instalado; then
      paso "Ya hay una instalación en $DESTINO"
      accion_actualizar
    else
      accion_instalar
    fi
    ;;
esac

# --go (y --auto, que lo implica) arrancan el bot al terminar. Va con `if` y no
# con `&&` a propósito: como última orden del script, un `&&` que no se cumple
# dejaría el instalador saliendo con código 1 sin haber fallado nada.
if [ "$SIN_ARRANQUE" -eq 1 ]; then GO=0; fi
if [ "$GO" -eq 1 ]; then
  arrancar_bot
fi
