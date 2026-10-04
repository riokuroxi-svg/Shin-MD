# -*- coding: utf-8 -*-
"""
pastel_lienzo — el sistema de diseño del README pastel de Shin-MD.

Reglas del sistema:
  1. Cada pieza es autocontenida: lleva su propio fondo pastel. Así se ve
     EXACTAMENTE igual en tema claro y en tema oscuro de GitHub (y sobrevive al
     "modo oscuro forzado" de Chrome en Android, que apaga los colores).
  2. Nada de fuentes externas: todo el texto va a trazado vectorial.
  3. Colores saturados a propósito: el pastel con color de verdad, no lavado.
  4. Todo se mide antes de dibujarse (anchos reales) para que nada se encime.
"""
import os
import sys

import sys as _sys

AQUI = os.path.dirname(os.path.abspath(__file__))
_sys.path.insert(0, AQUI)
from svgkit import Fuente, Lienzo, corazon, esc, estrella, formato, icono, uri_imagen  # noqa: E402

FUENTES = os.path.join(AQUI, "fuentes")
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, "docs", "assets", "pastel")

# --------------------------------------------------------------------------
# paleta única (saturada, para claro y oscuro)
# --------------------------------------------------------------------------
P = dict(
    canvas1="#FFDCEB", canvas2="#FFF1F7", canvas3="#DDF6EB",
    tinta="#3B1F2B", tinta_suave="#87687A", tinta_tenue="#B08FA0",
    rosa="#EE3D86", rosa_fuerte="#C9246A", rosa_claro="#FFB9D5", rosa_palido="#FFE3EF",
    menta="#1FAE7F", menta_claro="#BFEBD9",
    ambar="#E8890C", ambar_claro="#FFE3BC",
    blanco="#FFFFFF", tarjeta="#FFFAFC", tarjeta2="#FFF2F7",
    borde="#F6CFDF",
    terminal="#2F1A24", terminal_texto="#FFF2F7", terminal_suave="#C9A5B4", terminal_linea="#4E2B3A",
    sombra="#C97BA0",
)

ANCHO = 1160          # ancho de todas las piezas de sección
PAD = 40              # margen interior
RADIO = 28

# --------------------------------------------------------------------------
# fuentes
# --------------------------------------------------------------------------
RESPALDO = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"   # sigma, ✓, →, ≥, ×, « »
baloo = Fuente(os.path.join(FUENTES, "Baloo2.ttf"), peso=800, respaldo=RESPALDO)
baloo_med = Fuente(os.path.join(FUENTES, "Baloo2.ttf"), peso=600, respaldo=RESPALDO)
nunito = Fuente(os.path.join(FUENTES, "Nunito.ttf"), peso=700, respaldo=RESPALDO)
nunito_med = Fuente(os.path.join(FUENTES, "Nunito.ttf"), peso=600, respaldo=RESPALDO)
nunito_suave = Fuente(os.path.join(FUENTES, "Nunito.ttf"), peso=500, respaldo=RESPALDO)
quicksand = Fuente(os.path.join(FUENTES, "Quicksand.ttf"), peso=600, respaldo=RESPALDO)
quicksand_suave = Fuente(os.path.join(FUENTES, "Quicksand.ttf"), peso=500, respaldo=RESPALDO)
mono = Fuente("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")
cjk = Fuente("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", familia_cjk="Noto Sans CJK JP")

MASCOTA = uri_imagen(os.path.join(SALIDA, "mascota.png"))


# --------------------------------------------------------------------------
# números reales del bot
# --------------------------------------------------------------------------
import json  # noqa: E402

DATOS_DE_RESPALDO = dict(
    comandos=210, nombres=744, alias=534, categorias=15,
    pruebas=140, pruebas_total=140, version="3.0.3",
    node="22.5", baileys="6.7.24", licencia="AGPL-3.0-only",
)


def cargar_datos():
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
        datos["origen"] = "respaldo en tools/pastel_lienzo.py"
    return datos


D = cargar_datos()
C, N, A = D["comandos"], D["nombres"], D["alias"]
PR, CAT, V = D["pruebas"], D["categorias"], D["version"]


# --------------------------------------------------------------------------
# helpers de dibujo
# --------------------------------------------------------------------------
def texto(c, fuente, txt, tam, x, base, color, tracking=0.0, opacidad=None):
    d = fuente.trazado(txt, tam, x, base, tracking)
    if d:
        c.camino(d, color, opacidad=opacidad)
    return fuente.ancho(txt, tam, tracking)


def texto_centrado(c, fuente, txt, tam, cx, base, color, tracking=0.0, opacidad=None):
    ancho = fuente.ancho(txt, tam, tracking)
    texto(c, fuente, txt, tam, cx - ancho / 2, base, color, tracking, opacidad)
    return ancho


def bloque(c, fuente, txt, tam, x, base_primera, color, ancho_max, interlineado=None,
           tracking=0.2, opacidad=None, limite=None):
    """Texto en varias líneas. Devuelve la altura total usada."""
    interlineado = interlineado or tam * 1.38
    lineas = fuente.envolver(txt, tam, ancho_max, tracking)
    if limite:
        lineas = lineas[:limite]
    y = base_primera
    for linea in lineas:
        texto(c, fuente, linea, tam, x, y, color, tracking, opacidad)
        y += interlineado
    return y - base_primera


def chip(c, x, cy, h, txt, fondo=None, color=None, borde=None, fuente=None, tam=None,
         icono_nombre=None, icono_color=None, solo_medir=False):
    fuente = fuente or quicksand
    fondo = fondo if fondo is not None else P["blanco"]
    color = color or P["tinta"]
    tam = tam or h * 0.44
    izq = h * 0.66
    ancho_icono = (h * 0.7 + 10) if icono_nombre else 0
    ancho_txt = fuente.ancho(txt, tam, 0.2)
    w = izq * 2 + ancho_icono + ancho_txt
    if solo_medir:
        return w
    c.rect(x, cy - h / 2, w, h, h / 2, fondo, trazo=borde, grosor=1.4 if borde else 0)
    if icono_nombre:
        c.agrega(icono(icono_nombre, x + izq + h * 0.35, cy, h * 0.27, icono_color or color,
                       grosor=max(1.6, h * 0.07)))
    texto(c, fuente, txt, tam, x + izq + ancho_icono, cy + fuente.alto(tam, "cap") / 2, color, 0.2)
    return w


def adorno(c, x, y, tam, color, giro=0, opacidad=0.9):
    c.agrega(estrella(x, y, tam, color, giro=giro, opacidad=opacidad))


def lienzo(alto, etiqueta, degradado=True, nombre_grad="g"):
    """Lienzo de sección con el fondo pastel y el borde redondeado."""
    c = Lienzo(ANCHO, alto, etiqueta)
    if degradado:
        c.gradiente_lineal(nombre_grad, [("0", P["canvas1"]), ("0.45", P["canvas2"]), ("1", P["canvas3"])],
                           x1=0, y1=0, x2=1, y2=1)
        c.sombra("sh", dy=6, desenfoque=12, color=P["sombra"], opacidad=0.28)
        c.rect(0, 0, ANCHO, alto, RADIO, "url(#%s)" % nombre_grad)
        c.rect(PAD, PAD, ANCHO - PAD * 2, alto - PAD * 2, RADIO - 8, P["tarjeta"], opacidad=0.72)
    return c


# --------------------------------------------------------------------------
# banner de sección
# --------------------------------------------------------------------------
def banner(numero, titulo, subtitulo, icono_nombre, color, etiqueta=None):
    alto = 108
    c = Lienzo(ANCHO, alto, etiqueta or titulo)
    c.gradiente_lineal("gb", [("0", P["canvas1"]), ("0.5", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.gradiente_lineal("gi", [("0", color), ("1", P["rosa_fuerte"])], x1=0, y1=0, x2=1, y2=1)
    c.sombra("shb", dy=5, desenfoque=11, color=P["sombra"], opacidad=0.30)
    c.rect(0, 0, ANCHO, alto, RADIO, "url(#gb)", filtro="shb")
    c.rect(0, 0, ANCHO, 10, 5, "url(#gi)")
    c.rect(PAD, PAD * 0.75, ANCHO - PAD * 2, alto - PAD * 1.5, RADIO - 10, P["tarjeta"], opacidad=0.85)

    # icono
    cir = 62
    c.circulo(PAD + 44, alto / 2, cir / 2, color, opacidad=0.16)
    c.circulo(PAD + 44, alto / 2, cir / 2, "none", trazo=color, grosor=2, opacidad=0.55)
    c.agrega(icono(icono_nombre, PAD + 44, alto / 2, 15, color, grosor=2.6))

    # número de sección (a la derecha)
    num_txt = "%02d" % numero if isinstance(numero, int) else str(numero)
    ancho_num = baloo.ancho(num_txt, 40, -0.5)
    texto(c, baloo, num_txt, 40, ANCHO - PAD - 30 - ancho_num, alto / 2 + 14, color, -0.5, opacidad=0.9)
    c.linea(ANCHO - PAD - 30 - ancho_num - 16, alto / 2 - 20, ANCHO - PAD - 30 - ancho_num - 16,
            alto / 2 + 20, P["borde"], 2)

    # título y subtítulo
    x = PAD + 92
    tam_t = 33
    texto(c, baloo_med, titulo, tam_t, x, alto / 2 + baloo_med.alto(tam_t, "cap") / 2, P["tinta"], -0.3)
    ancho_t = baloo_med.ancho(titulo, tam_t, -0.3)
    if subtitulo:
        texto(c, nunito_suave, subtitulo, 17, x + ancho_t + 16,
              alto / 2 + nunito_suave.alto(17, "cap") / 2, P["tinta_tenue"], 0.2)
    adorno(c, ANCHO - PAD - 190, alto / 2 - 16, 9, P["ambar"], giro=12, opacidad=0.85)
    adorno(c, ANCHO - PAD - 214, alto / 2 + 18, 7, P["menta"], giro=30, opacidad=0.8)
    return c


def subbanner(titulo, subtitulo, icono_nombre, color):
    """Banner pequeño para los subapartados (Termux, VPS...)."""
    alto = 84
    c = Lienzo(ANCHO, alto, titulo)
    c.rect(0, 0, ANCHO, alto, 22, P["tarjeta2"], trazo=P["borde"], grosor=1.6)
    c.rect(0, 0, 8, alto, 4, color)
    c.circulo(PAD + 26, alto / 2, 21, color, opacidad=0.16)
    c.agrega(icono(icono_nombre, PAD + 26, alto / 2, 12, color, grosor=2.4))
    x = PAD + 60
    texto(c, quicksand, titulo, 25, x, alto / 2 + quicksand.alto(25, "cap") / 2, P["tinta"], 0.2)
    ancho_t = quicksand.ancho(titulo, 25, 0.2)
    texto(c, nunito_suave, subtitulo, 16, x + ancho_t + 14,
          alto / 2 + nunito_suave.alto(16, "cap") / 2, P["tinta_tenue"], 0.2)
    return c


# --------------------------------------------------------------------------
# tabla
# --------------------------------------------------------------------------
def tabla(columnas, filas, acentos, etiqueta, alto_fila=52, alto_enc=44, pie=None, titulo=None):
    """Tabla pastel. El texto se envuelve solo: ninguna celda se desborda.

    columnas: [(x, ancho, titulo)] · filas: [[celda, ...]] · acentos: color por fila.
    """
    # 1) medir: cuántas líneas necesita cada celda y el alto real de cada fila
    medidas = []
    for fila in filas:
        celdas = []
        for (x, ancho, _), celda in zip(columnas, fila):
            es_primera = (x == columnas[0][0])
            fuente = quicksand if es_primera else nunito_suave
            tam = 17 if es_primera else 16.5
            lineas = fuente.envolver(celda, tam, ancho - 10, 0.2)
            celdas.append((lineas, fuente, tam, es_primera))
        alto_r = max(alto_fila, max(len(c[0]) for c in celdas) * 22 + 26)
        medidas.append((celdas, alto_r))

    alto = 24 + (50 if titulo else 0) + alto_enc + 8 + sum(m[1] + 8 for m in medidas)
    if pie:
        alto += 14 + 22 * len(pie)
    alto += 26

    c = Lienzo(ANCHO, alto, etiqueta)
    c.gradiente_lineal("gt", [("0", P["canvas1"]), ("0.5", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.sombra("sht", dy=6, desenfoque=12, color=P["sombra"], opacidad=0.26)
    c.rect(0, 0, ANCHO, alto, RADIO, "url(#gt)", filtro="sht")
    c.rect(0, 0, ANCHO, 10, 5, P["rosa"])

    y = 14
    if titulo:
        texto(c, quicksand, titulo, 25, PAD, y + 34, P["tinta"], 0.3)
        ancho_t = quicksand.ancho(titulo, 25, 0.3)
        texto(c, nunito_suave, etiqueta, 16, PAD + ancho_t + 14, y + 34, P["tinta_tenue"], 0.2)
        y += 50
    else:
        y += 8

    c.rect(PAD, y, ANCHO - PAD * 2, alto_enc, 14, P["rosa_palido"])
    for x, ancho, titulo_col in columnas:
        texto(c, quicksand, titulo_col.upper(), 15, PAD + x, y + alto_enc / 2 + 5, P["rosa_fuerte"], 1.4)
    y += alto_enc + 8

    for i, ((celdas, alto_r), color_acento) in enumerate(zip(medidas, acentos)):
        c.rect(PAD, y, ANCHO - PAD * 2, alto_r, 14,
               P["tarjeta"] if i % 2 == 0 else P["tarjeta2"], trazo=P["borde"], grosor=1.2)
        c.rect(PAD + 6, y + 10, 7, alto_r - 20, 3.5, color_acento)
        for (x, ancho, _), (lineas, fuente, tam, es_primera) in zip(columnas, celdas):
            color = P["tinta"] if es_primera else P["tinta_suave"]
            base = y + (alto_r - len(lineas) * 22) / 2 + 16
            for linea in lineas:
                texto(c, fuente, linea, tam, PAD + x, base, color, 0.2)
                base += 22
        y += alto_r + 8

    if pie:
        y += 6
        for linea in pie:
            texto(c, nunito_suave, linea, 15, PAD, y + 14, P["tinta_tenue"], 0.2)
            y += 22
    return c


def tarjeta_lista(elementos, etiqueta, columnas=2, titulo=None, subtitulo=None,
                  ancho_tarjeta=None, alto_min=None, alto_elemento=104, tam_titulo=20):
    """Rejilla de tarjetas con icono + título + texto envuelto."""
    sep_x, sep_y = 22, 16
    doble = 2 * PAD + sep_x
    ancho_t = ancho_tarjeta or (ANCHO - doble) // columnas
    ancho_texto = ancho_t - 92
    lineas_por_item = []
    for el in elementos:
        lineas = nunito_suave.envolver(el["texto"], 16, ancho_texto, 0.2)
        lineas_por_item.append(lineas)
    alto_e = alto_elemento
    filas = (len(elementos) + columnas - 1) // columnas
    alto = 24 + (50 if titulo else 0) + filas * alto_e + (filas - 1) * sep_y + 24
    if alto_min:
        alto = max(alto, alto_min)

    c = Lienzo(ANCHO, alto, etiqueta)
    c.gradiente_lineal("gl", [("0", P["canvas1"]), ("0.5", P["canvas2"]), ("1", P["canvas3"])],
                       x1=0, y1=0, x2=1, y2=1)
    c.sombra("shl", dy=6, desenfoque=12, color=P["sombra"], opacidad=0.26)
    c.rect(0, 0, ANCHO, alto, RADIO, "url(#gl)", filtro="shl")
    c.rect(0, 0, ANCHO, 10, 5, P["menta"])

    y = 24
    if titulo:
        texto(c, quicksand, titulo, 26, PAD, y + 32, P["tinta"], 0.3)
        ancho_ti = quicksand.ancho(titulo, 26, 0.3)
        if subtitulo:
            texto(c, nunito_suave, subtitulo, 16, PAD + ancho_ti + 14, y + 32, P["tinta_tenue"], 0.2)
        y += 50

    for i, el in enumerate(elementos):
        col, fil = i % columnas, i // columnas
        x = PAD + col * (ancho_t + sep_x)
        yy = y + fil * (alto_e + sep_y)
        c.rect(x, yy, ancho_t, alto_e, 18, P["tarjeta"], trazo=P["borde"], grosor=1.3)
        c.circulo(x + 44, yy + 40, 22, el["color"], opacidad=0.15)
        c.circulo(x + 44, yy + 40, 22, "none", trazo=el["color"], grosor=1.8, opacidad=0.5)
        c.agrega(icono(el["icono"], x + 44, yy + 40, 13, el["color"], grosor=2.4))
        texto(c, quicksand, el["titulo"], tam_titulo, x + 80, yy + 40 + quicksand.alto(tam_titulo, "cap") / 2,
              P["tinta"], 0.2)
        base = yy + 68
        for linea in lineas_por_item[i][:3]:
            texto(c, nunito_suave, linea, 16, x + 80, base, P["tinta_suave"], 0.2)
            base += 21
    return c


def guardar(c, nombre):
    ruta = os.path.join(SALIDA, nombre)
    c.guardar(ruta)
    print("%8.1f KB  %s" % (os.path.getsize(ruta) / 1024, nombre))
