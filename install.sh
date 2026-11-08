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
#
#  Opciones:
#    --dir RUTA     instalar en otra carpeta (por defecto ~/Shin-MD)
#    --version TAG  instalar (o pasar a) una versión concreta
#    --branch RAMA  seguir esa rama en vez de main
#    --yes          no preguntar
#    --shallow      clon rápido sin historial (no permite volver atrás)
#    --no-boost     no intentar el wakelock en Termux
# ═══════════════════════════════════════════════════════════════════
set -Eeuo pipefail

readonly REPO_URL="${SHIN_REPO_URL:-https://github.com/riokuroxi-svg/Shin-MD.git}"
RAMA="${SHIN_BRANCH:-main}"
readonly NODE_MINIMO="22.5.0"
readonly NPM_MINIMO="10.0.0"
readonly NOMBRE="Shin-MD"

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
  morir "No sé sobre qué instalación actuar.
  Ejecuta este script desde la carpeta de la instalación, o indica la ruta:
    bash install.sh --dir RUTA --$1"
}

# Antes de tocar nada: ¿esta carpeta es de verdad una instalación?
exigir_proyecto() {
  [ -f "$DESTINO/package.json" ] || morir "No hay ninguna instalación de $NOMBRE en $DESTINO."
  if ! grep -q '"name"[[:space:]]*:[[:space:]]*"shin-md"' "$DESTINO/package.json"; then
    morir "$DESTINO no parece una instalación de $NOMBRE; no voy a tocar esa carpeta."
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
preparar_termux() {
  es_termux || return 0
  # Termux pone $PREFIX/bin en el PATH; si alguien arranca con un PATH raro,
  # lo añadimos para que pkg, git y termux-wake-lock se encuentren igual.
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then
    case ":$PATH:" in
      *":$PREFIX/bin:"*) ;;
      *) PATH="$PREFIX/bin:$PATH"; export PATH ;;
    esac
  fi
  paso "Android / Termux detectado"
  dato "PREFIX=$PREFIX"
  dato "arquitectura $(arquitectura)"

  if hay pkg; then
    if ! hay git; then
      dato "instalando git…"
      pkg install -y git >/dev/null 2>&1 || morir "No se pudo instalar git con pkg."
    fi
    if ! comprobar_node; then
      dato "instalando nodejs-lts… (puede tardar varios minutos)"
      pkg install -y nodejs-lts >/dev/null 2>&1 || morir "No se pudo instalar nodejs-lts."
      comprobar_node || morir "Node sigue sin cumplir el mínimo tras instalarlo."
    fi
    # Opcionales: si fallan, el bot arranca igual.
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
  else
    aviso "Estás en Termux pero no encuentro 'pkg'. Instala git y nodejs-lts a mano."
  fi
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

instalar_dependencias() {
  paso "Instalando dependencias"
  dato "en Android esto tarda varios minutos; no cierres la terminal"
  comprobar_espacio
  # En una actualización NO se sale del proceso: hay que dejar que el llamador
  # revierta al commit anterior. Matar el script aquí dejaría el código nuevo
  # a medio instalar y sin vuelta atrás.
  if [ -f "$DESTINO/package-lock.json" ]; then
    if ! ( cd "$DESTINO" && npm ci --include=optional --no-audit --no-fund ); then
      if [ "$ACTUALIZANDO" -eq 1 ]; then
        error "Falló la instalación de dependencias."
        return 1
      fi
      morir "Falló la instalación de dependencias.
  Nada quedó marcado como instalado. Vuelve a ejecutar el instalador;
  si el error se repite, revisa los mensajes de npm de arriba."
    fi
  else
    if ! ( cd "$DESTINO" && npm install --include=optional --no-audit --no-fund ); then
      if [ "$ACTUALIZANDO" -eq 1 ]; then
        error "Falló la instalación de dependencias."
        return 1
      fi
      morir "Falló la instalación de dependencias."
    fi
  fi
  bien "dependencias instaladas"
}

preparar_env() {
  [ -f "$DESTINO/.env" ] && return 0
  if [ -f "$DESTINO/.env.example" ]; then
    cp "$DESTINO/.env.example" "$DESTINO/.env"
    bien "creado .env a partir del ejemplo"
  fi
}

# ───────────────────────── verificar ─────────────────────────
verificar() {
  local fallos=0 modulos=(express pino baileys sharp) m
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
    if ( cd "$DESTINO" && node scripts/patch-baileys.cjs --check >/dev/null 2>&1 ); then
      bien "conector: los 8 parches aplicados"
    else
      error "conector: los parches NO están completos"
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
  } > "$DESTINO/.shin-install.tmp"
  mv -f "$DESTINO/.shin-install.tmp" "$DESTINO/.shin-install"
}

estado_instalado() { [ -f "$DESTINO/.shin-install" ] && [ -d "$DESTINO/node_modules" ]; }

# ───────────────────────── resumen final ─────────────────────────
resumen() {
  local version
  version="$(leer_version_paquete)"
  printf '\n%s╭──────────────────────────────────────────────╮%s\n' "$C_ROSA" "$C_RESET"
  printf '%s│%s  %s%s %s%s instalado%s\n' "$C_ROSA" "$C_RESET" "$C_NEG" "$NOMBRE" "$version" "$C_RESET" "$C_RESET"
  printf '%s╰──────────────────────────────────────────────╯%s\n' "$C_ROSA" "$C_RESET"
  dato "carpeta    $DESTINO"
  dato "node       ${NODE_V:-?}   npm ${NPM_V:-?}   $(arquitectura)"
  dato "conector   8 parches verificados"
  # Un solo bloque por tarea, con el cd dentro: si se copia la segunda línea
  # suelta, npm se queja de que no hay package.json y no se entiende por qué.
  printf '\n%s  Arrancar de una vez%s\n' "$C_NEG" "$C_RESET"
  printf '    cd %s && npm start -- --code\n\n' "$DESTINO"
  printf '%s  Con reinicio automático (si se cae, vuelve solo)%s\n' "$C_NEG" "$C_RESET"
  printf '    cd %s && npm run vigia -- --code\n\n' "$DESTINO"
  printf '%s  Vincular WhatsApp%s\n' "$C_NEG" "$C_RESET"
  printf '    la opción --code pide un código de 8 dígitos (WhatsApp → Dispositivos vinculados)\n'
  printf '    si prefieres QR:  cd %s && npm run start:qr\n\n' "$DESTINO"
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
  printf '    bash %s/install.sh --update\n' "$DESTINO"
  printf '    bash %s/install.sh --repair\n' "$DESTINO"
  printf '    tail -f %s/logs/*.log\n\n' "$DESTINO"
  printf '%s  Tus datos (.env, Sessions/, data/) nunca se tocan.%s\n\n' "$C_GRIS" "$C_RESET"
}

# ───────────────────────── acciones ─────────────────────────
accion_instalar() {
  preparar_termux
  comprobar_node || exit 1
  comprobar_npm  || exit 1
  paso "Entorno"
  bien "node $NODE_V   npm $NPM_V   $(arquitectura)"

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
  resumen
}

accion_actualizar() {
  exigir_destino_conocido update
  exigir_proyecto
  [ -d "$DESTINO/.git" ] || morir "$DESTINO no es un repositorio git; no puedo actualizarlo."
  comprobar_node || exit 1
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
  respaldar_datos "pre-actualizacion"
  local previo esquema_antes db_del_bot
  previo="$(git -C "$DESTINO" rev-parse HEAD)"
  db_del_bot="$DESTINO/data/shin.db"
  esquema_antes="$(version_esquema_db "$db_del_bot")"
  dato "versión actual ${previo:0:7}${esquema_antes:+   base en esquema v$esquema_antes}"

  if ! git -C "$DESTINO" fetch --quiet --tags origin; then
    morir "No se pudo consultar el repositorio (¿sin conexión?)."
  fi

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
  aviso "reinicia el bot para usar la versión nueva (Ctrl+C y npm start)."
  resumen
}

accion_reparar() {
  exigir_destino_conocido repair
  exigir_proyecto
  comprobar_node || exit 1
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

ayuda() {
  sed -n '5,30p' "$0" | sed 's/^# \{0,1\}//'
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
  if [ -f "$ORIGEN/package.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"shin-md"' "$ORIGEN/package.json"; then
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
  "")
    if estado_instalado; then
      paso "Ya hay una instalación en $DESTINO"
      accion_actualizar
    else
      accion_instalar
    fi
    ;;
esac
