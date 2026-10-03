# -*- coding: utf-8 -*-
"""
Genera los gráficos del README de Shin-MD (estilo pastel / dashboard anime).

Todo sale como SVG autocontenido:
  · sin fuentes externas  → el texto se convierte a trazado vectorial
  · sin servicios web      → la mascota va embebida como data URI
  · claro + oscuro         → cada pieza tiene su versión para tema del sistema

Salidas (docs/assets/pastel/):
  hero-claro.svg / hero-oscuro.svg      banner principal
  divisor-claro.svg / divisor-oscuro.svg
  insignia-*.svg                        botones de estado (cambian con el tema)
  pie-claro.svg / pie-oscuro.svg

Uso:  python3 tools/build_pastel.py
"""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, "docs", "assets", "pastel")

sys.path.insert(0, AQUI)
from svgkit import Fuente, Lienzo, corazon, esc, estrella, formato, icono, uri_imagen  # noqa: E402

# --------------------------------------------------------------------------
# Los números que salen en el arte. Si el repositorio ya trae
# docs/assets/datos.json (lo genera el propio bot), se leen de ahí y este arte
# nunca se queda desfasado. Si no está, se usan los valores de abajo, que son
# los reales del repositorio al escribir esto.
# --------------------------------------------------------------------------
DATOS_DE_RESPALDO = dict(
    comandos=210, nombres=744, alias=534, categorias=15,
    pruebas=140, pruebas_total=140, version="3.0.3",
    node="22.5", baileys="6.7.24", licencia="AGPL-3.0-only",
)


def cargar_datos():
    """Los números reales del bot: primero docs/assets/datos.json, si no existe
    se usan los de respaldo. Así el arte nunca enseña una cifra vieja."""
    datos = dict(DATOS_DE_RESPALDO)
    ruta = os.path.join(RAIZ, "docs", "assets", "datos.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as fh:
            crudo = json.load(fh)
        for clave, valor in crudo.items():
            if valor is not None:
                datos[clave] = valor
        if crudo.get("pruebasTotal"):
            datos["pruebas_total"] = crudo["pruebasTotal"]
        datos["origen"] = "docs/assets/datos.json"
    else:
        datos["origen"] = "valores de respaldo en tools/build_pastel.py"
    return datos


D = cargar_datos()
C = D["comandos"]           # comandos únicos
N = D["nombres"]            # nombres en total (comandos + alias)
A = D["alias"]              # alias adicionales
P_ = D["pruebas"]           # pruebas en verde
CAT = D["categorias"]       # categorías
V = D["version"]

F = os.path.join(AQUI, "fuentes") if os.path.isdir(os.path.join(AQUI, "fuentes")) else AQUI
baloo = Fuente(os.path.join(F, "Baloo2.ttf"), peso=800)
baloo_med = Fuente(os.path.join(F, "Baloo2.ttf"), peso=600)
nunito = Fuente(os.path.join(F, "Nunito.ttf"), peso=700)
nunito_med = Fuente(os.path.join(F, "Nunito.ttf"), peso=600)
nunito_suave = Fuente(os.path.join(F, "Nunito.ttf"), peso=500)
quicksand = Fuente(os.path.join(F, "Quicksand.ttf"), peso=600)
mono = Fuente("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")
cjk = Fuente("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", familia_cjk="Noto Sans CJK JP")

MASCOTA = uri_imagen(os.path.join(SALIDA, "mascota.png"))


# --------------------------------------------------------------------------
# paletas
# --------------------------------------------------------------------------
CLARO = dict(
    fondo1="#FFF7FA", fondo2="#FDEBF1", fondo3="#F6F9F4",
    tinta="#3D2130", tinta_suave="#8E6F7E", tinta_tenue="#B99AA8",
    rosa="#F0689B", rosa_fuerte="#D8437A", rosa_claro="#FFD3E2", rosa_palido="#FFEAF2",
    menta="#3FBF95", menta_claro="#D3F2E6",
    crema="#F5B23F", crema_claro="#FFEEDA",
    blanco="#FFFFFF", tarjeta="#FFFFFF", borde="#F6DCE6",
    terminal="#3D2130", terminal_texto="#FFF2F7", terminal_suave="#C9A6B6",
    terminal_linea="#5A3446",
    sombra="#C4799A",
    pildora="#2A1A23", pildora_texto="#FFF2F7", pildora_suave="#C9A6B6",
)
PASTEL_FIJO = dict(pildora="#2A1A23", pildora_texto="#FFF2F7", pildora_suave="#C9A6B6")


def oscura(claro):
    P = dict(
        fondo1="#2A1A23", fondo2="#3A2331", fondo3="#241820",
        tinta="#FFF1F6", tinta_suave="#D3B0C0", tinta_tenue="#A9869A",
        rosa="#FF8FBB", rosa_fuerte="#FFA8CB", rosa_claro="#5C3247", rosa_palido="#432738",
        menta="#6FE0B4", menta_claro="#2C4A40",
        crema="#FFCB74", crema_claro="#4A3A26",
        blanco="#FFFFFF", tarjeta="#3B2431", borde="#543244",
        terminal="#1E1219", terminal_texto="#FFF2F7", terminal_suave="#B68FA0",
        terminal_linea="#4A2B3A",
        sombra="#120A0E",
    )
    P.update(PASTEL_FIJO)
    return P


# --------------------------------------------------------------------------
# piezas reutilizables
# --------------------------------------------------------------------------
def texto(c, fuente, txt, tam, x, base, color, tracking=0.0, opacidad=None, trazo=None, grosor=0):
    d = fuente.trazado(txt, tam, x, base, tracking)
    if not d:
        return 0
    c.camino(d, color if trazo is None else "none", trazo=trazo, grosor=grosor, opacidad=opacidad)
    return fuente.ancho(txt, tam, tracking)


def texto_centrado(c, fuente, txt, tam, cx, base, color, tracking=0.0, opacidad=None):
    ancho = fuente.ancho(txt, tam, tracking)
    texto(c, fuente, txt, tam, cx - ancho / 2, base, color, tracking, opacidad)
    return ancho


def chip(c, x, cy, h, txt, P, fuente=None, fondo=None, color=None, icono_nombre=None,
         icono_color=None, borde=None, tam=None, sep=10):
    """Píldora con texto (y opcionalmente un iconito dibujado). Devuelve su ancho."""
    fuente = fuente or quicksand
    fondo = fondo if fondo is not None else P["blanco"]
    color = color or P["tinta"]
    tam = tam or h * 0.44
    izq = h * 0.62
    x_icono = x + izq
    ancho_icono = 0
    if icono_nombre:
        ancho_icono = h * 0.68 + sep
    ancho_txt = fuente.ancho(txt, tam, 0.2)
    w = izq * 2 + ancho_icono + ancho_txt
    if c is None:          # modo "solo medir"
        return w
    c.rect(x, cy - h / 2, w, h, h / 2, fondo, trazo=borde, grosor=1.4 if borde else 0)
    if icono_nombre:
        c.agrega(icono(icono_nombre, x_icono, cy, h * 0.28, icono_color or color, grosor=max(1.6, h * 0.075)))
    texto(c, fuente, txt, tam, x + izq + ancho_icono, cy + fuente.alto(tam, "cap") / 2, color, tracking=0.2)
    return w


def ornamento(c, x, y, tam, color, giro=0, opacidad=0.85):
    c.agrega(estrella(x, y, tam, color, giro=giro, opacidad=opacidad))
    c.agrega(estrella(x, y, tam * 0.45, color, giro=giro + 45, opacidad=opacidad))


# --------------------------------------------------------------------------
# HERO
# --------------------------------------------------------------------------
ANCHO, ALTO = 1200, 660


def hero(P, nombre):
    c = Lienzo(ANCHO, ALTO, "Shin-MD — bot de WhatsApp con anti-ban propio")
    # --- gradientes y filtros
    c.gradiente_lineal("fondo", [("0", P["fondo1"]), ("0.55", P["fondo2"]), ("1", P["fondo3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.gradiente_radial("halo", [("0", P["rosa"], "0.28"), ("0.6", P["rosa"], "0.09"), ("1", P["rosa"], "0")])
    c.gradiente_radial("halo2", [("0", P["menta"], "0.18"), ("1", P["menta"], "0")])
    opaca = 0.30 if P is CLARO else 0.55
    c.sombra("sombra", dy=8, desenfoque=14, color=P["sombra"], opacidad=opaca)
    c.sombra("sombra-suave", dy=4, desenfoque=9, color=P["sombra"], opacidad=opaca * 0.7)
    c.defs_agrega(
        '<pattern id="puntos" width="26" height="26" patternUnits="userSpaceOnUse">'
        '<circle cx="2" cy="2" r="1.5" fill="%s" opacity="0.5"/></pattern>' % P["rosa_claro"]
    )
    c.rect(0, 0, ANCHO, ALTO, 0, "url(#fondo)")
    c.rect(0, 0, ANCHO, ALTO, 0, "url(#puntos)", opacidad=0.5)

    # --- franjas diagonales (esquina superior izquierda)
    c.agrega('<g transform="rotate(-14 0 40)">')
    for i, (color, op) in enumerate([(P["rosa"], 0.55), (P["menta"], 0.45), (P["crema"], 0.45), (P["rosa"], 0.25)]):
        c.rect(-120, 6 + i * 17, 430 + i * 26, 7, 3.5, color, opacidad=op)
    c.agrega("</g>")

    # --- manchas suaves
    c.elipse(1120, 60, 240, 200, "url(#halo2)")
    c.elipse(1080, 560, 320, 260, "url(#halo)", opacidad=0.75)
    c.elipse(140, 600, 260, 220, "url(#halo)", opacidad=0.5)

    # --- marca (arriba a la izquierda)
    c.circulo(84, 76, 27, P["blanco"], trazo=P["borde"], grosor=1.5, filtro="sombra-suave")
    kanji_chico = "反魂"
    c.camino(cjk.trazado(kanji_chico, 26, 84 - cjk.ancho(kanji_chico, 26) / 2, 76 + 26 * 0.34), P["rosa_fuerte"])
    texto(c, quicksand, "SHIN-MD", 25, 124, 76 + quicksand.alto(25, "cap") / 2, P["tinta"], tracking=1.6)
    texto(c, nunito_suave, "bot de WhatsApp", 17, 124 + quicksand.ancho("SHIN-MD", 25, 1.6) + 12,
          76 + quicksand.alto(25, "cap") / 2, P["tinta_tenue"], tracking=0.3)

    # --- navegación (arriba a la derecha, encima de la tarjeta de terminal)
    enlaces = [("docs/web", "marcador"), ("Shin-Lab", "rayo"), ("AGPL-3.0", "escudo")]
    tam_nav = 17
    anchos = [quicksand.ancho(t, tam_nav, 0.2) + 30 for t, _ in enlaces]
    total = sum(anchos) + 26 * (len(enlaces) - 1)
    x = 1136 - total
    for (etiqueta, icono_nombre), w in zip(enlaces, anchos):
        c.agrega(icono(icono_nombre, x + 8, 44, 7, P["rosa"], grosor=2))
        texto(c, quicksand, etiqueta, tam_nav, x + 22, 44 + quicksand.alto(tam_nav, "cap") / 2,
              P["tinta_suave"], tracking=0.2)
        x += w + 26

    # --- título: SHIN en tinta, -MD en rosa
    texto(c, baloo, "SHIN", 92, 64, 226, P["tinta"], tracking=-1.5)
    ancho_shin = baloo.ancho("SHIN", 92, -1.5)
    texto(c, baloo, "-MD", 92, 64 + ancho_shin, 226, P["rosa_fuerte"], tracking=-1.5)
    ancho_nombre = ancho_shin + baloo.ancho("-MD", 92, -1.5)
    c.rect(66, 240, ancho_nombre * 0.72, 10, 5, P["rosa"], opacidad=0.9)
    texto(c, nunito_med, "反魂 · el renacer de un bot superior", 22, 68, 280, P["rosa_fuerte"], tracking=0.6)
    texto(c, nunito_suave, "No se cae, no se banea y no borra tu sesión.", 23, 66, 320, P["tinta_suave"], tracking=0.2)

    # --- píldora de arranque
    c.rect(66, 356, 372, 54, 27, P["pildora"], filtro="sombra")
    c.circulo(98, 383, 15, P["menta"])
    c.agrega(icono("rayo", 98, 383, 8, P["pildora"], grosor=2))
    texto(c, mono, "npm start -- --code", 19, 124, 383 + 19 * 0.35, P["pildora_texto"], tracking=0.2)
    texto(c, nunito_suave, "8 caracteres en pantalla · o --qr si prefieres", 15, 68, 434, P["tinta_tenue"], tracking=0.2)

    # --- columna derecha: tarjeta de terminal
    tx, ty, tw, th = 736, 72, 400, 252
    c.rect(tx, ty, tw, th, 24, P["terminal"], filtro="sombra")
    c.rect(tx + 1.5, ty + 1.5, tw - 3, th - 3, 23, "none", trazo=P["terminal_linea"], grosor=1.5)
    for i, color in enumerate([P["rosa"], P["crema"], P["menta"]]):
        c.circulo(tx + 30 + i * 22, ty + 30, 7, color)
    texto(c, mono, "shin-md v%s — npm start" % V, 15, tx + 108, ty + 36, P["terminal_suave"], tracking=0.2)
    c.linea(tx + 24, ty + 52, tx + tw - 24, ty + 52, P["terminal_linea"], 1.5)

    renglones = [
        ("sesión", "SQLite WAL · sin corrupción", P["menta"]),
        ("comandos", "%d cargados · 0 errores" % C, P["terminal_texto"]),
        ("anti-ban", "jitter σ 0.25 · warm-up", P["rosa"]),
        ("panel", "127.0.0.1:3000/health", P["terminal_texto"]),
        ("riesgo", "0-100 · pausa sola si sube", P["crema"]),
    ]
    yy = ty + 80
    for etiqueta, valor, color in renglones:
        c.circulo(tx + 30, yy - 5, 4, color)
        texto(c, mono, etiqueta, 15, tx + 46, yy, P["terminal_suave"], tracking=0.2)
        texto(c, mono, valor, 15, tx + 152, yy, color, tracking=0.2)
        yy += 30
    c.linea(tx + 24, ty + th - 44, tx + tw - 24, ty + th - 44, P["terminal_linea"], 1.5)
    texto(c, mono, "$ npm test", 15, tx + 30, ty + th - 20, P["terminal_suave"], tracking=0.2)
    texto(c, mono, "%d/%d ✓" % (P_, D["pruebas_total"]), 15, tx + 152, ty + th - 20, P["menta"], tracking=0.2)

    # --- lista de logros (derecha, bajo la terminal)
    logros = [
        ("anti-ban propio", "jitter gaussiano", P["menta"]),
        ("%d comandos" % C, "%d alias" % A, P["crema"]),
        ("Node ≥ %s" % D["node"], "node:sqlite nativo", P["rosa"]),
        ("Termux listo", "Android · VPS", P["menta"]),
    ]
    ly = 366
    for etiqueta, detalle, color in logros:
        c.agrega(estrella(tx + 12, ly - 5, 8, color, giro=10, opacidad=0.95))
        texto(c, quicksand, etiqueta, 19, tx + 32, ly, P["tinta"], tracking=0.2)
        ancho_et = quicksand.ancho(etiqueta, 19, 0.2)
        texto(c, nunito_suave, detalle, 16, tx + 32 + ancho_et + 10, ly, P["tinta_tenue"], tracking=0.2)
        c.linea(tx + 6, ly + 18, tx + tw, ly + 18, P["borde"], 1.2)
        ly += 38

    # --- fila de tarjetas de datos
    tarjetas = [
        ("PRUEBAS", "%d" % P_, "22 archivos", "escudo", P["menta"]),
        ("COMANDOS", "%d" % C, "%d categorías" % CAT, "rayo", P["crema"]),
        ("NOMBRES", "%d" % N, "%d alias" % A, "chat", P["rosa"]),
        ("JITTER", "σ 0.25", "gaussiano", "campana", P["menta"]),
    ]
    cw, sep, ch = 253, 20, 104
    cy0 = ALTO - ch - 22
    for i, (etiqueta, valor, nota, icono_nombre, color) in enumerate(tarjetas):
        x = 64 + i * (cw + sep)
        c.rect(x, cy0, cw, ch, 22, P["tarjeta"], filtro="sombra-suave",
               trazo=P["borde"] if P is not CLARO else None, grosor=1.4)
        c.rect(x, cy0, 8, ch, 4, color)
        texto(c, nunito, etiqueta, 14, x + 26, cy0 + 32, P["tinta_tenue"], tracking=1.6)
        texto(c, baloo, valor, 40, x + 24, cy0 + 74, P["tinta"], tracking=-0.5)
        ancho_valor = baloo.ancho(valor, 40, -0.5)
        texto(c, nunito_suave, nota, 15, x + 34 + ancho_valor, cy0 + 74, P["tinta_suave"], tracking=0.2)
        c.agrega(icono(icono_nombre, x + cw - 32, cy0 + 32, 13, color, grosor=2.2))

    # --- mascota
    alto_m = 384
    ancho_m = alto_m * 334 / 780
    if P is not CLARO:
        c.gradiente_radial("plato", [("0", "#4C2B3B", "1"), ("0.72", "#432635", "0.75"), ("1", "#3A2331", "0")])
        c.elipse(620, 320, 250, 252, "url(#plato)")
    c.circulo(620, 330, 122, P["rosa_palido"], opacidad=0.55)
    c.circulo(620, 330, 122, "none", trazo=P["rosa_claro"], grosor=2.5, opacidad=0.9)
    ornamento(c, 486, 150, 13, P["crema"], giro=12)
    ornamento(c, 724, 128, 10, P["rosa"], giro=30, opacidad=0.8)
    c.agrega(corazon(740, 252, 8, P["rosa"], opacidad=0.8))
    c.agrega(corazon(492, 292, 7, P["rosa"], opacidad=0.6))
    c.imagen(MASCOTA, 620 - ancho_m / 2, 46, ancho_m, alto_m)
    ornamento(c, 508, 424, 9, P["menta"], giro=8, opacidad=0.85)
    ornamento(c, 728, 430, 11, P["crema"], giro=20, opacidad=0.8)
    return c.guardar(os.path.join(SALIDA, nombre))


# --------------------------------------------------------------------------
# DIVISOR + PIE
# --------------------------------------------------------------------------
def pie(P, c=None, mensaje="", y=0):
    # línea con corazón al centro
    if c is None:
        c = Lienzo(1200, 60, mensaje)
        c.rect(0, 0, 1200, 60, 0, P["fondo1"] if mensaje else "none")
    c.linea(360, y, 570, y, P["rosa_claro"], 2.5)
    c.linea(630, y, 840, y, P["rosa_claro"], 2.5)
    c.agrega(corazon(600, y - 6, 8, P["rosa"]))
    if mensaje:
        texto_centrado(c, nunito_suave, mensaje, 17, 600, y + 26, P["tinta_tenue"], 0.3)
    return c


def divisor(P, nombre):
    c = Lienzo(1200, 72, "divisor")
    c.linea(340, 36, 560, 36, P["rosa_claro"], 2.5)
    c.linea(640, 36, 860, 36, P["rosa_claro"], 2.5)
    c.agrega(corazon(600, 30, 9, P["rosa"]))
    c.agrega(estrella(566, 36, 7, P["menta"], giro=15))
    c.agrega(estrella(634, 36, 7, P["menta"], giro=15))
    return c.guardar(os.path.join(SALIDA, nombre))


def insignia(P, nombre, etiqueta, valor, color, icono_nombre=None):
    """Botón tipo píldora que se ve igual en tema claro y oscuro (tiene fondo propio)."""
    tam = 20
    ancho_txt = quicksand.ancho(etiqueta, tam, 0.2)
    ancho_val = baloo_med.ancho(valor, tam + 3, 0.2)
    w = 30 + (34 if icono_nombre else 0) + ancho_txt + 14 + ancho_val + 30
    h = 52
    c = Lienzo(w, h, etiqueta + " " + valor)
    c.rect(0, 0, w, h, 16, P["tarjeta"], trazo=P["borde"], grosor=1.5)
    x = 22
    if icono_nombre:
        c.circulo(x + 12, h / 2, 15, P["rosa_palido"])
        c.agrega(icono(icono_nombre, x + 12, h / 2, 8, color, grosor=2))
        x += 40
    texto(c, quicksand, etiqueta, tam, x, h / 2 + quicksand.alto(tam, "cap") / 2, P["tinta_suave"], 0.2)
    texto(c, baloo_med, valor, tam + 3, x + ancho_txt + 14, h / 2 + baloo_med.alto(tam + 3, "cap") / 2,
          color, 0.2)
    return c.guardar(os.path.join(SALIDA, nombre))


# --------------------------------------------------------------------------
# --------------------------------------------------------------------------
# TARJETAS DE SECCIÓN
# --------------------------------------------------------------------------
def marco(P, c, titulo, subtitulo, chip_txt=None, chip_color=None, alto=330, ancho=1160):
    """Cabecera común de las tarjetas de sección."""
    c.rect(0, 0, ancho, alto, 28, P["tarjeta"], filtro="sombra",
           trazo=P["borde"] if P is not CLARO else None, grosor=1.4)
    c.rect(0, 0, ancho, 8, 4, P["rosa"])
    texto(c, quicksand, titulo, 26, 40, 62 + quicksand.alto(26, "cap") / 2, P["tinta"], tracking=0.6)
    ancho_t = quicksand.ancho(titulo, 26, 0.6)
    texto(c, nunito_suave, subtitulo, 17, 40 + ancho_t + 14, 62 + nunito_suave.alto(17, "cap") / 2,
          P["tinta_tenue"], tracking=0.2)
    if chip_txt:
        w = chip(None, 0, 0, 38, chip_txt, P, fuente=quicksand, tam=15)
        chip(c, ancho - 40 - w, 62, 38, chip_txt, P, fuente=quicksand, color=P["tinta"],
             fondo=P["rosa_palido"], tam=15)
    c.linea(40, 92, ancho - 40, 92, P["borde"], 1.4)


def tarjeta_comandos(P, nombre):
    c = Lienzo(1160, 330, "%d comandos en %d categorías" % (C, CAT))
    marco(P, c, "%d comandos" % C, "cargados por el cargador dinámico · 0 errores",
          "%d categorías" % CAT, P["rosa"], 330)
    categorias = [
        ("Grupos", 30), ("Economía", 29), ("Bot y sesión", 25), ("Gacha", 24), ("Utilidades", 24),
        ("Stickers", 17), ("Descargas", 16), ("Perfil", 14), ("Menú e info", 8), ("Dueño", 7),
        ("NSFW", 6), ("Anime", 4), ("Juegos", 4), ("Audio", 1), ("Diversión", 1),
    ]
    colores = [P["rosa"], P["menta"], P["crema"]]
    cw, ch, sep = 204, 62, 14
    for i, (cat, n) in enumerate(categorias):
        fila, col = divmod(i, 5)
        x = 40 + col * (cw + sep)
        y = 112 + fila * (ch + sep)
        color = colores[i % 3]
        c.rect(x, y, cw, ch, 16, P["fondo1"] if P is CLARO else P["fondo3"], trazo=P["borde"], grosor=1.2)
        texto(c, quicksand, cat, 17, x + 18, y + 28, P["tinta"], tracking=0.2)
        texto(c, baloo_med, str(n), 22, x + cw - 18 - baloo_med.ancho(str(n), 22, 0.2), y + 44, color, tracking=0.2)
        c.rect(x + 18, y + 44, 34, 5, 2.5, color, opacidad=0.85)
    return c.guardar(os.path.join(SALIDA, nombre))


def tarjeta_antiban(P, nombre):
    c = Lienzo(1160, 330, "anti-ban: jitter gaussiano y calentamiento")
    marco(P, c, "anti-ban de verdad", "no un delay aleatorio suelto", "riesgo 0-100", P["menta"], 330)

    # --- curva gaussiana (los tiempos de espera)
    bx, by, bw, bh = 40, 300, 520, 150
    puntos = []
    import math
    for i in range(0, bw + 1, 4):
        t = (i / bw - 0.5) * 6.0
        g = math.exp(-(t * t) / (2 * 0.25 ** 2))
        puntos.append((bx + i, by - g * bh))
    d = "M %s L %s L %s Z" % (
        " L ".join("%s %s" % (formato(x), formato(y)) for x, y in puntos), formato(bx + bw), formato(by))
    c.gradiente_lineal("curva", [("0", P["rosa"], "0.55"), ("1", P["menta"], "0.35")], x1=0, y1=0, x2=1, y2=0)
    c.camino(d, "url(#curva)")
    c.camino("M " + " L ".join("%s %s" % (formato(x), formato(y)) for x, y in puntos),
             "none", trazo=P["rosa_fuerte"], grosor=3)
    c.linea(bx, by, bx + bw, by, P["borde"], 2)
    c.linea(bx + bw / 2, by - bh - 14, bx + bw / 2, by, P["tinta_tenue"], 1.6, guiones="5 6")
    texto(c, quicksand, "σ 0.25", 18, bx + bw / 2 + 12, by - bh - 22, P["rosa_fuerte"], tracking=0.4)
    texto(c, nunito_suave, "los retardos siguen una distribución natural (Box-Muller)", 14, bx, by + 22, P["tinta_tenue"], tracking=0.2)

    # --- calentamiento 20 → 500
    x0, y0 = 600, 126
    texto(c, quicksand, "calentamiento diario", 18, x0, y0, P["tinta"], tracking=0.2)
    ancho = 120 + 320
    c.rect(x0, y0 + 18, 320, 14, 7, P["rosa_palido"])
    c.rect(x0, y0 + 18, 320 * 0.42, 14, 7, P["menta"])
    texto(c, mono, "20", 15, x0, y0 + 54, P["tinta_suave"], tracking=0.2)
    texto(c, mono, "500 msg/día", 15, x0 + 320 - mono.ancho("500 msg/día", 15, 0.2), y0 + 54, P["menta"], tracking=0.2)

    filas = [
        ("jitter", "gaussiano σ 0.25 · base 1200 ms", P["rosa"]),
        ("perfil del número", "nuevo 1500 ms · veterano 700 ms", P["menta"]),
        ("contacto nuevo", "×1.5 de espera, como una persona", P["crema"]),
        ("monitor de riesgo", "0-100 · pausa los envíos solo", P["rosa"]),
        ("regla de oro", "solo responde: nunca inicia chat", P["menta"]),
    ]
    yy = 200
    for etiqueta, valor, color in filas:
        c.circulo(x0 + 6, yy - 5, 5, color)
        texto(c, quicksand, etiqueta, 16, x0 + 22, yy, P["tinta"], tracking=0.2)
        ancho_et = quicksand.ancho(etiqueta, 16, 0.2)
        texto(c, nunito_suave, valor, 15, x0 + 34 + ancho_et, yy, P["tinta_suave"], tracking=0.2)
        yy += 28
    return c.guardar(os.path.join(SALIDA, nombre))


def tarjeta_panel(P, nombre):
    c = Lienzo(1160, 330, "panel local en 127.0.0.1:3000")
    marco(P, c, "panel local", "solo escucha en tu máquina por defecto", "127.0.0.1:3000", P["rosa"], 330)

    # --- mock de la ventana del panel
    px, py, pw, ph = 40, 116, 660, 180
    c.rect(px, py, pw, ph, 20, P["terminal"], filtro="sombra-suave")
    c.rect(px + 1.5, py + 1.5, pw - 3, ph - 3, 19, "none", trazo=P["terminal_linea"], grosor=1.4)
    for i, color in enumerate([P["rosa"], P["crema"], P["menta"]]):
        c.circulo(px + 26 + i * 18, py + 24, 6, color)
    texto(c, mono, "GET /health", 14, px + 96, py + 29, P["terminal_suave"], tracking=0.2)
    c.linea(px + 20, py + 44, px + pw - 20, py + 44, P["terminal_linea"], 1.4)

    barras = [
        ("riesgo", 12, P["menta"], "12/100"),
        ("cola de envío", 34, P["crema"], "3 en fila"),
        ("grupos", 68, P["rosa"], "17 conectados"),
        ("memoria", 46, P["menta"], "212 MB"),
    ]
    yy = py + 74
    for etiqueta, valor, color, nota in barras:
        texto(c, mono, etiqueta, 14, px + 24, yy, P["terminal_suave"], tracking=0.2)
        c.rect(px + 168, yy - 11, 300, 12, 6, P["terminal_linea"])
        c.rect(px + 168, yy - 11, 300 * valor / 100, 12, 6, color)
        texto(c, mono, nota, 14, px + pw - 24 - mono.ancho(nota, 14, 0.2), yy, color, tracking=0.2)
        yy += 30

    # --- rutas a la derecha
    rx = 740
    rutas = [
        ("/", "estado general"),
        ("/health", "riesgo, cola, grupos, memoria"),
        ("/metrics", "métricas del proceso"),
    ]
    yy = 132
    for ruta, desc in rutas:
        c.rect(rx, yy - 22, 380, 46, 14, P["fondo1"] if P is not CLARO else P["fondo3"], trazo=P["borde"], grosor=1.2)
        texto(c, mono, ruta, 17, rx + 18, yy + 4, P["rosa_fuerte"], tracking=0.2)
        texto(c, nunito_suave, desc, 15, rx + 140, yy + 4, P["tinta_suave"], tracking=0.2)
        yy += 58
    texto(c, nunito_suave, "LOOPBACK=0 exige PANEL_PASSWORD (admin) y bloquea", 14, rx, 300,
          P["tinta_tenue"], tracking=0.2)
    texto(c, nunito_suave, "la fuerza bruta: 10 intentos por IP → 5 minutos de espera.", 14, rx, 320,
          P["tinta_tenue"], tracking=0.2)
    return c.guardar(os.path.join(SALIDA, nombre))


if __name__ == "__main__":
    os.makedirs(SALIDA, exist_ok=True)
    hero(CLARO, "hero-claro.svg")
    hero(oscura(CLARO), "hero-oscuro.svg")
    divisor(CLARO, "divisor-claro.svg")
    divisor(oscura(CLARO), "divisor-oscuro.svg")

    insignias = [
        ("insignia-pruebas.svg", "pruebas", "%d/%d" % (P_, D["pruebas_total"]), CLARO["menta"], "escudo"),
        ("insignia-comandos.svg", "comandos", "%d" % C, CLARO["crema"], "rayo"),
        ("insignia-nodo.svg", "node", "≥ %s" % D["node"], CLARO["menta"], "engrane"),
        ("insignia-baileys.svg", "baileys", "%s" % D["baileys"], CLARO["rosa"], "chat"),
        ("insignia-licencia.svg", "licencia", D["licencia"].replace("-only", ""), CLARO["crema"], "marcador"),
        ("insignia-termux.svg", "termux", "listo", CLARO["menta"], "personas"),
        ("insignia-panel.svg", "panel", "/metrics", CLARO["rosa"], "escudo"),
    ]
    for archivo, etiqueta, valor, color, icono_nombre in insignias:
        insignia(CLARO, archivo, etiqueta, valor, color, icono_nombre)

    for tema, sufijo in ((CLARO, "claro"), (oscura(CLARO), "oscuro")):
        tarjeta_comandos(tema, "seccion-comandos-%s.svg" % sufijo)
        tarjeta_antiban(tema, "seccion-antiban-%s.svg" % sufijo)
        tarjeta_panel(tema, "seccion-panel-%s.svg" % sufijo)

    d = Lienzo(1200, 60, "pie")
    pie(CLARO, d, "反魂 Shin-MD · hecho para quedarse encendido")
    d.guardar(os.path.join(SALIDA, "pie-claro.svg"))
    d2 = Lienzo(1200, 60, "pie")
    pie(oscura(CLARO), d2, "反魂 Shin-MD · hecho para quedarse encendido")
    d2.guardar(os.path.join(SALIDA, "pie-oscuro.svg"))

    print("\nnúmeros usados: %d comandos · %d nombres (%d alias) · %d categorías · "
          "%d pruebas · v%s" % (C, N, A, CAT, P_, V))
    print("origen: %s" % D["origen"])

    for archivo in sorted(os.listdir(SALIDA)):
        print("%8.1f KB  %s" % (os.path.getsize(os.path.join(SALIDA, archivo)) / 1024, archivo))
